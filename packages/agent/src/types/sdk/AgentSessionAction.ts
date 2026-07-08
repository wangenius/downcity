/**
 * Agent Session action 公开类型。
 *
 * 关键点（中文）
 * - action 是 session records 中的 `type: "action"` 记录。
 * - 同一份结构同时用于 JSONL 持久化与 `session.subscribe()` 实时事件。
 * - action 不进入 LLM 输入；组装模型消息前必须过滤。
 */

import type {
  SessionActionRecordV1,
  SessionActionStateV1,
} from "@/executor/types/SessionRecords.js";

/**
 * Session action 当前状态。
 */
export type AgentSessionActionState = SessionActionStateV1;

/**
 * Session action 记录。
 */
export type AgentSessionActionRecord = SessionActionRecordV1;

/**
 * Session action 订阅事件。
 */
export type AgentSessionActionEvent = SessionActionRecordV1;

/**
 * Session action 发布回调。
 */
export type AgentSessionActionCallback = (
  action: AgentSessionActionEvent,
) => Promise<void>;
