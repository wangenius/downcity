import type { SessionMutation } from "@downcity/agent";

/**
 * `city agent chat` 交互式渲染相关类型。
 *
 * 职责说明（中文）
 * - 统一承接交互式 chat 的终端展示快照与 tool 区块类型。
 * - 保持类型集中在 `types/` 目录，便于后续扩展与跨模块复用。
 */

/**
 * 交互式 chat 渲染结果快照。
 */
export interface AgentChatInteractiveRenderSnapshot {
  /** 是否输出过面向用户可见的 assistant 文本。 */
  emitted_visible_text: boolean;
}

/**
 * 交互式 chat 渲染器协议。
 *
 * 关键点（中文）
 * - 统一约束 stdout 版与 TUI 版渲染器，直接消费 canonical Mutation。
 */
export interface AgentChatInteractiveRendererPort {
  /** 启动一轮新渲染。 */
  start_turn: () => void;

  /** 绑定当前 turn id。 */
  attach_turn_id: (turn_id: string) => void;

  /** 渲染单个 session 事件。 */
  render_event: (event: SessionMutation) => void;

  /**
   * 当 unrestricted sandbox 审批请求到达时触发。
   *
   * 说明（中文）
   * - 由 TUI 实现弹窗选择器；stdout 版可忽略。
   */
  on_approval_request?: (params: {
    approval_id: string;
    tool_name: string;
    cmd: string;
    cwd: string;
    reason: string;
  }) => void;

  /** 结束当前一轮渲染。 */
  finish_turn: () => AgentChatInteractiveRenderSnapshot;
}

/**
 * tool 展示区块。
 */
export interface AgentChatToolDisplayBlock {
  /** tool 状态标题。 */
  title: string;
  /** tool 详细摘要行。 */
  detail_lines: string[];
}
