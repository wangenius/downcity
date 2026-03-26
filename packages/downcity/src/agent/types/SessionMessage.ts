import type { UIMessage } from "ai";
import type { JsonObject } from "@/types/Json.js";
/**
 * Session 消息：以 UIMessage[] 作为唯一事实源。
 *
 * 关键点（中文）
 * - 持久化存储在 `.downcity/session/<encodedSessionId>/messages/messages.jsonl`
 * - 默认只存 `role=user|assistant`
 * - compact 会把更早消息压缩为一条 `assistant` 摘要消息
 */
export type SessionMessageKind = "normal" | "summary";
export type SessionMessageSource = "ingress" | "egress" | "compact";
export type SessionIngressKind = "exec";

export type SessionMessageSourceRangeV1 = {
  fromId: string;
  toId: string;
  count: number;
};

export type SessionMetadataV1 = {
  /** schema 版本 */
  v: 1;
  /** 记录时间戳（ms） */
  ts: number;
  /** 会话 ID */
  sessionId: string;
  /** 请求链路 ID */
  requestId?: string;
  /** normal/summary */
  kind?: SessionMessageKind;
  /** ingress/egress/compact */
  source?: SessionMessageSource;
  /** compact 来源范围 */
  sourceRange?: SessionMessageSourceRangeV1;
  /**
   * 扩展元信息。
   *
   * 约定（中文）
   * - 对 `source=ingress` 的 user 消息，可选写入 `extra.ingressKind`：
   *   - `exec`：可触发 agent 执行的输入
   */
  extra?: JsonObject;
};

export type SessionMessageV1 = UIMessage<SessionMetadataV1>;
export type SessionUserMessageV1 = SessionMessageV1 & {
  role: "user";
};
