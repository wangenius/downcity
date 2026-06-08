/**
 * ImagePlugin：Agent 内置图片生成插件。
 *
 * 关键点（中文）
 * - 对 Agent 只暴露同步体验的 `generate` action。
 * - City / provider 的异步任务细节由插件内部 create + result 轮询封装。
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
const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

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
 * 等待指定毫秒数。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  private readonly create_job: NonNullable<ImagePluginOptions["create"]>;
  private readonly read_job_result: NonNullable<ImagePluginOptions["result"]>;
  private readonly wait_timeout_ms: number;
  private readonly poll_interval_ms: number;

  constructor(options: ImagePluginOptions) {
    super();
    const name = String(options.name || DEFAULT_IMAGE_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("ImagePlugin requires a non-empty name");
    }
    if (typeof options.create !== "function" || typeof options.result !== "function") {
      throw new Error("ImagePlugin requires create and result functions");
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_IMAGE_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_IMAGE_PLUGIN_DESCRIPTION,
    ).trim();
    this.create_job = options.create;
    this.read_job_result = options.result;
    this.wait_timeout_ms =
      typeof options.wait_timeout_ms === "number" && options.wait_timeout_ms > 0
        ? options.wait_timeout_ms
        : DEFAULT_WAIT_TIMEOUT_MS;
    this.poll_interval_ms =
      typeof options.poll_interval_ms === "number" && options.poll_interval_ms > 0
        ? options.poll_interval_ms
        : DEFAULT_POLL_INTERVAL_MS;
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
    const job = await this.create_job(input);
    const job_id = String(job.job_id || "").trim();
    if (!job_id) {
      throw new Error("ImagePlugin image_create result requires job_id");
    }

    const deadline = Date.now() + this.wait_timeout_ms;
    let poll_after_ms =
      typeof job.poll_after_ms === "number" && job.poll_after_ms > 0
        ? job.poll_after_ms
        : this.poll_interval_ms;
    while (Date.now() <= deadline) {
      const result = await this.read_job_result({ job_id });
      if (result.status === "succeeded" && result.result) {
        return normalize_image_result(result.result);
      }
      if (result.status === "failed") {
        throw new Error(result.error || result.message || "image job failed");
      }
      poll_after_ms =
        typeof result.poll_after_ms === "number" && result.poll_after_ms > 0
          ? result.poll_after_ms
          : this.poll_interval_ms;
      await sleep(poll_after_ms);
    }
    throw new Error(`image job timed out: ${job_id}`);
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
