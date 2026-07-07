/**
 * SessionCompactionComposer：上下文压缩 Composer 抽象。
 *
 * 关键点（中文）
 * - 负责“何时压缩 + 压缩策略参数”决策。
 * - 具体读写由 SessionHistoryStore 执行（CompactionComposer 不直接落盘）。
 */

import type { LanguageModel, SystemModelMessage } from "ai";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { AgentSessionOperationRecord } from "@/types/sdk/AgentSessionOperation.js";

/**
 * compaction Composer 执行输入。
 */
export type SessionCompactionInput = {
  /**
   * 当前会话 history Store。
   */
  historyStore: SessionHistoryStore;

  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前轮 system messages。
   */
  system: SystemModelMessage[];

  /**
   * 当前重试次数（由 Executor 递增）。
   */
  retryCount: number;

  /**
   * 可选 operation 发布回调。
   *
   * 说明（中文）
   * - 默认 compaction Composer 可在真正开始压缩时发布 `compacting`。
   * - 回调由上层 Session 负责转成订阅事件与 operation message。
   */
  onOperation?: (operation: AgentSessionOperationRecord) => Promise<void>;
};

/**
 * Compaction Composer 协议。
 */
export interface SessionCompactionComposer {
  /**
   * Composer 名（由具体实现声明）。
   */
  readonly name: string;

  /**
   * 执行 compact（best-effort）。
   */
  run(input: SessionCompactionInput): Promise<{
    compacted: boolean;
    reason?: string;
  }>;

  /**
   * 判断某次执行错误是否应该触发“压缩后重试”。
   *
   * 关键点（中文）
   * - 由 compaction Composer 实现侧维护错误识别策略。
   * - Executor 不感知具体错误文案，只按该布尔结果决定是否重试。
   */
  shouldCompactOnError(error: unknown): boolean;
}
