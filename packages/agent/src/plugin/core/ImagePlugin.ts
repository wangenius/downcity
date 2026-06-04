/**
 * ImagePlugin：Agent 内置图片生成插件。
 *
 * 关键点（中文）
 * - 插件只负责把外部 image 函数暴露为 agent 可调用 action。
 * - 具体模型、Provider、鉴权与上游协议由调用方传入的 image 函数处理。
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
    throw new TypeError("ImagePlugin image function must return an AI SDK UIMessage");
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

  private readonly image: ImagePluginOptions["image"];

  constructor(options: ImagePluginOptions) {
    super();
    const name = String(options.name || DEFAULT_IMAGE_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("ImagePlugin requires a non-empty name");
    }
    if (typeof options.image !== "function") {
      throw new Error("ImagePlugin requires an image(input) function");
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

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    generate: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_payload(payload);
          const message = normalize_image_result(await this.image(input));
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
