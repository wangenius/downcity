/**
 * SessionHistoryStore：会话 record 事实源接口。
 *
 * 关键点（中文）
 * - Store 负责 records、meta、archive、lock 等持久化能力。
 * - Composer 只负责把 Store 中的模型消息 record 组装成本轮模型输入。
 * - 这个接口刻意独立于 Composer，避免把“落盘事实源”误当成“组装策略”。
 */

import type { LanguageModel } from "ai";
import type {
  SessionActionRecordV1,
  SessionRecordV1,
  SessionMetadataV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";

/**
 * compact 输入参数。
 */
export type SessionHistoryCompactInput = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前轮 system messages。
   */
  system: SessionSystemMessage[];

  /**
   * 保留最近消息条数。
   */
  keepLastMessages: number;

  /**
   * 输入 token 近似上限。
   */
  maxInputTokensApprox: number;

  /**
   * 前段压缩比例（0-1）。
   */
  compactRatio: number;

  /**
   * 可选 action 发布回调。
   */
  onAction?: (action: SessionActionRecordV1) => Promise<void>;
};

/**
 * 会话历史事实源。
 */
export interface SessionHistoryStore {
  /**
   * 当前会话 ID。
   */
  readonly sessionId: string;

  /**
   * 写入一条 session record。
   *
   * 说明（中文）
   * - 模型消息会追加到 JSONL。
   * - action record 会按稳定 ID upsert 为同一条 record。
   */
  write_record(message: SessionRecordV1): Promise<void>;

  /**
   * 读取当前运行中的 assistant 快照。
   */
  read_inflight(): Promise<SessionRecordV1 | null>;

  /**
   * 写入当前运行中的 assistant 快照。
   */
  write_inflight(message: SessionRecordV1): Promise<void>;

  /**
   * 用最终 assistant 收口 inflight 快照。
   */
  finalize_inflight(message?: SessionRecordV1 | null): Promise<void>;

  /** 读取当前模型上下文所需的 session records。 */
  list_records(): Promise<SessionRecordV1[]>;

  /** 读取当前模型上下文 record 区间 [start, end)。 */
  slice_records(start: number, end: number): Promise<SessionRecordV1[]>;

  /** 读取当前模型上下文 record 总条数。 */
  record_count(): Promise<number>;

  /**
   * 读取元信息。
   */
  meta(): Promise<Record<string, unknown>>;

  /**
   * 执行一次 compact（best-effort）。
   */
  compact(input: SessionHistoryCompactInput): Promise<{
    compacted: boolean;
    reason?: string;
  }>;

  /**
   * 构造 user 文本消息。
   */
  userText(input: {
    /**
     * 用户文本内容。
     */
    text: string;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;
  }): SessionRecordV1;

  /**
   * 构造 assistant 文本消息。
   */
  assistantText(input: {
    /**
     * 助手文本内容。
     */
    text: string;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;

    /**
     * 消息种类（普通/摘要）。
     */
    kind?: "normal" | "summary";

    /**
     * 消息来源（egress/compact）。
     */
    source?: "egress" | "compact";
  }): SessionRecordV1;

  /**
   * 构造 action 消息。
   */
  action(input: {
    /**
     * 当前 action 结构化记录。
     */
    action: SessionActionRecordV1;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Pick<SessionMetadataV1, "sessionId"> &
      Partial<Pick<SessionMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;
  }): SessionActionRecordV1;
}
