/**
 * ImagePlugin：图片生成插件。
 *
 * 关键点（中文）
 * - 对 Agent 暴露 `image_create` / `image_result` 两步式任务 action。
 * - City / provider 的图片能力通过 image_create / image_result 任务函数注入。
 * - 成功结果返回 AI SDK UIMessage，后续由 plugin tool bridge 抽取 file parts 写回 assistant 消息。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createAction } from "@downcity/agent/internal/plugin/core/PluginActionFactory.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent/internal/types/common/Json.js";
import type {
  ImagePluginInput,
  ImagePluginJobCreateResult,
  ImagePluginJobResult,
  ImagePluginJobResultInput,
  ImagePluginContent,
  ImagePluginModel,
  ImagePluginModelsResult,
  ImagePluginOptions,
  ImagePluginResolvedContent,
  ImagePluginResolvedInput,
  ImagePluginResult,
} from "@/image/types/ImagePlugin.js";

const DEFAULT_IMAGE_PLUGIN_NAME = "image";
const DEFAULT_IMAGE_PLUGIN_TITLE = "Image";
const DEFAULT_IMAGE_PLUGIN_DESCRIPTION =
  "Generate images and return them as assistant file parts.";
const HTTP_URL_RE = /^https?:\/\//i;
const DEFAULT_IMAGE_MEDIA_TYPE = "image/png";

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const IMAGE_TEXT_CONTENT_SCHEMA = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const IMAGE_FILE_CONTENT_SCHEMA = z.object({
  type: z.literal("image"),
  url: z.string(),
  media_type: z.string().optional(),
});

const IMAGE_CREATE_INPUT_SCHEMA = z.object({
  model: z.string().optional(),
  prompt: z.string().optional(),
  content: z.array(z.union([
    IMAGE_TEXT_CONTENT_SCHEMA,
    IMAGE_FILE_CONTENT_SCHEMA,
  ])).optional(),
  n: z.number().optional(),
  count: z.number().optional(),
  size: z.string().optional(),
  aspect_ratio: z.string().optional(),
  ratio: z.string().optional(),
  quality: z.string().optional(),
  seed: z.number().optional(),
  client_job_id: z.string().optional(),
  provider_options: z.object({}).passthrough().optional(),
}).passthrough();

const IMAGE_RESULT_INPUT_SCHEMA = z.object({
  job_id: z.string(),
}).passthrough();

/**
 * 判断值是否为普通对象。
 */
function to_record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * 归一化模型传入的图片生成 payload。
 */
function normalize_image_payload(
  payload: JsonValue | undefined,
): ImagePluginInput {
  const record = to_record(payload ?? {});
  if (!record) {
    throw new TypeError("ImagePlugin image payload must be an object");
  }
  return { ...record } as ImagePluginInput;
}

/**
 * 根据文件扩展名推断图片 MIME 类型。
 */
function infer_image_media_type(file_path: string, fallback?: string): string {
  if (fallback && fallback.trim()) return fallback.trim();
  const ext = path.extname(file_path).toLowerCase();
  return IMAGE_MEDIA_TYPES[ext] ?? DEFAULT_IMAGE_MEDIA_TYPE;
}

/**
 * 解析图片本地路径。
 */
function resolve_image_file_path(root_path: string, image_url: string): string {
  const raw = image_url.trim();
  if (!raw) throw new TypeError("ImagePlugin image content url is required");
  return path.isAbsolute(raw) ? raw : path.resolve(root_path, raw);
}

/**
 * 把本地图片读取为 data URL。
 */
async function local_image_to_data_url(input: {
  /**
   * 当前 Agent 项目根目录。
   */
  root_path: string;
  /**
   * 本地绝对路径或相对路径。
   */
  image_url: string;
  /**
   * 可选 MIME 类型。
   */
  media_type?: string;
}): Promise<{ data_url: string; media_type: string }> {
  const file_path = resolve_image_file_path(input.root_path, input.image_url);
  const media_type = infer_image_media_type(file_path, input.media_type);
  const bytes = await fs.readFile(file_path);
  return {
    data_url: `${media_type.includes("/") ? `data:${media_type};base64,` : "data:image/png;base64,"}${bytes.toString("base64")}`,
    media_type,
  };
}

