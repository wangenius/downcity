/**
 * ImagePlugin：Agent 内置图片生成插件。
 *
 * 关键点（中文）
 * - 插件只负责把外部 image 函数暴露为 agent 可调用 action。
 * - 具体模型、Provider、鉴权与上游协议由调用方传入的 image 函数处理。
 * - action 返回 AI SDK UIMessage，后续由 plugin tool bridge 抽取 file parts 写回 assistant 消息。
 */

import crypto from "node:crypto";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type {
  ImagePluginInput,
  ImagePluginJobCreateResult,
  ImagePluginJobResult,
  ImagePluginJobStatusResult,
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

type LocalImageJobRecord = {
  /**
   * 图片任务唯一 ID。
   */
  job_id: string;
  /**
   * 当前任务状态。
   */
  status: "queued" | "running" | "succeeded" | "failed";
  /**
   * 成功时的图片结果。
   */
  result?: ImagePluginResult;
  /**
   * 失败时的错误信息。
   */
  error?: string;
  /**
   * 人类可读状态说明。
   */
  message?: string;
  /**
   * 任务创建时间。
   */
  created_at: string;
  /**
   * 任务更新时间。
   */
  updated_at: string;
};

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

function normalize_job_id_payload(payload: JsonValue | undefined): { job_id: string } {
  const record = to_record(payload ?? {});
  const job_id = String(record?.job_id || "").trim();
  if (!job_id) {
    throw new TypeError("ImagePlugin job action requires job_id");
  }
  return { job_id };
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
 * 归一化任务状态查询结果，确保 status action 不携带图片结果。
 */
function normalize_job_status_result(
  result: ImagePluginJobStatusResult,
): ImagePluginJobStatusResult {
  return {
    job_id: result.job_id,
    status: result.status,
    ...(result.message ? { message: result.message } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(typeof result.poll_after_ms === "number"
      ? { poll_after_ms: result.poll_after_ms }
      : {}),
    ...(result.created_at ? { created_at: result.created_at } : {}),
    ...(result.updated_at ? { updated_at: result.updated_at } : {}),
  };
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
  private readonly create_job?: ImagePluginOptions["create"];
  private readonly read_job_status?: ImagePluginOptions["status"];
  private readonly read_job_result?: ImagePluginOptions["result"];
  private readonly wait_timeout_ms: number;
  private readonly poll_interval_ms: number;
  private readonly local_jobs = new Map<string, LocalImageJobRecord>();

  constructor(options: ImagePluginOptions) {
    super();
    const name = String(options.name || DEFAULT_IMAGE_PLUGIN_NAME).trim();
    if (!name) {
      throw new Error("ImagePlugin requires a non-empty name");
    }
    const has_custom_job_api = Boolean(
      options.create || options.status || options.result,
    );
    if (
      has_custom_job_api &&
      (typeof options.create !== "function" ||
        typeof options.status !== "function" ||
        typeof options.result !== "function")
    ) {
      throw new Error(
        "ImagePlugin custom job API requires create, status, and result functions",
      );
    }
    if (!has_custom_job_api && typeof options.image !== "function") {
      throw new Error(
        "ImagePlugin requires either image(input) or create/status/result functions",
      );
    }
    this.name = name;
    this.title = String(options.title || DEFAULT_IMAGE_PLUGIN_TITLE).trim();
    this.description = String(
      options.description || DEFAULT_IMAGE_PLUGIN_DESCRIPTION,
    ).trim();
    this.image = options.image;
    this.create_job = options.create;
    this.read_job_status = options.status;
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
      "Image generation is available through the plugin_call tool as an observable job workflow.",
      `Call plugin "${this.name}" action "create" when the user asks to create, render, draw, or edit an image.`,
      `Then call plugin "${this.name}" action "status" with { job_id } to inspect progress.`,
      `When status is succeeded, call plugin "${this.name}" action "result" with { job_id } to attach the generated files.`,
      "Use action \"generate\" only as a compatibility shortcut when you explicitly need to wait for completion.",
      "Pass a JSON payload with prompt, optional size/aspect_ratio/quality/n, and optional provider_options to create/generate.",
    ].join("\n");
  }

  private create_local_job(input: ImagePluginInput): ImagePluginJobCreateResult {
    if (typeof this.image !== "function") {
      throw new Error("ImagePlugin local image job requires image(input)");
    }
    const now = new Date().toISOString();
    const job_id = `img_${crypto.randomUUID()}`;
    const record: LocalImageJobRecord = {
      job_id,
      status: "running",
      message: "image job is running",
      created_at: now,
      updated_at: now,
    };
    this.local_jobs.set(job_id, record);

    void this.run_local_job(record, input, this.image);

    return {
      job_id,
      status: record.status,
      message: record.message,
      poll_after_ms: this.poll_interval_ms,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private async run_local_job(
    record: LocalImageJobRecord,
    input: ImagePluginInput,
    image: NonNullable<ImagePluginOptions["image"]>,
  ): Promise<void> {
    try {
      const message = normalize_image_result(await image(input));
      record.status = "succeeded";
      record.result = message;
      record.message = "image job succeeded";
      record.updated_at = new Date().toISOString();
    } catch (error) {
      record.status = "failed";
      record.error = String(error);
      record.message = "image job failed";
      record.updated_at = new Date().toISOString();
    }
  }

  private read_local_job(job_id: string): LocalImageJobRecord {
    const record = this.local_jobs.get(job_id);
    if (!record) {
      throw new Error(`Unknown image job: ${job_id}`);
    }
    return record;
  }

  private serialize_local_status(record: LocalImageJobRecord): ImagePluginJobStatusResult {
    return {
      job_id: record.job_id,
      status: record.status,
      ...(record.message ? { message: record.message } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.status === "running" || record.status === "queued"
        ? { poll_after_ms: this.poll_interval_ms }
        : {}),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private serialize_local_result(record: LocalImageJobRecord): ImagePluginJobResult {
    return {
      job_id: record.job_id,
      status: record.status,
      ...(record.result ? { result: record.result } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.message ? { message: record.message } : {}),
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  private async wait_for_job(job_id: string): Promise<ImagePluginResult> {
    const deadline = Date.now() + this.wait_timeout_ms;
    while (Date.now() <= deadline) {
      const result = this.read_job_result
        ? await this.read_job_result({ job_id })
        : this.serialize_local_result(this.read_local_job(job_id));
      if (result.status === "succeeded" && result.result) {
        return normalize_image_result(result.result);
      }
      if (result.status === "failed") {
        throw new Error(result.error || result.message || "image job failed");
      }
      await new Promise((resolve) => setTimeout(resolve, this.poll_interval_ms));
    }
    throw new Error(`image job timed out: ${job_id}`);
  }

  /**
   * 显式 action 集合。
   */
  readonly actions = {
    create: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_image_payload(payload);
          const result = this.create_job
            ? await this.create_job(input)
            : this.create_local_job(input);
          return {
            success: true,
            data: result as unknown as JsonObject,
            message: result.message || "image job created",
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
    status: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_job_id_payload(payload);
          const result = this.read_job_status
            ? normalize_job_status_result(await this.read_job_status(input))
            : this.serialize_local_status(this.read_local_job(input.job_id));
          return {
            success: true,
            data: result as unknown as JsonObject,
            message: result.message || `image job ${result.status}`,
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
    result: {
      execute: async ({ payload }: { payload: JsonValue }) => {
        try {
          const input = normalize_job_id_payload(payload);
          const result = this.read_job_result
            ? await this.read_job_result(input)
            : this.serialize_local_result(this.read_local_job(input.job_id));
          if (result.status === "succeeded" && result.result) {
            return {
              success: true,
              data: result.result as unknown as JsonObject,
              message: result.message || "image job succeeded",
            };
          }
          if (result.status === "failed") {
            return {
              success: false,
              data: result as unknown as JsonObject,
              error: result.error || result.message || "image job failed",
              message: result.message || "image job failed",
            };
          }
          return {
            success: true,
            data: result as unknown as JsonObject,
            message: result.message || `image job ${result.status}`,
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
          const job = this.create_job
            ? await this.create_job(input)
            : this.create_local_job(input);
          const message = await this.wait_for_job(job.job_id);
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
