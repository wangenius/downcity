/**
 * Session 运行结果与输入类型。
 *
 * 关键点（中文）
 * - `SessionRunInput` 表示上层会话入口输入（例如 context query）。
 * - `SessionExecuteInput` 表示 LocalSessionCore 通过 Composer 装配后的中间运行态。
 * - 输出仅暴露 assistantMessage（UIMessage）。
 */

import type { Tool } from "ai";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionSystemMessage } from "@/types/session/SessionPrompts.js";

/**
 * Assistant step 可见性。
 *
 * 说明（中文）
 * - `visible`：ACP `agent_message_chunk` 或普通模型文本，属于用户可见回复。
 * - `internal`：ACP `agent_thought_chunk` 等内部过程，应作为 reasoning 保留，但不能混入普通 text。
 */
export type SessionAssistantStepVisibility = "visible" | "internal";

/**
 * Assistant step 回调入参。
 */
export interface SessionAssistantStepCallbackInput {
  /**
   * 当前 step 生成的文本。
   */
  text: string;

  /**
   * 当前 step 序号（从 1 开始）。
   */
  stepIndex: number;

  /**
   * 当前 step 的可见性。
   *
   * 关键点（中文）
   * - 未声明时按 `visible` 处理，兼容本地模型与旧调用方。
   * - `internal` 会落盘为 reasoning part，外部渠道不应当成普通回复文本发送。
   */
  visibility?: SessionAssistantStepVisibility;

  /**
   * 当前 step 的原始结果对象。
   *
   * 关键点（中文）
   * - 由运行时直接透传，供持久化层提取 tool call / tool result 顺序事件。
   * - 外部调用方不应依赖其稳定结构，只能做 best-effort 读取。
   */
  stepResult?: unknown;
}

/**
 * Assistant step 完成回调。
 */
export type SessionAssistantStepCallback = (
  input: SessionAssistantStepCallbackInput,
) => Promise<void>;

/**
 * Session 执行结果。
 */
export interface SessionRunResult {
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
 * Session 运行入口输入。
 */
export interface SessionRunInput {
  /**
   * 本轮用户输入查询文本。
   */
  query: string;
}

/**
 * LocalSessionCore 通过 Composer 装配后的中间运行态。
 */
export interface SessionExecuteInput {
  /**
   * 当前轮用户查询文本。
   */
  query: string;

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
