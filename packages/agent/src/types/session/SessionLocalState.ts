/**
 * SessionLocalState：本地 Session 运行态快照。
 *
 * 关键点（中文）
 * - 这里承载本地 Session 在内存中的可变运行态。
 * - state / turn / view 三类 service 通过共享该对象协作，避免彼此复制状态。
 * - 这里只保存运行态，不承载行为逻辑。
 */

import type { AgentSessionConfigSnapshot } from "@/types/agent/SessionTypes.js";

/**
 * 本地 Session 内存状态。
 */
export interface SessionLocalState {
  /**
   * 当前 session 配置快照。
   */
  sessionConfig: AgentSessionConfigSnapshot;

  /**
   * 当前模型 turn 实际使用的 Session 配置。
   *
   * 关键点（中文）
   * - `sessionConfig` 是配置 API 最近一次成功写入的 configured state。
   * - 该字段只在模型 turn 开始前由队列 mutation 更新。
   */
  effective_session_config: AgentSessionConfigSnapshot;

  /**
   * 当前 session 创建时间（毫秒时间戳）。
   */
  createdAt: number;

  /**
   * 当前 session 参考时区。
   */
  timezone: string;

  /**
   * initialize() 过程中的并发复用 Promise。
   */
  initializePromise: Promise<void> | null;

  /**
   * ensureReadyForExecution() 过程中的并发复用 Promise。
   */
  ensureConfiguredPromise: Promise<void> | null;
}
