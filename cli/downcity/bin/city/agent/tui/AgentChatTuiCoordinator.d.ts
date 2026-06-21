/**
 * city agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code 的 KimiTUI 布局：transcript + status/activity + editor。
 * - transcript 使用可滚动消息流，支持 PageUp/PageDown 回看历史。
 * - 编辑器负责消费标准快捷键（Ctrl+C/D/O/S），再回调 coordinator。
 */
import type { AgentChatSessionSummaryView } from "../../../city/agent/AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "../../../city/types/AgentChatInteractive.js";
/**
 * 协调器构造选项。
 */
export interface AgentChatTuiCoordinatorOptions {
    /** 目标 agent id。 */
    agent_id: string;
    /** 初始 session id。 */
    session_id: string;
    /** 列出远程 session。 */
    list_sessions: () => Promise<AgentChatSessionSummaryView[]>;
    /** 创建新 session。 */
    create_session: () => Promise<{
        session_id: string;
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
}
/**
 * Agent chat TUI 协调器。
 */
export declare class AgentChatTuiCoordinator {
    private readonly options;
    private readonly terminal;
    private readonly tui;
    private readonly status_line;
    private readonly message_list;
    private readonly editor;
    private app_state;
    private current_session_id;
    private running;
    private stopped;
    private resolve_run;
    private overlay_handle;
    private remove_input_listener;
    private is_initial_picker;
    /**
     * 全局 tool output 展开状态。
     * 对齐 Kimi Code：Ctrl+O 统一切换所有 tool 卡片，
     * 新创建的 tool 卡片也会沿用当前状态。
     */
    private tool_output_expanded;
    /**
     * slash 命令宿主，解耦命令分发与 coordinator 内部实现。
     */
    private get slash_command_host();
    /**
     * @param options 协调器选项。
     */
    constructor(options: AgentChatTuiCoordinatorOptions);
    /**
     * 启动 TUI 并进入事件循环。
     *
     * @param options 启动选项。
     * @returns TUI 停止后 resolve。
     */
    run(options?: {
        show_initial_picker?: boolean;
    }): Promise<void>;
    /**
     * 停止 TUI 并清理资源。
     */
    stop(): Promise<void>;
    /**
     * 请求重新渲染。
     */
    private request_render;
    /**
     * 计算消息流当前可用的可视高度。
     */
    private get_message_list_viewport_height;
    /**
     * 处理用户输入。
     *
     * @param raw_text 原始输入文本。
     */
    private handle_user_input;
    /**
     * 执行一轮对话。
     *
     * @param message 用户消息。
     */
    private run_turn;
    /**
     * 显示 session 选择器弹窗。
     *
     * @param is_initial 是否为启动时的初始选择器。
     */
    private show_session_picker;
    /**
     * 隐藏 session 选择器。
     */
    private hide_session_picker;
    /**
     * 创建新 session 并切换视图。
     */
    private create_new_session;
    /**
     * 切换到指定 session。
     *
     * @param session_id 目标 session id。
     */
    private switch_session;
    /**
     * 添加用户消息。
     *
     * @param text 用户文本。
     */
    private add_user_message;
    /**
     * 添加状态提示。
     *
     * @param text 状态文本。
     */
    private add_status_message;
    /**
     * 添加错误提示。
     *
     * @param text 错误文本。
     */
    private add_error_message;
    /**
     * 全局键盘输入处理。
     *
     * @param data pi-tui 输入数据。
     * @returns 是否消费该输入。
     */
    private handle_global_input;
    /**
     * 构建终端标题。
     */
    private build_title;
    /**
     * 格式化错误对象。
     *
     * @param error 错误对象。
     * @returns 错误文本。
     */
    private format_error;
    /**
     * 切换最后一个 tool 卡片的展开/折叠状态。
     * 对齐 Kimi Code 的 Ctrl+O 展开 tool output。
     */
    private toggle_tool_output_expansion;
}
//# sourceMappingURL=AgentChatTuiCoordinator.d.ts.map