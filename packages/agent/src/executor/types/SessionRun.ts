/**
 * Session 运行结果与输入类型。
 *
 * 关键点（中文）
 * - `SessionRunInput` 表示上层会话入口输入（例如 context query）。
 * - `SessionExecuteInput` 表示 Executor 通过 Composer 装配后的中间运行态。
 * - 输出仅暴露 assistantMessage（UIMessage）。
 */

import type { Tool, UIMessageChunk } from "ai";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import type { SessionUserMessageV1 } from "@/executor/types/SessionMessages.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

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
 * UI stream chunk 回调入参。
 *
 * 关键点（中文）
 * - 这里直接复用 AI SDK 的 `UIMessageChunk` 结构，避免在 session 内核层再复制一套协议。
 * - SDK / HTTP 若需要自己的事件模型，应在更上层做映射。
 */
export type SessionUiMessageChunk = UIMessageChunk;

/**
 * UI stream chunk 回调。
 */
export type SessionUiMessageChunkCallback = (
  chunk: SessionUiMessageChunk,
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
   * 失败时的错误信息（成功时为空）。
   */
  error?: string;

  /**
   * 最终 assistant 消息。
   */
  assistantMessage: SessionMessageV1;

  /**
   * 本轮执行结束后待写入长期历史的 user 消息。
   *
   * 关键点（中文）
   * - 这些消息通常由 tool 运行时在执行过程中动态注入。
   * - 为保证消息顺序稳定，统一在 assistant 结果落盘后再由外层 Session 持久化。
   */
  deferredPersistedUserMessages?: SessionUserMessageV1[];
}

/**
 * Session 运行入口输入。
 */
export interface SessionRunInput {
  /**
   * 本轮用户输入查询文本。
   */
  query: string;

  /**
   * 本轮显式运行上下文。
   *
   * 关键点（中文）
   * - 这里承载 step 合并、UI chunk 回调等跨组件运行期数据。
   * - 若未传入，则由执行器按最小默认值兜底创建。
   */
  runContext?: SessionRunContext;
}

/**
 * Executor 通过 Composer 装配后的中间运行态。
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
