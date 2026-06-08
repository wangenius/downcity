/**
 * ImagePlugin 类型定义。
 *
 * 关键点（中文）
 * - 这里仅定义 agent 对图片能力的最低层协议，不绑定 city 或任意上游 provider。
 * - 图片生成结果使用 AI SDK UIMessage，保证 session 落盘格式与现有消息系统一致。
 * - 字段保持 JSON 可序列化，便于通过 plugin action 与 tool bridge 传递。
 */

import type { UIMessage } from "ai";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";

/**
 * 图片生成文本内容片段。
 */
export interface ImagePluginTextContent {
  /** 内容类型，固定为文本。 */
  type: "text";
  /** 生图提示词或上下文文本。 */
  text: string;
}

/**
 * 图片生成参考图片内容片段。
 */
export interface ImagePluginFileContent {
  /** 内容类型，固定为图片。 */
  type: "image";
  /** 远程图片 URL。 */
  url?: string;
  /** data URL 图片内容。 */
  data_url?: string;
  /** 图片 MIME 类型，例如 `image/png`。 */
  media_type?: string;
}

/**
 * 图片生成多模态内容片段。
 */
export type ImagePluginContent =
  | ImagePluginTextContent
  | ImagePluginFileContent;

/**
 * 图片生成上下文消息。
 */
export interface ImagePluginMessage {
  /** 消息角色。 */
  role: "system" | "user" | "assistant";
  /** 该消息内的文本与图片内容。 */
  content: ImagePluginContent[];
}

/**
 * ImagePlugin 调用输入。
 */
export interface ImagePluginInput {
  /** 图片模型引用。 */
  model?: string;
  /** 单句快捷提示词。 */
  prompt?: string;
  /** 多轮或多模态图片生成上下文。 */
  messages?: ImagePluginMessage[];
  /** 生成图片数量。 */
  n?: number;
  /** 生成图片数量，兼容部分上游使用的 count 命名。 */
  count?: number;
  /** 图片尺寸，例如 `1024x1024`。 */
  size?: string;
  /** 图片宽高比，例如 `1:1`。 */
  aspect_ratio?: string;
  /** 图片宽高比，兼容部分上游使用的 ratio 命名。 */
  ratio?: string;
  /** 图片质量，例如 `standard`、`hd`、`ultra`、`4k`。 */
  quality?: string;
  /** 随机种子。 */
  seed?: number;
  /** 业务侧任务 ID，用于异步图片任务幂等、追踪和恢复。 */
  client_job_id?: string;
  /** Provider 私有参数，例如 `{ openai: {...}, gemini: {...}, luchi: {...} }`。 */
  provider_options?: JsonObject;
  /** 允许外部 image 函数接收其他 JSON 可序列化参数。 */
  [key: string]: JsonValue | ImagePluginMessage[] | undefined;
}

/**
 * ImagePlugin 图片任务状态。
 */
export type ImagePluginJobStatus = "queued" | "running" | "succeeded" | "failed";

/**
 * ImagePlugin 生成结果。
 */
export type ImagePluginResult = UIMessage;

/**
 * ImagePlugin 图片任务创建结果。
 */
export interface ImagePluginJobCreateResult {
  /** 图片任务唯一 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: ImagePluginJobStatus;
  /** 读取任务结果的路径或 URL。 */
  result_path?: string;
  /** 人类可读状态说明。 */
  message?: string;
  /** 建议下次轮询前等待的毫秒数。 */
  poll_after_ms?: number;
  /** 任务创建时间。 */
  created_at?: string;
  /** 任务更新时间。 */
  updated_at?: string;
}

/**
 * ImagePlugin 图片任务结果查询结果。
 */
export interface ImagePluginJobResult {
  /** 图片任务唯一 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: ImagePluginJobStatus;
  /** 成功时的图片结果。 */
  result?: ImagePluginResult;
  /** 失败时的错误信息。 */
  error?: string;
  /** 人类可读状态说明。 */
  message?: string;
  /** 任务未完成时建议下次轮询前等待的毫秒数。 */
  poll_after_ms?: number;
  /** 任务创建时间。 */
  created_at?: string;
  /** 任务更新时间。 */
  updated_at?: string;
}

/**
 * ImagePlugin 构造参数。
 */
export interface ImagePluginOptions {
  /** Plugin 稳定名称，默认 `image`。 */
  name?: string;
  /** Plugin 展示标题，默认 `Image`。 */
  title?: string;
  /** Plugin 用途说明。 */
  description?: string;
  /** 可选：创建图片生成任务，通常传入 `(input) => city.ai.image_create(input)`。 */
  create?: (input: ImagePluginInput) => Promise<ImagePluginJobCreateResult> | ImagePluginJobCreateResult;
  /** 可选：读取图片生成任务结果，通常传入 `(input) => city.ai.image_result(input)`。 */
  result?: (input: { job_id: string }) => Promise<ImagePluginJobResult> | ImagePluginJobResult;
  /** 兼容 `generate` 动作等待任务完成的最长毫秒数。 */
  wait_timeout_ms?: number;
  /** 兼容 `generate` 动作每次轮询间隔毫秒数。 */
  poll_interval_ms?: number;
}
