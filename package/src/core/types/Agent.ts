/**
 * Core Agent 运行结果与输入类型。
 *
 * 关键点（中文）
 * - 仅描述 core runtime 的最小输入/输出契约
 * - 不包含具体实现细节
 * - 输出仅暴露 assistantMessage（UIMessage）
 */

import type {
  ShipContextMessageV1,
  ShipContextUserMessageV1,
} from "./ContextMessage.js";

export interface AgentResult {
  success: boolean;
  assistantMessage: ShipContextMessageV1;
}

export interface AgentRunInput {
  contextId: string;
  query: string;
  /**
   * 在 tool-loop 的 step 边界执行回调，拉取同 lane 新增的用户消息（UIMessage）。
   *
   * 关键点（中文）
   * - 返回值仅包含“需要并入当前 run 的 user UIMessage”
   * - 返回空数组表示当前无新增消息
   */
  onStepCallback?: () => Promise<ShipContextUserMessageV1[]>;
}
