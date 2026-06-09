/**
 * `town agent chat` TUI 聊天界面。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 readline 持续对话。
 * - 顶部展示当前 agent / session，中央滚动展示消息与 tool 事件，底部输入。
 * - 只负责交互式持续对话；一次性 `--message` 仍走原有脚本化路径。
 */
import type { AgentChatInteractiveRendererPort } from "../types/AgentChatInteractive.js";
/**
 * 打开 TUI 聊天面板。
 */
export declare function run_agent_chat_tui(params: {
    agent_id: string;
    run_turn: (input: {
        message: string;
        interactive_renderer: AgentChatInteractiveRendererPort;
    }) => Promise<{
        success: boolean;
        error?: string;
        emitted_visible_text: boolean;
        text?: string;
    }>;
}): Promise<void>;
//# sourceMappingURL=AgentChatTui.d.ts.map