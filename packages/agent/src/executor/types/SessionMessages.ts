/**
 * SessionMessage 类型定义。
 *
 * 关键点（中文）
 * - 这里统一描述 session 消息落盘格式与元信息结构。
 * - session 的唯一事实源是 `UIMessage[]`，不会再维护第二套平行消息结构。
 * - 这些类型会被 history Store、history Composer、compact、control UI、task runtime 共同复用。
 */

import type { UIMessage } from "ai";
import type { JsonObject } from "@/types/common/Json.js";
import type { AgentSessionOperationRecord } from "@/types/sdk/AgentSessionOperation.js";

/**
 * Session 消息：以 UIMessage[] 作为唯一事实源。
 *
 * 关键点（中文）
 * - 持久化存储在 `.downcity/agents/<encodedAgentId>/sessions/<encodedSessionId>/messages/messages.jsonl`
 * - 默认只存 `role=user|assistant`
 * - compact 会把更早消息压缩为一条 `assistant` 摘要消息
 */
export type SessionMessageKind = "normal" | "summary" | "operation";

/**
 * Session 消息来源类型。
 *
 * 说明（中文）
 * - `ingress`：外部输入写入的 user 消息。
 * - `egress`：模型或 agent 输出写入的 assistant 消息。
 * - `compact`：由 compact 过程生成的摘要消息。
 */
export type SessionMessageSource =
  | "ingress"
  | "egress"
  | "compact"
  | "operation";

/**
 * 入站消息细分类型。
 *
 * 说明（中文）
 * - 当前仅保留 `exec`，表示这条入站消息可触发一次 session 执行。
 */
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
  /** 元信息 schema 版本号。 */
  v: 1;
  /** 当前消息写入时的毫秒时间戳。 */
  ts: number;
  /** 当前消息所属的 session ID。 */
  sessionId: string;
  /** 当前消息是普通消息还是摘要消息。 */
  kind?: SessionMessageKind;
  /** 当前消息来自入站、出站还是 compact。 */
  source?: SessionMessageSource;
  /** compact 摘要对应的 archive 文件 ID，用于用户历史按层读取更早消息。 */
  archiveId?: string;
  /** compact 摘要所覆盖的原始消息范围。 */
  sourceRange?: SessionMessageSourceRangeV1;
  /**
   * operation message 对应的结构化操作记录。
   *
   * 说明（中文）
   * - 仅当 `kind=operation` 或 `source=operation` 时存在。
   * - 该字段供前端恢复时间线状态，不会进入 LLM 输入。
   */
  operation?: AgentSessionOperationRecord;
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
  /** 消息角色固定为 `user`。 */
  role: "user";
};

/**
 * 判断一条消息是否为 operation message。
 */
export function isSessionOperationMessage(
  message: SessionMessageV1 | null | undefined,
): boolean {
  if (!message || typeof message !== "object") return false;
  const metadata = (message.metadata || null) as SessionMetadataV1 | null;
  return metadata?.kind === "operation" || metadata?.source === "operation";
}
