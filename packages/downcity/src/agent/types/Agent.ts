/**
 * Core Agent 运行结果与输入类型。
 *
 * 关键点（中文）
 * - `AgentRunInput` 表示上层会话入口输入（例如 context query）。
 * - `AgentExecuteInput` 表示 Agent 通过组件装配后的中间运行态。
 * - 输出仅暴露 assistantMessage（UIMessage）。
 */

import type { Tool } from "ai";
import type { SessionMessageV1 } from "./SessionMessage.js";
import type { SessionSystemMessage } from "./SessionSystemMessage.js";

/**
 * Assistant step 回调入参。
 */
export interface AgentAssistantStepCallbackInput {
  /**
   * 当前 step 生成的文本。
   */
  text: string;

  /**
   * 当前 step 序号（从 1 开始）。
   */
  stepIndex: number;
}

/**
 * Assistant step 完成回调。
 */
export type AgentAssistantStepCallback = (
  input: AgentAssistantStepCallbackInput,
) => Promise<void>;

/**
 * Agent 执行结果。
 */
export interface AgentResult {
  /**
   * 本轮执行是否成功。
   */
  success: boolean;

  /**
   * 最终 assistant 消息。
   */
  assistantMessage: SessionMessageV1;
}

/**
 * Agent 运行入口输入。
 */
export interface AgentRunInput {
  /**
   * 本轮用户输入查询文本。
   */
  query: string;
}

/**
 * Agent 通过组件装配后的中间运行态。
 */
export interface AgentExecuteInput {
  /**
   * 当前轮 system messages。
   */
  system: SessionSystemMessage[];

  /**
   * 当前轮 context 语义消息历史。
   */
  messages: SessionMessageV1[];

  /**
   * 当前轮可用工具集合。
   */
  tools: Record<string, Tool>;
}
