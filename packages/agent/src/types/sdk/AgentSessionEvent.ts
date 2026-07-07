/**
 * Agent Session 事件类型定义。
 *
 * 关键点（中文）
 * - `subscribe()` 暴露的是 session 级长期事件序列，而不是单次执行的局部结果。
 * - 事件只表达“当前 turn 正在发生什么”，不负责历史回放。
 */

import type { JsonValue } from "@/types/common/Json.js";
import type { SessionAssistantStepVisibility } from "@/executor/types/SessionRun.js";
import type { AgentSessionOperationEvent } from "@/types/sdk/AgentSessionOperation.js";

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
  toolName: "shell_exec" | "shell_session" | "shell_write" | string;

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
  toolName: "shell_exec" | "shell_session" | "shell_write" | string;

  /**
   * 当前工具输出结果。
   */
  result: JsonValue;
}

/**
 * 工具审批请求事件。
 */
export interface AgentSessionToolApprovalRequestEvent {
  /**
   * 当前事件类型。
   */
  type: "tool-approval-request";

  /**
   * 当前审批所属 turn。
   */
  turnId: string;

  /**
   * 当前工具调用唯一标识。
   */
  toolCallId: string;

  /**
   * 当前工具名称。
   */
  toolName: "shell_exec" | "shell_session" | "shell_write" | string;

  /**
   * 当前审批请求唯一标识。
   */
  approvalId: string;

  /**
   * 请求执行的 sandbox 模式。
   */
  sandbox: "unrestricted";

  /**
   * 请求执行的命令文本。
   *
   * 说明（中文）
   * - `shell_exec` / `shell_session` start 中是命令文本。
   * - `shell_write` 中是 stdin 写入内容，用于兼容内部审批展示。
   */
  cmd: string;

  /**
   * 当前审批动作类型。
   */
  operation?: "exec" | "start" | "write";

  /**
   * 关联 shell_id；session 输入审批时用于标识目标会话。
   */
  shellId?: string;

  /**
   * stdin 写入内容预览；仅 session 输入审批存在。
   */
  inputPreview?: string;

  /**
   * stdin 写入字符数；仅 session 输入审批存在。
   */
  inputChars?: number;

  /**
   * 命令执行目录。
   */
  cwd: string;

  /**
   * Agent 给用户展示的申请原因。
   */
  reason: string;

  /**
   * 当前审批状态。
   */
  status: "pending";
}

/**
 * 工具审批结果事件。
 */
export interface AgentSessionToolApprovalResultEvent {
  /**
   * 当前事件类型。
   */
  type: "tool-approval-result";

  /**
   * 当前审批所属 turn。
   */
  turnId: string;

  /**
   * 当前工具调用唯一标识。
   */
  toolCallId: string;

  /**
   * 当前工具名称。
   */
  toolName: "shell_exec" | "shell_session" | "shell_write" | string;

  /**
   * 当前审批请求唯一标识。
   */
  approvalId: string;

  /**
   * 用户最终决策。
   */
  decision: "approved" | "denied" | "expired";
}

/**
 * assistant step 完成事件。
 */
export interface AgentSessionAssistantStepEvent {
  /**
   * 当前事件类型。
   */
  type: "assistant-step";

  /**
   * 当前 assistant step 所属 turn。
   */
  turnId: string;

  /**
   * 当前 step 文本。
   */
  text: string;

  /**
   * 当前 step 序号（从 1 开始）。
   */
  stepIndex: number;

  /**
   * 当前 step 可见性。
   */
  visibility?: SessionAssistantStepVisibility;
}

/**
 * Session 标题更新事件。
 */
export interface AgentSessionTitleEvent {
  /**
   * 当前事件类型。
   */
  type: "session-title";

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;

  /**
   * 当前 session 最新标题。
   *
   * 说明（中文）
   * - 标题已持久化到 session meta。
   * - 新 session 通常在首条 user message 落盘后生成标题。
   */
  title: string;
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
  | AgentSessionToolApprovalRequestEvent
  | AgentSessionToolApprovalResultEvent
  | AgentSessionAssistantStepEvent
  | AgentSessionTitleEvent
  | AgentSessionOperationEvent
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
