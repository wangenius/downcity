/**
 * SessionCoreLoop：SessionCore 执行循环的纯决策模块。
 *
 * 关键点（中文）
 * - 把 “是否继续下一轮” 的分支优先级从 SessionCore 主流程中拆出。
 * - 保持纯函数，不依赖模型、持久化或 logger，便于直接测试。
 */

import type {
  SessionLoopDecision,
  SessionLoopDecisionInput,
} from "@/types/SessionCoreLoop.js";

/**
 * 评估当前 step 完成后，SessionCore 是否应继续下一轮。
 *
 * 优先级（中文）
 * 1. 不完整响应恢复
 * 2. 已发生的工具调用
 * 3. text-only 自动续跑
 * 4. 停止
 */
export function evaluateSessionLoopDecision(
  input: SessionLoopDecisionInput,
): SessionLoopDecision {
  if (
    input.hasIncompleteResponse &&
    input.incompleteRecoveryCount < input.maxIncompleteRecoveries
  ) {
    return {
      kind: "recover_incomplete",
      continueForToolCalls: false,
      continueForTextOnly: false,
      continueForIncompleteRecovery: true,
    };
  }

  if (input.toolCallCount > 0) {
    return {
      kind: "continue_for_tool_calls",
      continueForToolCalls: true,
      continueForTextOnly: false,
      continueForIncompleteRecovery: false,
    };
  }

  if (
    input.textOnlyContinuationReason !== null &&
    input.hasTools &&
    input.textOnlyContinuationCount < input.maxTextOnlyContinuations
  ) {
    return {
      kind: "continue_for_text_only",
      continueForToolCalls: false,
      continueForTextOnly: true,
      continueForIncompleteRecovery: false,
    };
  }

  return {
    kind: "stop",
    continueForToolCalls: false,
    continueForTextOnly: false,
    continueForIncompleteRecovery: false,
  };
}
