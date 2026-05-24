/**
 * Agent Session 事件类型定义。
 *
 * 关键点（中文）
 * - `subscribe()` 暴露的是 session 级长期事件序列，而不是单次执行的局部结果。
 * - 事件只表达“当前 turn 正在发生什么”，不负责历史回放。
 */

import type { JsonValue } from "@/types/common/Json.js";

/**
 * 单个 turn 开始事件。
 */
export interface AgentSessionTurnStartEvent {
  /**
   * 当前事件类型。
   */
  type: "turn-start";

  /**
   * 当前 turn 的稳定标识。
   *
   * 说明（中文）
   * - 同一个 turn 内的全部增量事件都会复用这个 turnId。
   * - 当 Session 排队进入下一轮时，会生成新的 turnId。
   */
  turnId: string;
}

/**
 * 普通文本增量事件。
 */
export interface AgentSessionTextDeltaEvent {
  /**
   * 当前事件类型。
   */
  type: "text-delta";

  /**
   * 当前文本所属 turn。
   */
  turnId: string;

  /**
   * 当前这次新增的可见文本片段。
   */
  text: string;
}

/**
 * reasoning 文本增量事件。
 */
export interface AgentSessionReasoningDeltaEvent {
  /**
   * 当前事件类型。
   */
  type: "reasoning-delta";

  /**
   * 当前 reasoning 所属 turn。
   */
  turnId: string;

  /**
   * 当前这次新增的 reasoning 文本片段。
   */
  text: string;
}

/**
 * 工具调用事件。
 */
export interface AgentSessionToolCallEvent {
  /**
   * 当前事件类型。
   */
  type: "tool-call";

  /**
   * 当前工具调用所属 turn。
   */
  turnId: string;

  /**
   * 当前工具调用唯一标识。
   */
  toolCallId: string;

  /**
   * 当前工具名称。
   */
  toolName: string;

  /**
   * 当前工具输入参数。
   */
  args: JsonValue;
}

/**
 * 工具结果事件。
 */
export interface AgentSessionToolResultEvent {
  /**
   * 当前事件类型。
   */
  type: "tool-result";

  /**
   * 当前工具结果所属 turn。
   */
  turnId: string;

  /**
   * 当前工具调用唯一标识。
   */
  toolCallId: string;

  /**
   * 当前工具名称。
   */
  toolName: string;

  /**
   * 当前工具输出结果。
   */
  result: JsonValue;
}

/**
 * 单个 turn 完成事件。
 */
export interface AgentSessionTurnFinishEvent {
  /**
   * 当前事件类型。
   */
  type: "turn-finish";

  /**
   * 当前已完成 turn 的稳定标识。
   */
  turnId: string;

  /**
   * 当前 turn 最终可见文本。
   */
  text: string;

  /**
   * 当前 turn 是否成功结束。
   */
  success: boolean;

  /**
   * 当前 turn 失败时的错误文本。
   */
  error?: string;
}

/**
 * Session 级错误事件。
 */
export interface AgentSessionErrorEvent {
  /**
   * 当前事件类型。
   */
  type: "error";

  /**
   * 当前错误文本。
   */
  message: string;
}

/**
 * Session 订阅可见事件联合类型。
 */
export type AgentSessionEvent =
  | AgentSessionTurnStartEvent
  | AgentSessionTextDeltaEvent
  | AgentSessionReasoningDeltaEvent
  | AgentSessionToolCallEvent
  | AgentSessionToolResultEvent
  | AgentSessionTurnFinishEvent
  | AgentSessionErrorEvent;

/**
 * Session 事件订阅回调。
 */
export type AgentSessionSubscriber = (event: AgentSessionEvent) => void;

/**
 * 取消 Session 订阅的返回函数。
 */
export type AgentSessionUnsubscribe = () => void;
