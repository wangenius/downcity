/**
 * `city agent chat` 交互式 TUI 入口。
 *
 * 关键点（中文）
 * - 该模块只做协调器创建与生命周期对接，不再直接持有 UI 状态。
 * - 真实的渲染、输入、布局逻辑在 `tui/AgentChatTuiCoordinator` 中。
 */

import { AgentChatTuiCoordinator } from "@/city/agent/tui/AgentChatTuiCoordinator.js";
import type { AgentChatInteractiveRendererPort } from "@/city/types/AgentChatInteractive.js";
import type { AgentChatSessionSummaryView } from "@/city/agent/AgentChatTypes.js";

/**
 * 启动 city agent chat 的交互式 TUI。
 *
 * @param params 启动参数。
 */
export async function run_agent_chat_tui(params: {
  /** 目标 agent id。 */
  agent_id: string;
  /** 初始 session id。 */
  session_id: string;
  /** 是否在启动后立刻弹出 session picker，等同于 `/session` 命令。 */
  show_initial_picker?: boolean;
  /** 列出远程 session。 */
  list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
  /** 创建新 session。 */
  create_session: () => Promise<{ session_id: string }>;
  /** 执行一轮对话。 */
  run_turn: (input: {
    session_id: string;
    message: string;
    interactive_renderer: AgentChatInteractiveRendererPort;
  }) => Promise<{
    success: boolean;
    error?: string;
    emitted_visible_text: boolean;
    text?: string;
  }>;
}): Promise<void> {
  const coordinator = new AgentChatTuiCoordinator({
    agent_id: params.agent_id,
    session_id: params.session_id,
    list_sessions: params.list_sessions,
    create_session: params.create_session,
    run_turn: params.run_turn,
  });

  await coordinator.run({
    show_initial_picker: params.show_initial_picker === true,
  });
}
