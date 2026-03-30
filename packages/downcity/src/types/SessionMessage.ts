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

/**
 * 摘要消息对应的原始消息范围。
 */
export type SessionMessageSourceRangeV1 = {
  /** 起始消息 ID。 */
  fromId: string;
  /** 结束消息 ID。 */
  toId: string;
  /** 被覆盖的原始消息数量。 */
  count: number;
};

/**
 * Session 消息元信息。
 */
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
   *   - `exec`：可触发 Session 执行的输入
   */
  extra?: JsonObject;
};

/**
 * Session UI 消息结构。
 */
export type SessionMessageV1 = UIMessage<SessionMetadataV1>;

/**
 * user 角色的 Session 消息结构。
 */
export type SessionUserMessageV1 = SessionMessageV1 & {
  /** 消息角色固定为 user。 */
  role: "user";
};