/**
 * 归一化单个图片内容片段。
 */
async function normalize_image_content_part(
  context: AgentContext,
  part: ImagePluginContent,
): Promise<ImagePluginResolvedContent> {
  if (part.type === "text") return part;
  const url = String(part.url || "").trim();
  if (!url) throw new TypeError("ImagePlugin image content url is required");
  if (url.startsWith("data:")) {
    throw new TypeError(
      "ImagePlugin content image url does not accept data URLs; pass an online URL or a local file path",
    );
  }
  if (HTTP_URL_RE.test(url)) {
    return {
      type: "image",
      url,
      ...(part.media_type ? { media_type: part.media_type } : {}),
    };
  }
  const local = await local_image_to_data_url({
    root_path: context.rootPath,
    image_url: url,
    media_type: part.media_type,
  });
  return {
    type: "image",
    data_url: local.data_url,
    media_type: local.media_type,
  };
}

/**
 * 拒绝旧版或内部协议字段，避免 Agent 继续依赖兼容层。
 */
function assert_public_image_create_input(input: ImagePluginInput): void {
  const record = input as Record<string, unknown>;
  if ("messages" in record) {
    throw new TypeError("ImagePlugin image_create uses prompt or content; messages is not supported");
  }
  const content = record.content;
  if (!Array.isArray(content)) return;
  for (const part of content) {
    const part_record = to_record(part);
    if (part_record && "data_url" in part_record) {
      throw new TypeError(
        "ImagePlugin content image uses url only; data_url is not supported",
      );
    }
  }
}

/**
 * 复制公开输入中的通用字段，剥离 Agent 不应传给下游的公开 content。
 */
function copy_resolved_image_input(input: ImagePluginInput): ImagePluginResolvedInput {
  const { content: _content, messages: _messages, ...rest } = input as ImagePluginInput & {
    /** 旧版字段，显式丢弃。 */
    messages?: unknown;
  };
  return rest as ImagePluginResolvedInput;
}

/**
 * 把 Agent 友好的公开输入转成 City 图片任务使用的输入。
 */
async function normalize_image_create_input(
  context: AgentContext,
  input: ImagePluginInput,
): Promise<ImagePluginResolvedInput> {
  assert_public_image_create_input(input);
  if (!Array.isArray(input.content)) return copy_resolved_image_input(input);
  const content = await Promise.all(
    input.content.map((part) => normalize_image_content_part(context, part)),
  );
  const { prompt: _prompt, ...rest } = copy_resolved_image_input(input);
  return {
    ...rest,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  };
}

/**
 * 归一化图片任务查询 payload。
 */
function normalize_image_result_payload(
  payload: JsonValue | undefined,
): ImagePluginJobResultInput {
  const record = to_record(payload ?? {});
  if (!record) {
    throw new TypeError("ImagePlugin.image_result payload must be an object");
  }
  const job_id = typeof record.job_id === "string" ? record.job_id.trim() : "";
  if (!job_id) {
    throw new TypeError("ImagePlugin.image_result payload must include job_id");
  }
  return {
    ...record,
    job_id,
  } as ImagePluginJobResultInput;
}

/**
 * 校验 image 函数返回的 UIMessage。
 */
function normalize_image_result(result: ImagePluginResult): ImagePluginResult {
  const record = to_record(result);
  if (!record || !Array.isArray(record.parts)) {
    throw new TypeError("ImagePlugin image provider must return an AI SDK UIMessage");
  }
  return result;
}

/**
 * 归一化模型元数据为 JSON 对象。
 */
function normalize_json_object(value: unknown): JsonObject | undefined {
  const record = to_record(value);
  if (!record) return undefined;
  return record as JsonObject;
}

/**
 * 归一化图片模型信息，确保 action 返回纯 JSON。
 */
