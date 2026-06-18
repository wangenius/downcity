/**
 * AI Service 任务类型模块。
 *
 * 服务端任务表和 SDK 轮询协议共享这些结构，避免 image/create、image/result
 * 之间出现隐式约定。
 */

import type { UIMessage } from "ai";

/** 图片生成任务状态。 */
export type AIImageJobStatus = "queued" | "running" | "succeeded" | "failed";

/** 图片任务推进 action 的状态。 */
export type AIImageJobStepStatus = "running" | "succeeded" | "failed";

/** 图片任务推进 action 持久化的上游状态。 */
export interface AIImageJobStepState {
  /** 上游 Provider 自己的任务 ID，例如 Luchi image job id。 */
  upstream_job_id?: string;
  /** Provider 名称或 ID，便于排障。 */
  provider?: string;
  /** Provider 需要跨请求保留的其它状态。 */
  [key: string]: unknown;
}

/** 注入给 provider image_job action 的内部任务上下文。 */
export interface AIImageJobStepContext {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: string;
  /** 当前 Federation 任务状态。 */
  status: AIImageJobStatus;
  /** 上一次推进后持久化的 Provider 状态。 */
  state?: AIImageJobStepState;
}

/** image_job action 返回给 AIService 的推进结果。 */
export interface AIImageJobStepResult {
  /** 本次推进后的任务状态。 */
  status: AIImageJobStepStatus;
  /** 任务仍在运行时需要持久化的 Provider 状态。 */
  state?: AIImageJobStepState;
  /** 成功时返回的 AI SDK UIMessage。 */
  result?: UIMessage;
  /** 失败时返回的错误消息。 */
  error?: string;
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message?: string;
  /** 建议客户端下一次查询 result 的间隔毫秒数。 */
  poll_after_ms?: number;
}

/** 图片生成任务表行。 */
export interface AIImageJobRecord {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: AIImageJobStatus;
  /** 原始图片生成输入，JSON 字符串。 */
  input_json: string;
  /** 成功后的 UIMessage 结果，JSON 字符串。 */
  result_json?: string | null;
  /** 失败时给客户端展示的错误消息。 */
  error?: string | null;
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message?: string | null;
  /** 当前 user_token 绑定的 City ID。 */
  city_id?: string | null;
  /** 当前终端用户 ID。 */
  user_id?: string | null;
  /** 本次任务解析到的模型 ID。 */
  model_id?: string | null;
  /** 创建时间。 */
  created_at: string;
  /** 更新时间。 */
  updated_at: string;
}

/** image/create 返回给客户端的结果。 */
export interface UserImageJobCreateResult {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: string;
  /** 创建后的任务状态。 */
  status: AIImageJobStatus;
  /** 建议客户端下一次查询 result 的间隔毫秒数。 */
  poll_after_ms: number;
}

/** image/result 返回给客户端的结果。 */
export interface UserImageJobResult {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: string;
  /** 当前任务状态。 */
  status: AIImageJobStatus;
  /** 成功时返回的 AI SDK UIMessage。 */
  result?: UIMessage;
  /** 失败时返回的错误消息。 */
  error?: string;
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message?: string;
  /** 建议客户端下一次查询 result 的间隔毫秒数。 */
  poll_after_ms: number;
}

/** image/result 的查询输入。 */
export interface UserImageJobResultInput {
  /** Federation 内部生成的图片任务 ID。 */
  job_id: string;
}
