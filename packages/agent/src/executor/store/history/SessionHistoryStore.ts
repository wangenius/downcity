/**
 * SessionHistoryStore：会话历史事实源接口。
 *
 * 关键点（中文）
 * - Store 负责消息、meta、archive、lock 等持久化能力。
 * - Composer 只负责把 Store 中的历史组装成本轮模型输入。
 * - 这个接口刻意独立于 Composer，避免把“落盘事实源”误当成“组装策略”。
 */

import type { LanguageModel } from "ai";
import type {
  SessionActionMessageV1,
  SessionMessageV1,
  SessionMetadataV1,
} from "@/executor/types/SessionMessages.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type { AgentSessionActionRecord } from "@/types/sdk/AgentSessionAction.js";

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
   * compact 时是否归档旧消息。
   */
  archiveOnCompact: boolean;

  /**
   * 前段压缩比例（0-1）。
   */
  compactRatio: number;

  /**
   * 可选 action 发布回调。
   */
  onAction?: (action: AgentSessionActionRecord) => Promise<void>;
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
   * 追加一条消息到历史。
   */
  append(message: SessionMessageV1): Promise<void>;

  /**
   * 读取当前运行中的 assistant 快照。
   */
  readInflight(): Promise<SessionMessageV1 | null>;

  /**
   * 写入当前运行中的 assistant 快照。
   */
  writeInflight(message: SessionMessageV1): Promise<void>;

  /**
   * 用最终 assistant 收口 inflight 快照。
   */
  finalizeInflight(message?: SessionMessageV1 | null): Promise<void>;

  /**
   * 读取完整消息历史。
   */
  list(): Promise<SessionMessageV1[]>;

  /**
   * 读取消息区间 [start, end)。
   */
  slice(start: number, end: number): Promise<SessionMessageV1[]>;

  /**
   * 读取消息总条数。
   */
  size(): Promise<number>;

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
  }): SessionMessageV1;

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
  }): SessionMessageV1;

  /**
   * 构造 action 消息。
   */
  action(input: {
    /**
     * 当前 action 结构化记录。
     */
    action: AgentSessionActionRecord;

    /**
     * 消息元信息（除 schema 字段）。
     */
    metadata: Pick<SessionMetadataV1, "sessionId"> &
      Partial<Pick<SessionMetadataV1, "ts">>;

    /**
     * 可选消息 ID（默认自动生成）。
     */
    id?: string;
  }): SessionActionMessageV1;
}