function normalize_image_model(value: ImagePluginModel): ImagePluginModel | null {
  const record = to_record(value);
  if (!record) return null;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  const modalities = Array.isArray(record.modalities)
    ? record.modalities
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  if (!modalities.includes("image")) return null;
  const tags = Array.isArray(record.tags)
    ? record.tags.map((item) => String(item || "").trim()).filter(Boolean)
    : undefined;
  const default_modalities = Array.isArray(record.default_modalities)
    ? record.default_modalities
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : undefined;
  const meta = normalize_json_object(record.meta);
  return {
    id,
    name: typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : id,
    ...(typeof record.description === "string"
      ? { description: record.description }
      : {}),
    modalities,
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(meta ? { meta } : {}),
    ...(typeof record.is_default === "boolean"
      ? { is_default: record.is_default }
      : {}),
    ...(default_modalities && default_modalities.length > 0
      ? { default_modalities }
      : {}),
  };
}

/**
 * 归一化模型列表结果。
 */
function normalize_image_models(values: ImagePluginModel[]): ImagePluginModelsResult {
  const items = values
    .map((item) => normalize_image_model(item))
    .filter((item): item is ImagePluginModel => item !== null);
  const default_model_id =
    items.find((item) => item.default_modalities?.includes("image"))?.id ??
    items.find((item) => item.is_default)?.id ??
    items[0]?.id;
  return {
    items,
    ...(default_model_id ? { default_model_id } : {}),
  };
}

/**
 * 校验任务创建结果。
 */
function validate_created_job(value: ImagePluginJobCreateResult): void {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.job_id !== "string" ||
    !value.job_id.trim()
  ) {
    throw new TypeError("ImagePlugin image_create must return a job_id");
  }
}

/**
 * 校验任务查询结果。
 */
function validate_job_result(value: ImagePluginJobResult): void {
  const status = value?.status;
  if (
    status !== "queued" &&
    status !== "running" &&
    status !== "succeeded" &&
    status !== "failed"
  ) {
    throw new TypeError("ImagePlugin image_result must return a valid job status");
  }
}

/**
 * Agent 图片生成插件。
 */
export class ImagePlugin extends BasePlugin {
  /**
   * 当前 plugin 稳定名称。
   */
  readonly name: string;

  /**
   * 插件标题。
   */
  readonly title: string;

  /**
   * 插件说明。
   */
  readonly description: string;

  private readonly image_create: NonNullable<ImagePluginOptions["image_create"]>;
  private readonly image_result: NonNullable<ImagePluginOptions["image_result"]>;
  private readonly list_models?: ImagePluginOptions["list_models"];
  private default_model_id?: string;

  constructor(options: ImagePluginOptions) {
    super();
    const name = String(options.name || DEFAULT_IMAGE_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("ImagePlugin requires a non-empty name");
    }
    if (typeof options.image_create !== "function") {
      throw new Error("ImagePlugin requires an image_create function");
    }
    if (typeof options.image_result !== "function") {
      throw new Error("ImagePlugin requires an image_result function");
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_IMAGE_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_IMAGE_PLUGIN_DESCRIPTION,
    ).trim();
    this.image_create = options.image_create;
    this.image_result = options.image_result;
    this.list_models = options.list_models;
  }

  /**
   * 图片插件给模型的使用说明。
   */
  system(_context: AgentContext): string {
    return [
      "# Image Plugin",
      "",
      "Use this plugin only when the user asks to create or edit an image.",
      "Use `prompt` for text-only image generation.",
      "Use `content` for image editing or reference images: `[{ type: \"text\", text }, { type: \"image\", url }]`.",
      "If `content` is present, it is used instead of `prompt`.",
      "Do not pass `messages` or data URLs.",
      "`url` may be an online URL, an absolute local path, or a path relative to the Agent project root.",
      "Flow: call `models` if you need a model id, call `image_create`, then call `image_result` with `job_id`.",
      "If `image_result` returns `queued` or `running`, keep the `job_id` and check again later.",
    ].join("\n");
  }

  /**
   * 当调用方未显式指定模型时，使用模型目录中的图片默认模型。
   */
  private async with_default_model(
    input: ImagePluginResolvedInput,
  ): Promise<ImagePluginResolvedInput> {
    if (typeof input.model === "string" && input.model.trim()) return input;
    const default_model_id = await this.resolve_default_model_id();
    return default_model_id ? { ...input, model: default_model_id } : input;
  }

