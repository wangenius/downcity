/**
 * ImagePlugin 类型定义。
 *
 * 关键点（中文）
 * - 这里仅定义图片 plugin 对图片能力的最低层协议，不绑定 city 或任意上游 provider。
 * - 图片生成结果使用 AI SDK UIMessage，保证 session 落盘格式与现有消息系统一致。
 * - 字段保持 JSON 可序列化，便于通过 plugin action 与 tool bridge 传递。
 */

import type { UIMessage } from "ai";
import type {
  JsonObject,
  JsonValue,
} from "@downcity/agent/internal/types/common/Json.js";

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
  /** 业务侧任务 ID，用于 provider 侧幂等、追踪和恢复。 */
  client_job_id?: string;
  /** Provider 私有参数，例如 `{ openai: {...}, gemini: {...}, luchi: {...} }`。 */
  provider_options?: JsonObject;
  /** 允许外部 image 函数接收其他 JSON 可序列化参数。 */
  [key: string]: JsonValue | ImagePluginMessage[] | undefined;
}

/**
 * ImagePlugin 生成结果。
 */
export type ImagePluginResult = UIMessage;

/**
 * 图片生成任务状态。
 */
export type ImagePluginJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

/**
 * 图片任务创建结果。
 */
export interface ImagePluginJobCreateResult {
  /** 图片任务 ID。 */
  job_id: string;
  /** 创建后的任务状态。 */
  status: ImagePluginJobStatus;
  /** 建议下一次轮询的间隔毫秒数。 */
  poll_after_ms?: number;
}

/**
 * 图片任务查询结果。
 */
export interface ImagePluginJobResult {
  /** 图片任务 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: ImagePluginJobStatus;
  /** 成功时返回的 AI SDK UIMessage。 */
  result?: ImagePluginResult;
  /** 失败时返回的错误消息。 */
  error?: string;
  /** 当前任务状态说明。 */
  message?: string;
  /** 建议下一次轮询的间隔毫秒数。 */
  poll_after_ms?: number;
}

/**
 * 图片任务查询输入。
 */
export interface ImagePluginJobResultInput {
  /** 图片任务 ID，由 `image_create` 返回。 */
  job_id: string;
  /** 是否持续轮询直到任务进入成功或失败终态，默认由 action 决定。 */
  until_finish?: boolean;
  /** 单次查询最大等待时间，单位毫秒。 */
  timeout_ms?: number;
  /** 轮询间隔下限，单位毫秒。 */
  min_poll_interval_ms?: number;
  /** 轮询间隔上限，单位毫秒。 */
  max_poll_interval_ms?: number;
}

/**
 * ImagePlugin 可见模型信息。
 */
export interface ImagePluginModel {
  /** 模型唯一 ID，用于 `image_create` / `generate` payload 的 `model` 字段。 */
  id: string;
  /** 模型展示名称。 */
  name: string;
  /** 模型说明文本。 */
  description?: string;
  /** 模型支持的能力列表，例如 `image`。 */
  modalities: string[];
  /** 模型标签。 */
  tags?: string[];
  /** 模型元数据。 */
  meta?: JsonObject;
  /** 当前模型是否为目录全局默认模型。 */
  is_default?: boolean;
  /** 当前模型作为默认模型负责的 modality 列表。 */
  default_modalities?: string[];
}

/**
 * ImagePlugin 模型列表结果。
 */
export interface ImagePluginModelsResult {
  /** 可用于图片生成的模型列表。 */
  items: ImagePluginModel[];
  /** 图片能力默认模型 ID。 */
  default_model_id?: string;
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
  /** 创建图片生成任务，通常传入 `(input) => city.ai.image_create(input)`。 */
  image_create?: (
    input: ImagePluginInput,
  ) => Promise<ImagePluginJobCreateResult> | ImagePluginJobCreateResult;
  /** 查询图片生成任务，通常传入 `(input) => city.ai.image_result(input)`。 */
  image_result?: (
    input: Pick<ImagePluginJobResultInput, "job_id">,
  ) => Promise<ImagePluginJobResult> | ImagePluginJobResult;
  /** 列出可用图片模型，通常传入 `async () => city.ai.listModels().then((catalog) => catalog.forModality("image"))`。 */
  list_models?: () => Promise<ImagePluginModel[]> | ImagePluginModel[];
  /** 图片任务最大等待时间，默认 300000ms。 */
  timeout_ms?: number;
  /** 轮询间隔下限，默认 100ms。 */
  min_poll_interval_ms?: number;
  /** 轮询间隔上限，默认 10000ms。 */
  max_poll_interval_ms?: number;
}
