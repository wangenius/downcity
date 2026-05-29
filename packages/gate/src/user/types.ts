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

/** UserClient 构造参数 */
export interface UserClientOptions {
  base_url: string;
  studio_id?: string;
  user_token?: string;
  fetch?: FetchLike;
}

/** AI 模态返回类型 */
export type UserTextResult = UIMessage;
export type UserStreamChunk = UIMessageChunk;
export type UserStreamResult = ReadableStream<UserStreamChunk>;
export type UserImageResult = UIMessage;
export type UserVideoResult = UIMessage;
export type { UserPaymentMethod, UserPaymentMethodReason, UserPaymentMethodType };

/** 发给任意 service 的输入 */
export interface UserServiceInput {
  model?: UserModelInput;
  [key: string]: unknown;
}
