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
import type { TranscriptEntry } from "@/city/agent/tui/types.js";
import type { AgentChatModelChoice } from "@/city/agent/tui/types/ModelPicker.js";

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
  /** 列出远程 session。 */
  list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
  /** 创建新 session。 */
  create_session: () => Promise<{ session_id: string }>;
  /** 列出 Federation 当前可用于对话的模型。 */
  list_models: () => Promise<AgentChatModelChoice[]>;
  /** 更新指定 Session 的模型。 */
  update_session_model: (session_id: string, model_id: string) => Promise<void>;
  /** 加载指定 session 历史。 */
  load_session_history: (session_id: string) => Promise<{
    title: string;
    model_id?: string;
    model_name?: string;
    entries: TranscriptEntry[];
  }>;
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

  /** 批准 unrestricted sandbox 审批请求。 */
  approve: (approval_id: string) => Promise<{ success: boolean; decision: string }>;

  /** 拒绝 unrestricted sandbox 审批请求。 */
  deny: (approval_id: string) => Promise<{ success: boolean; decision: string }>;
}): Promise<void> {
  const coordinator = new AgentChatTuiCoordinator({
    agent_id: params.agent_id,
    session_id: params.session_id,
    list_sessions: params.list_sessions,
    create_session: params.create_session,
    list_models: params.list_models,
    update_session_model: params.update_session_model,
    load_session_history: params.load_session_history,
    run_turn: params.run_turn,
    approve: params.approve,
    deny: params.deny,
  });

  await coordinator.run();
}
