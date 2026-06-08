/**
 * 用户端类型。
 */

import type { UIMessage, UIMessageChunk } from "ai";
import type { FetchLike } from "../http.js";
import type { UserModelInput } from "../invoker/ai/types.js";
import type {
  UserPaymentMethod,
  UserPaymentMethodReason,
  UserPaymentMethodType,
} from "../invoker/payment/types.js";

/**
 * Service 摘要信息。
 */
export interface UserServiceSummary {
  /** Service 唯一 ID。 */
  id: string;
  /** Service 展示名称。 */
  name: string;
  /** Service 依赖的环境变量需求列表。 */
  env: Array<{
    /** 环境变量 key。 */
    key: string;
    /** 给用户展示的说明文本。 */
    description: string;
    /** 当前是否必填。 */
    required: boolean;
  }>;
}

/** User City 内部访问层构造参数 */
export interface UserCityAccessOptions {
  /** City 的 HTTP 入口地址。 */
  base_url: string;
  /** 当前 user_token 绑定的 Town ID。 */
  town_id?: string;
  /** 终端用户访问 token。 */
  user_token?: string;
  /** 自定义 fetch 实现。 */
  fetch?: FetchLike;
}

/** AI 模态返回类型 */
export type UserTextResult = UIMessage;
export type UserStreamChunk = UIMessageChunk;
export type UserStreamResult = ReadableStream<UserStreamChunk>;
export type UserVideoResult = UIMessage;
export type { UserPaymentMethod, UserPaymentMethodReason, UserPaymentMethodType };

/** 图片任务状态。 */
export type UserImageJobStatus = "queued" | "running" | "succeeded" | "failed";

/** 图片任务创建结果。 */
export interface UserImageJobCreateResult {
  /** 图片任务唯一 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: UserImageJobStatus;
  /** 读取任务结果的 API 路径。 */
  result_path: string;
  /** 人类可读状态说明。 */
  message?: string;
  /** 建议客户端下次轮询前等待的毫秒数。 */
  poll_after_ms?: number;
  /** 任务创建时间，ISO 字符串。 */
  created_at: string;
  /** 任务更新时间，ISO 字符串。 */
  updated_at: string;
}

/** 图片任务结果查询结果。 */
export interface UserImageJobResult {
  /** 图片任务唯一 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: UserImageJobStatus;
  /** 成功时的图片结果。 */
  result?: UIMessage;
  /** 失败时的错误信息。 */
  error?: string;
  /** 人类可读状态说明。 */
  message?: string;
  /** 任务创建时间，ISO 字符串。 */
  created_at: string;
  /** 任务更新时间，ISO 字符串。 */
  updated_at: string;
}

/** 图片生成文本内容片段。 */
export interface UserImageTextContent {
  /** 内容类型，固定为文本。 */
  type: "text";
  /** 生图提示词或上下文文本。 */
  text: string;
}

/** 图片生成参考图片内容片段。 */
export interface UserImageFileContent {
  /** 内容类型，固定为图片。 */
  type: "image";
  /** 远程图片 URL。 */
  url?: string;
  /** data URL 图片内容。 */
  data_url?: string;
  /** 图片 MIME 类型，例如 `image/png`。 */
  media_type?: string;
}

/** 图片生成多模态内容片段。 */
export type UserImageContent = UserImageTextContent | UserImageFileContent;

/** 图片生成上下文消息。 */
export interface UserImageMessage {
  /** 消息角色。 */
  role: "system" | "user" | "assistant";
  /** 该消息内的文本与图片内容。 */
  content: UserImageContent[];
}

/** 图片生成输入。 */
export interface UserImageInput extends UserServiceInput {
  /** 图片模型引用。 */
  model?: UserModelInput;
  /** 单句快捷提示词。 */
  prompt?: string;
  /** 多轮或多模态图片生成上下文。 */
  messages?: UserImageMessage[];
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
  provider_options?: Record<string, unknown>;
}

/** 发给任意 service 的输入 */
export interface UserServiceInput {
  model?: UserModelInput;
  [key: string]: unknown;
}
