/**
 * Agent Session action 类型定义。
 *
 * 关键点（中文）
 * - action 描述 session 内部正在发生的辅助动作，不代表 assistant 正文。
 * - action 同时用于 `session.subscribe()` 实时事件与 JSONL history item。
 * - action 只服务前端状态展示与历史回放，不进入 LLM 输入。
 */

/**
 * Session action 当前状态。
 */
export type AgentSessionActionState = "running" | "completed" | "failed";

/**
 * Session action 记录。
 */
export interface AgentSessionActionRecord {
  /**
   * 同一个 action 生命周期内稳定复用的 ID。
   *
   * 说明（中文）
   * - 这是 history item envelope 字段，用于把同一个动作更新为一条记录。
   * - 前端展示语义只依赖 `type/title/description/state`。
   */
  id: string;

  /**
   * 当前 action 标题。
   */
  title: string;

  /**
   * 当前 action 描述。
   */
  description?: string;

  /**
   * 当前 action 状态。
   */
  state: AgentSessionActionState;

  /**
   * 当前 action 关联的 turn 标识。
   */
  turnId?: string;

  /**
   * 是否建议前端展示。
   *
   * 说明（中文）
   * - 默认视为 `true`。
   * - 调试或审计类辅助事件可显式写入 `false`。
   */
  visible?: boolean;
}

/**
 * Session action 订阅事件。
 */
export interface AgentSessionActionEvent
  extends Omit<AgentSessionActionRecord, "visible"> {
  /**
   * 当前事件类型。
   */
  type: "action";

  /**
   * 当前 session 唯一标识。
   */
  sessionId: string;
}

/**
 * Session action 发布回调。
 */
export type AgentSessionActionCallback = (
  action: AgentSessionActionEvent,
) => Promise<void>;
