/**
 * AI Service 任务类型模块。
 *
 * 这里保留 AI 图片任务的 provider step 协议与 SDK 轮询协议。
 * 底层持久化使用 City 通用 async_jobs 表。
 */

import type { UIMessage } from "ai";
import type { AsyncJobStatus } from "../../types/AsyncJob.js";

/** 图片生成任务状态。 */
export type AIImageJobStatus = AsyncJobStatus;

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