  private async resolve_default_model_id(): Promise<string | undefined> {
    if (this.default_model_id) return this.default_model_id;
    if (!this.list_models) return undefined;
    const result = normalize_image_models(await this.list_models());
    this.default_model_id = result.default_model_id;
    return this.default_model_id;
  }

  /**
   * 查询图片任务当前状态。
   */
  private async read_image_result(input: ImagePluginJobResultInput): Promise<ImagePluginJobResult> {
    const current = await this.image_result({ job_id: input.job_id });
    validate_job_result(current);
    if (current.status === "succeeded" && current.result) {
      normalize_image_result(current.result);
    }
    return current;
  }

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    models: createAction({
      description: "List image-capable models available to ImagePlugin.",
      input_schema: z.object({}).passthrough(),
      execute: async () => {
        try {
          if (!this.list_models) {
            return {
              success: false,
              error: "ImagePlugin list_models is not configured",
              message: "ImagePlugin list_models is not configured",
            };
          }
          const models = await this.list_models();
          const result = normalize_image_models(models);
          return {
            success: true,
            data: result as unknown as JsonObject,
            message: "image models listed",
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    }),
    image_create: createAction({
      description:
        "Create an async image job. Use prompt for text-only generation, or content for reference images and edits.",
      input_schema: {
        zod: IMAGE_CREATE_INPUT_SCHEMA,
        json_schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            model: { type: "string", description: "Image model id." },
            prompt: {
              type: "string",
              description: "Text-only image prompt. Ignored when content is present.",
            },
            content: {
              type: "array",
              description: "Multimodal content for image edits or reference images.",
              items: {
                oneOf: [
                  {
                    type: "object",
                    required: ["type", "text"],
                    properties: {
                      type: { const: "text" },
                      text: { type: "string" },
                    },
                  },
                  {
                    type: "object",
                    required: ["type", "url"],
                    properties: {
                      type: { const: "image" },
                      url: {
                        type: "string",
                        description:
                          "Online URL, absolute local path, or path relative to the Agent project root.",
                      },
                      media_type: { type: "string" },
                    },
                  },
                ],
              },
            },
            aspect_ratio: { type: "string", description: "Aspect ratio, for example 16:9." },
            size: { type: "string", description: "Image size, for example 1024x1024." },
            quality: { type: "string", description: "Image quality." },
            seed: { type: "number", description: "Random seed." },
          },
        },
      },
      examples: [
        {
          title: "Text-only image",
          payload: {
            prompt: "A cinematic illustration of a rainy city corner at night",
            aspect_ratio: "16:9",
          },
        },
        {
          title: "Edit image with local reference",
          payload: {
            content: [
              { type: "text", text: "Change this image to a white studio background" },
              { type: "image", url: "./input.png" },
            ],
          },
        },
      ],
      execute: async ({ context, payload }: { context: AgentContext; payload: JsonValue }) => {
        try {
          const input = normalize_image_payload(payload);
          const normalized_input = await normalize_image_create_input(context, input);
          const created = await this.image_create(await this.with_default_model(normalized_input));
          validate_created_job(created);
          return {
            success: true,
            data: created as unknown as JsonObject,
            message: "image job created",
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    }),
    image_result: createAction({
      description: "Read the current state of an async image job once.",
      input_schema: {
        zod: IMAGE_RESULT_INPUT_SCHEMA,
        json_schema: {
          type: "object",
          required: ["job_id"],
          properties: {
            job_id: {
              type: "string",
              description: "Image job id returned by image_create.",
            },
          },
        },
      },
      examples: [
        {
          title: "Read image job",
          payload: {
            job_id: "img_123",
          },
        },
      ],
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_result_payload(payload);
          const current = await this.read_image_result(input);
          if (current.status === "failed") {
            return {
              success: false,
              data: current as unknown as JsonObject,
              error: current.error ?? current.message ?? input.job_id,
              message: current.error ?? current.message ?? "image job failed",
            };
          }
          const data = current.status === "succeeded" && current.result
            ? current.result as unknown as JsonObject
            : current as unknown as JsonObject;
          return {
            success: true,
            data,
            message:
              current.status === "succeeded"
                ? "image generated"
                : `image job ${current.status}`,
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    }),
  };
}
