/**
 * SessionCompactionComposer：上下文压缩 Composer 抽象。
 *
 * 关键点（中文）
 * - 负责“何时压缩 + 压缩策略参数”决策。
 * - 具体读写由 SessionHistoryComposer 执行（CompactionComposer 不直接落盘）。
 */

import type { LanguageModel, SystemModelMessage } from "ai";
import { SessionComposer } from "@session/composer/SessionComposer.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";

/**
 * compaction Composer 执行输入。
 */
export type SessionCompactionInput = {
  /**
   * 当前会话 history Composer。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前轮 system messages。
   */
  system: SystemModelMessage[];

  /**
   * 当前重试次数（由 LocalSessionCore 递增）。
   */
  retryCount: number;
};

/**
 * Compaction Composer 抽象类。
 */
export abstract class SessionCompactionComposer extends SessionComposer {
  /**
   * Composer 名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 执行 compact（best-effort）。
   */
  abstract run(input: SessionCompactionInput): Promise<{
    compacted: boolean;
    reason?: string;
  }>;

  /**
   * 判断某次执行错误是否应该触发“压缩后重试”。
   *
   * 关键点（中文）
   * - 由 compaction Composer 实现侧维护错误识别策略。
   * - LocalSessionCore 不感知具体错误文案，只按该布尔结果决定是否重试。
   */
  abstract shouldCompactOnError(error: unknown): boolean;

  /**
   * 可选初始化钩子。
   */
  // 生命周期沿用 SessionComposer 默认实现。
}
