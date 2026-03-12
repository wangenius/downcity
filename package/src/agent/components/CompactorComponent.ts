/**
 * CompactorComponent：上下文压缩组件抽象。
 *
 * 关键点（中文）
 * - 负责“何时压缩 + 压缩策略参数”决策。
 * - 具体读写由 Persistor 执行（Compactor 不直接落盘）。
 */

import type { LanguageModel, SystemModelMessage } from "ai";
import { AgentComponent } from "./AgentComponent.js";
import type { PersistorComponent } from "./PersistorComponent.js";

/**
 * compactor 执行输入。
 */
export type CompactorRunInput = {
  /**
   * 当前会话 persistor。
   */
  persistor: PersistorComponent;

  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 当前轮 system messages。
   */
  system: SystemModelMessage[];

  /**
   * 当前重试次数（由 Agent 递增）。
   */
  retryCount: number;
};

/**
 * Compactor 组件抽象类。
 */
export abstract class CompactorComponent extends AgentComponent {
  /**
   * 组件名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 执行 compact（best-effort）。
   */
  abstract run(input: CompactorRunInput): Promise<{
    compacted: boolean;
    reason?: string;
  }>;

  /**
   * 判断某次执行错误是否应该触发“压缩后重试”。
   *
   * 关键点（中文）
   * - 由 compactor 实现侧维护错误识别策略。
   * - Agent 不感知具体错误文案，只按该布尔结果决定是否重试。
   */
  abstract shouldCompactOnError(error: unknown): boolean;

  /**
   * 可选初始化钩子。
   */
  // 生命周期沿用 AgentComponent 默认实现。
}
