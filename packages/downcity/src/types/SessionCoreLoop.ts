/**
 * SessionCore tool-loop 决策相关类型。
 *
 * 关键点（中文）
 * - 这里只描述“是否继续下一轮”的纯决策输入/输出。
 * - 不携带 runtime 实例，方便在测试中直接做纯函数验证。
 */

/**
 * 单轮 loop 决策输入。
 */
export interface SessionLoopDecisionInput {
  /**
   * 当前 step 是否检测到了不完整响应。
   */
  hasIncompleteResponse: boolean;

  /**
   * 当前已经执行过多少次不完整响应恢复。
   */
  incompleteRecoveryCount: number;

  /**
   * 允许执行的不完整响应恢复上限。
   */
  maxIncompleteRecoveries: number;

  /**
   * text-only 续跑信号名称；为空表示当前没有该信号。
   */
  textOnlyContinuationReason: string | null;

  /**
   * 当前已经执行过多少次 text-only 续跑。
   */
  textOnlyContinuationCount: number;

  /**
   * 允许执行的 text-only 续跑上限。
   */
  maxTextOnlyContinuations: number;

  /**
   * 当前运行是否存在可调用工具。
   */
  hasTools: boolean;

  /**
   * 当前 step 实际产出的工具调用数量。
   */
  toolCallCount: number;
}

/**
 * 单轮 loop 决策结果。
 */
export interface SessionLoopDecision {
  /**
   * 本轮命中的主决策类型。
   */
  kind:
    | "recover_incomplete"
    | "continue_for_tool_calls"
    | "continue_for_text_only"
    | "stop";

  /**
   * 是否因为工具调用而继续下一轮。
   */
  continueForToolCalls: boolean;

  /**
   * 是否因为 text-only 信号而继续下一轮。
   */
  continueForTextOnly: boolean;

  /**
   * 是否因为不完整响应恢复而继续下一轮。
   */
  continueForIncompleteRecovery: boolean;
}
