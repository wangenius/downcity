/**
 * ImagePlugin：Agent 内置图片生成插件。
 *
 * 关键点（中文）
 * - 对 Agent 只暴露同步体验的 `generate` action。
 * - City / provider 的图片能力通过单个 image 函数注入。
 * - action 返回 AI SDK UIMessage，后续由 plugin tool bridge 抽取 file parts 写回 assistant 消息。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type {
  ImagePluginInput,
  ImagePluginOptions,
  ImagePluginResult,
} from "@/types/plugin/ImagePlugin.js";
import { BasePlugin } from "@/plugin/core/BasePlugin.js";

const DEFAULT_IMAGE_PLUGIN_NAME = "image";
const DEFAULT_IMAGE_PLUGIN_TITLE = "Image";
const DEFAULT_IMAGE_PLUGIN_DESCRIPTION =
  "Generate images and return them as assistant file parts.";

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
function normalize_image_payload(payload: JsonValue | undefined): ImagePluginInput {
  const record = to_record(payload ?? {});
  if (!record) {
    throw new TypeError("ImagePlugin.generate payload must be an object");
  }
  return { ...record } as ImagePluginInput;
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

  private readonly image: NonNullable<ImagePluginOptions["image"]>;

  constructor(options: ImagePluginOptions) {
    super();
    const name = String(options.name || DEFAULT_IMAGE_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("ImagePlugin requires a non-empty name");
    }
    if (typeof options.image !== "function") {
      throw new Error("ImagePlugin requires an image function");
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_IMAGE_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_IMAGE_PLUGIN_DESCRIPTION,
    ).trim();
    this.image = options.image;
  }

  /**
   * 图片插件给模型的最小使用说明。
   */
  system(_context: AgentContext): string {
    return [
      "Image generation is available through the plugin_call tool.",
      `Call plugin "${this.name}" action "generate" when the user asks to create, render, draw, or edit an image.`,
      "Pass a JSON payload with prompt, optional size/aspect_ratio/quality/n, and optional provider_options.",
      "The generated image files will be attached to the final assistant message automatically.",
    ].join("\n");
  }

  private async generate_image(input: ImagePluginInput): Promise<ImagePluginResult> {
    return normalize_image_result(await this.image(input));
  }

  /**
   * 显式 action 集合。
   */
  readonly actions = {
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
