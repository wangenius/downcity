import type { UIMessage } from "ai";
import type { JsonObject } from "@/types/Json.js";
/**
 * Context 消息：以 UIMessage[] 作为唯一事实源。
 *
 * 关键点（中文）
 * - 持久化存储在 `.ship/context/<encodedContextId>/messages/messages.jsonl`
 * - 默认只存 `role=user|assistant`
 * - compact 会把更早消息压缩为一条 `assistant` 摘要消息
 */

export type ShipContextMessageKind = "normal" | "summary";
export type ShipContextMessageSource = "ingress" | "egress" | "compact";

export type ShipMessageSourceRangeV1 = {
  fromId: string;
  toId: string;
  count: number;
};

export type ShipContextMetadataV1 = {
  /** schema 版本 */
  v: 1;
  /** 记录时间戳（ms） */
  ts: number;
  /** 会话 ID */
  contextId: string;
  /** 请求链路 ID */
  requestId?: string;
  /** normal/summary */
  kind?: ShipContextMessageKind;
  /** ingress/egress/compact */
  source?: ShipContextMessageSource;
  /** compact 来源范围 */
  sourceRange?: ShipMessageSourceRangeV1;
  /** 扩展元信息 */
  extra?: JsonObject;
};

export type ShipContextMessageV1 = UIMessage<ShipContextMetadataV1>;
