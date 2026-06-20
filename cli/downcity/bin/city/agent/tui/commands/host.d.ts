/**
 * city agent chat TUI slash 命令宿主接口。
 *
 * 关键点（中文）
 * - 由 AgentChatTuiCoordinator 实现，解耦 slash 命令与具体 UI 逻辑。
 */
/**
 * slash 命令宿主。
 */
export interface SlashCommandHost {
    /** 当前是否正在流式输出/执行中。 */
    readonly is_streaming: boolean;
    /**
     * 发送普通用户消息。
     *
     * @param text 用户输入文本。
     */
    send_normal_user_input(text: string): Promise<void>;
    /**
     * 展示错误提示。
     *
     * @param text 错误文本。
     */
    show_error(text: string): void;
    /** 展示帮助信息。 */
    show_help(): void;
    /** 清空消息流。 */
    clear_transcript(): void;
    /** 创建新 session。 */
    create_new_session(): Promise<void>;
    /** 展示 session 选择器。 */
    show_session_picker(): Promise<void>;
    /** 停止 TUI。 */
    stop(): Promise<void>;
}
//# sourceMappingURL=host.d.ts.map