/**
 * town agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 类似 Kimi Code 的 KimiTUI，负责把状态、布局、输入、session 生命周期串起来。
 * - 不在这里积累事件路由或渲染逻辑，那些下沉到 StreamingUIController 与组件。
 */
import type { AgentChatSessionSummaryView } from "../AgentChatTypes.js";
import type { AgentChatInteractiveRendererPort } from "../../types/AgentChatInteractive.js";
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
     * 请求重新渲染，并在渲染前更新布局。
     */
    private request_render;
    /**
     * 根据终端尺寸重新计算消息流视口高度。
     */
    private update_layout;
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
}
//# sourceMappingURL=AgentChatTuiCoordinator.d.ts.map