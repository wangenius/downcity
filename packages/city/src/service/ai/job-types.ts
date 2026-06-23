/**
 * AI 图片任务协议类型。
 *
 * 关键点（中文）
 * - AIService 固定 image_create / image_persist / image_result 的返回协议。
 * - AIService 默认使用内置 async_jobs 表保存图片任务，Provider 只负责创建和持久化上游结果。
 */

import type { UIMessage } from "ai";
import type { AsyncJobRecord } from "../../types/AsyncJob.js";

/** 图片任务状态。 */
export type AIImageJobStatus = "queued" | "running" | "succeeded" | "failed";

/** 图片任务扩展元数据。 */
export interface AIImageJobMetadata {
  /** 扩展字段，由具体 Provider 自行约定。 */
  [key: string]: unknown;
}

/** image_create action 返回给 AIService 的固定协议。 */
export interface AIImageProviderCreateResult {
  /** 图片任务 ID，对 AIService 不透明，由具体 Provider 生成或转发。 */
  job_id: string;
  /** 创建后的任务状态。 */
  status: AIImageJobStatus;
  /** 当前任务状态说明，便于客户端展示或排障。 */
  message?: string;
  /** 失败时返回的错误消息。 */
  error?: string;
  /** 建议客户端下一次查询 result 的间隔毫秒数。 */
  poll_after_ms?: number;
  /** 具体 Provider 返回的扩展元数据。 */
  metadata?: AIImageJobMetadata;
}

/** image_persist action 返回给 AIService 的固定协议。 */
export interface AIImageProviderPersistResult {
  /** 图片任务 ID。 */
  job_id: string;
  /** 持久化后的任务状态；未完成时可返回 queued/running 供后台重试。 */
  status: AIImageJobStatus;
  /** 成功持久化后返回的 AI SDK UIMessage。 */
  result?: UIMessage;
  /** 失败时返回的错误消息。 */
  error?: string;
  /** 当前任务状态说明，便于后台排障。 */
  message?: string;
  /** 建议后台下一次 persist 的间隔毫秒数。 */
  poll_after_ms?: number;
  /** 稳定计费引用，用于幂等扣费。 */
  billing_ref?: string;
  /** 具体 Provider 返回的扩展元数据，例如 usage。 */
  metadata?: AIImageJobMetadata;
}

/** image_result action 返回给 AIService 的固定协议。 */
export interface AIImageProviderResult {
  /** 图片任务 ID。 */
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
  poll_after_ms?: number;
  /** 具体 Provider 返回的扩展元数据。 */
  metadata?: AIImageJobMetadata;
}

/** image/create 返回给客户端的结果。 */
export type UserImageJobCreateResult = AIImageProviderCreateResult;

/** image/result 返回给客户端的结果。 */
export type UserImageJobResult = AIImageProviderResult;

/** image/result 的查询输入。 */
export interface UserImageJobResultInput {
  /** 图片任务 ID，由 image_create 返回。 */
  job_id: string;
}

/** Provider 在 image_persist 中可读取的图片任务上下文。 */
export interface AIImageJobContext {
  /** async_jobs 中保存的完整任务记录。 */
  record: AsyncJobRecord;
  /** image_create 时的原始输入。 */
  input: Record<string, unknown>;
  /** image_create / image_persist 返回的 provider 状态。 */
  state?: AIImageJobMetadata;
}
