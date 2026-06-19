/**
 * `city agent chat` 交互式 TUI 入口。
 *
 * 关键点（中文）
 * - 该模块只做协调器创建与生命周期对接，不再直接持有 UI 状态。
 * - 真实的渲染、输入、布局逻辑在 `tui/AgentChatTuiCoordinator` 中。
 */
import { AgentChatTuiCoordinator } from "./tui/AgentChatTuiCoordinator.js";
/**
 * 启动 city agent chat 的交互式 TUI。
 *
 * @param params 启动参数。
 */
export async function run_agent_chat_tui(params) {
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
//# sourceMappingURL=AgentChatTui.js.map