/**
 * ImagePlugin：图片生成插件。
 *
 * 关键点（中文）
 * - 对 Agent 只暴露同步体验的 `generate` action。
 * - City / provider 的图片能力通过 image_create / image_result 任务函数注入。
 * - action 返回 AI SDK UIMessage，后续由 plugin tool bridge 抽取 file parts 写回 assistant 消息。
 */

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
  ImagePluginOptions,
  ImagePluginResult,
} from "@/image/types/ImagePlugin.js";

const DEFAULT_IMAGE_PLUGIN_NAME = "image";
const DEFAULT_IMAGE_PLUGIN_TITLE = "Image";
const DEFAULT_IMAGE_PLUGIN_DESCRIPTION =
  "Generate images and return them as assistant file parts.";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MIN_POLL_INTERVAL_MS = 100;
const DEFAULT_MAX_POLL_INTERVAL_MS = 10_000;

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
 * 等待指定毫秒数。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 限制轮询间隔，避免服务端异常值导致过快或过慢轮询。
 */
function clamp_poll_interval(
  value: unknown,
  min_ms: number,
  max_ms: number,
): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min_ms;
  return Math.max(min_ms, Math.min(max_ms, n));
}

/**
 * 归一化正数配置。
 */
function normalize_positive_number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

/**
 * 读取可选布尔值。
 */
function normalize_boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
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
  private readonly timeout_ms: number;
  private readonly min_poll_interval_ms: number;
  private readonly max_poll_interval_ms: number;

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
    this.timeout_ms = normalize_positive_number(
      options.timeout_ms,
      DEFAULT_TIMEOUT_MS,
    );
    this.min_poll_interval_ms = normalize_positive_number(
      options.min_poll_interval_ms,
      DEFAULT_MIN_POLL_INTERVAL_MS,
    );
    this.max_poll_interval_ms = normalize_positive_number(
      options.max_poll_interval_ms,
      DEFAULT_MAX_POLL_INTERVAL_MS,
    );
  }

  /**
   * 图片插件给模型的使用说明。
   */
  system(_context: AgentContext): string {
    return [
      "# Image Plugin",
      "",
      "Use this plugin only when the user asks to generate, create, draw, render, edit, transform, or stylize an image.",
      "Do not call it for ordinary image analysis or questions about an existing image unless the user asks for a new/edited image output.",
      "",
      "Call through `plugin_call`:",
      "",
      "```ts",
      "plugin_call({",
      `  plugin: "${this.name}",`,
      '  action: "generate",',
      "  payload: {",
      '    prompt: "...",',
      "  },",
      "});",
      "```",
      "",
      "Payload rules:",
      "- `prompt` is required unless `messages` provides the full multimodal image context.",
      "- Optional common fields: `messages`, `size`, `aspect_ratio`, `ratio`, `quality`, `n`, `count`, `seed`, `provider_options`.",
      "- Preserve the user's creative intent; do not over-rewrite the prompt unless clarification is necessary.",
      "- For a two-step flow, call `image_create` first, then call `image_result` with `job_id`; `image_result` waits until the job finishes by default.",
      "- `generate` is a convenience action that creates the job and waits for the final image in one call.",
      "- Generated image file parts are saved under project `.downcity/resources` and attached to the final assistant message automatically.",
    ].join("\n");
  }

  private async generate_image(
    input: ImagePluginInput,
  ): Promise<ImagePluginResult> {
    const created = await this.image_create(input);
    validate_created_job(created);
    const current = await this.wait_for_image_result({
      job_id: created.job_id,
      poll_after_ms: created.poll_after_ms,
    });
    if (!current.result) {
      throw new Error(`Image job ${created.job_id} succeeded without result`);
    }
    return normalize_image_result(current.result);
  }

  /**
   * 查询图片任务，按需等待终态。
   */
  private async read_image_result(
    input: ImagePluginJobResultInput,
    options: {
      /**
       * 默认是否等待终态。
       */
      default_until_finish: boolean;
    },
  ): Promise<ImagePluginJobResult> {
    const timeout_ms = normalize_positive_number(input.timeout_ms, this.timeout_ms);
    const min_poll_interval_ms = normalize_positive_number(
      input.min_poll_interval_ms,
      this.min_poll_interval_ms,
    );
    const max_poll_interval_ms = normalize_positive_number(
      input.max_poll_interval_ms,
      this.max_poll_interval_ms,
    );
    const until_finish = normalize_boolean(
      input.until_finish,
      options.default_until_finish,
    );
    const first = await this.image_result({ job_id: input.job_id });
    validate_job_result(first);
    if (!until_finish || first.status === "succeeded") {
      if (first.status === "succeeded" && first.result) {
        normalize_image_result(first.result);
      }
      return first;
    }
    if (first.status === "failed") {
      throw new Error(
        `Image job failed: ${first.error ?? first.message ?? input.job_id}`,
      );
    }
    return await this.wait_for_image_result({
      job_id: input.job_id,
      poll_after_ms: first.poll_after_ms,
      timeout_ms,
      min_poll_interval_ms,
      max_poll_interval_ms,
    });
  }

  /**
   * 轮询图片任务直到成功或失败。
   */
  private async wait_for_image_result(input: {
    /**
     * 图片任务 ID。
     */
    job_id: string;
    /**
     * 首次建议轮询间隔。
     */
    poll_after_ms?: number;
    /**
     * 最大等待时间。
     */
    timeout_ms?: number;
    /**
     * 轮询间隔下限。
     */
    min_poll_interval_ms?: number;
    /**
     * 轮询间隔上限。
     */
    max_poll_interval_ms?: number;
  }): Promise<ImagePluginJobResult> {
    const timeout_ms = normalize_positive_number(input.timeout_ms, this.timeout_ms);
    const min_poll_interval_ms = normalize_positive_number(
      input.min_poll_interval_ms,
      this.min_poll_interval_ms,
    );
    const max_poll_interval_ms = normalize_positive_number(
      input.max_poll_interval_ms,
      this.max_poll_interval_ms,
    );
    const deadline = Date.now() + timeout_ms;
    let poll_after_ms = input.poll_after_ms;

    while (Date.now() < deadline) {
      await sleep(
        clamp_poll_interval(
          poll_after_ms,
          min_poll_interval_ms,
          max_poll_interval_ms,
        ),
      );
      const current = await this.image_result({ job_id: input.job_id });
      validate_job_result(current);
      poll_after_ms = current.poll_after_ms;
      if (current.status === "succeeded") {
        if (!current.result) {
          throw new Error(`Image job ${input.job_id} succeeded without result`);
        }
        normalize_image_result(current.result);
        return current;
      }
      if (current.status === "failed") {
        throw new Error(
          `Image job failed: ${current.error ?? current.message ?? input.job_id}`,
        );
      }
    }

    throw new Error(`Image job timed out: ${input.job_id}`);
  }

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    image_create: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_payload(payload);
          const created = await this.image_create(input);
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
    },
    image_result: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_result_payload(payload);
          const current = await this.read_image_result(input, {
            default_until_finish: true,
          });
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
    },
    generate: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_payload(payload);
          const message = await this.generate_image(input);
          return {
            success: true,
            data: message as unknown as JsonObject,
            message: "image generated",
          };
        } catch (error) {
          return {
            success: false,
            error: String(error),
            message: String(error),
          };
        }
      },
    },
  };
}
