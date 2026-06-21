/**
 * city agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code 的 KimiTUI 布局：transcript + status/activity + editor。
 * - transcript 使用可滚动消息流，支持 PageUp/PageDown 回看历史。
 * - 编辑器负责消费标准快捷键（Ctrl+C/D/O/S），再回调 coordinator。
 */
import { Key, matchesKey, ProcessTerminal, TUI, } from "@earendil-works/pi-tui";
import { ChatEditorComponent, StatusLineComponent, } from "../../../city/agent/tui/components/index.js";
import { MessageListComponent } from "../../../city/agent/tui/components/MessageList.js";
import { ToolCallBlockComponent } from "../../../city/agent/tui/components/ToolCallBlock.js";
import { SessionPickerComponent } from "../../../city/agent/tui/dialogs/SessionPicker.js";
import { PiTuiChatRenderer } from "../../../city/agent/tui/PiTuiChatRenderer.js";
import { dispatchSlashCommand, resolveSlashCommandInput, } from "../../../city/agent/tui/commands/index.js";
/**
 * Agent chat TUI 协调器。
 */
export class AgentChatTuiCoordinator {
    options;
    terminal;
    tui;
    status_line;
    message_list;
    editor;
    app_state;
    current_session_id;
    running = false;
    stopped = false;
    resolve_run = null;
    overlay_handle = null;
    remove_input_listener = null;
    is_initial_picker = false;
    /**
     * slash 命令宿主，解耦命令分发与 coordinator 内部实现。
     */
    get slash_command_host() {
        return {
            is_streaming: this.app_state.is_executing,
            send_normal_user_input: async (text) => {
                await this.run_turn(text);
            },
            show_error: (text) => {
                this.add_error_message(text);
            },
            show_help: () => {
                this.add_status_message("/help · /session · /new · /clear · /quit");
            },
            clear_transcript: () => {
                this.message_list.clear();
            },
            create_new_session: async () => {
                await this.create_new_session();
            },
            show_session_picker: async () => {
                await this.show_session_picker();
            },
            stop: async () => {
                await this.stop();
            },
        };
    }
    /**
     * @param options 协调器选项。
     */
    constructor(options) {
        this.options = options;
        this.current_session_id = options.session_id;
        this.app_state = {
            agent_id: options.agent_id,
            session_id: options.session_id,
            is_executing: false,
            status_text: "",
        };
        this.terminal = new ProcessTerminal();
        this.tui = new TUI(this.terminal);
        this.terminal.setTitle(this.build_title());
        this.status_line = new StatusLineComponent(this.app_state, this.tui);
        this.editor = new ChatEditorComponent(this.tui);
        this.editor.connected_above = true;
        this.message_list = new MessageListComponent({
            get_viewport_height: () => this.get_message_list_viewport_height(),
        });
        this.editor.on_submit = (text) => {
            void this.handle_user_input(text);
        };
        this.editor.on_ctrl_c = () => {
            void this.stop();
        };
        this.editor.on_ctrl_d = () => {
            void this.stop();
        };
        this.editor.on_ctrl_s = () => {
            void this.stop();
        };
        this.editor.on_ctrl_o = () => {
            this.toggle_last_tool_block();
            this.request_render();
        };
    }
    /**
     * 启动 TUI 并进入事件循环。
     *
     * @param options 启动选项。
     * @returns TUI 停止后 resolve。
     */
    async run(options) {
        if (this.running || this.stopped) {
            return;
        }
        this.running = true;
        // 顺序：transcript → status/activity → editor，最新内容靠近底部输入区。
        this.tui.addChild(this.message_list);
        this.tui.addChild(this.status_line);
        this.tui.addChild(this.editor);
        this.tui.setFocus(this.editor);
        this.remove_input_listener = this.tui.addInputListener((data) => this.handle_global_input(data));
        this.add_status_message("Type /help for shortcuts · /session · /new · /clear · /quit");
        this.tui.start();
        if (options?.show_initial_picker === true) {
            await this.show_session_picker(true);
        }
        return await new Promise((resolve) => {
            this.resolve_run = resolve;
        });
    }
    /**
     * 停止 TUI 并清理资源。
     */
    async stop() {
        if (this.stopped) {
            return;
        }
        this.stopped = true;
        this.hide_session_picker();
        this.remove_input_listener?.();
        this.status_line.dispose();
        this.tui.stop();
        this.resolve_run?.();
    }
    /**
     * 请求重新渲染。
     */
    request_render() {
        if (this.stopped) {
            return;
        }
        this.tui.requestRender();
    }
    /**
     * 计算消息流当前可用的可视高度。
     */
    get_message_list_viewport_height() {
        const width = this.terminal.columns;
        const status_lines = this.status_line.render(width).length;
        const editor_lines = this.editor.render(width).length;
        return Math.max(1, this.terminal.rows - status_lines - editor_lines);
    }
    /**
     * 处理用户输入。
     *
     * @param raw_text 原始输入文本。
     */
    async handle_user_input(raw_text) {
        if (this.stopped) {
            return;
        }
        const text = String(raw_text || "").trim();
        if (!text) {
            this.editor.clear();
            this.request_render();
            return;
        }
        this.editor.clear();
        this.message_list.scroll_to_bottom();
        const intent = resolveSlashCommandInput({
            input: text,
            is_streaming: this.app_state.is_executing,
        });
        if (intent.kind === "builtin" ||
            intent.kind === "blocked" ||
            intent.kind === "invalid") {
            await dispatchSlashCommand(this.slash_command_host, intent);
            this.request_render();
            return;
        }
        if (intent.kind === "message") {
            await this.run_turn(intent.input);
            return;
        }
        await this.run_turn(text);
    }
    /**
     * 执行一轮对话。
     *
     * @param message 用户消息。
     */
    async run_turn(message) {
        this.app_state.is_executing = true;
        this.app_state.status_text = "working...";
        this.status_line.set_state(this.app_state);
        this.editor.disableSubmit = true;
        this.message_list.scroll_to_bottom();
        this.add_user_message(message);
        this.request_render();
        const renderer = new PiTuiChatRenderer(this.message_list, () => this.request_render());
        const outcome = await this.options.run_turn({
            session_id: this.current_session_id,
            message,
            interactive_renderer: renderer,
        });
        this.app_state.is_executing = false;
        this.app_state.status_text = "";
        this.status_line.set_state(this.app_state);
        this.editor.disableSubmit = false;
        if (!outcome.success) {
            this.add_error_message(outcome.error || "agent chat failed");
        }
        else if (!outcome.emitted_visible_text) {
            this.add_status_message("[no visible reply]");
        }
        this.request_render();
    }
    /**
     * 显示 session 选择器弹窗。
     *
     * @param is_initial 是否为启动时的初始选择器。
     */
    async show_session_picker(is_initial = false) {
        if (this.overlay_handle) {
            return;
        }
        this.is_initial_picker = is_initial;
        let sessions = [];
        try {
            sessions = await this.options.list_sessions();
        }
        catch (error) {
            this.add_error_message(this.format_error(error));
            this.request_render();
            return;
        }
        const picker = new SessionPickerComponent({
            sessions,
            current_session_id: this.current_session_id,
            on_select: (result) => {
                this.hide_session_picker();
                if (result.kind === "create") {
                    void this.create_new_session();
                }
                else if (result.sessionId) {
                    this.switch_session(result.sessionId);
                }
            },
            on_cancel: () => {
                this.hide_session_picker();
                if (this.is_initial_picker) {
                    void this.stop();
                }
            },
        });
        this.overlay_handle = this.tui.showOverlay(picker, {
            width: "80%",
            maxHeight: "70%",
            anchor: "center",
        });
        this.overlay_handle.focus();
        this.request_render();
    }
    /**
     * 隐藏 session 选择器。
     */
    hide_session_picker() {
        if (!this.overlay_handle) {
            return;
        }
        this.overlay_handle.hide();
        this.overlay_handle = null;
        this.tui.setFocus(this.editor);
        this.request_render();
    }
    /**
     * 创建新 session 并切换视图。
     */
    async create_new_session() {
        this.add_status_message("Creating session...");
        this.request_render();
        try {
            const created = await this.options.create_session();
            this.switch_session(created.session_id);
        }
        catch (error) {
            this.add_error_message(this.format_error(error));
            this.request_render();
        }
    }
    /**
     * 切换到指定 session。
     *
     * @param session_id 目标 session id。
     */
    switch_session(session_id) {
        this.current_session_id = session_id;
        this.app_state.session_id = session_id;
        this.status_line.set_state(this.app_state);
        this.terminal.setTitle(this.build_title());
        this.message_list.clear();
        this.add_status_message(`Agent chat · ${this.app_state.agent_id} · ${session_id}`);
        this.request_render();
    }
    /**
     * 添加用户消息。
     *
     * @param text 用户文本。
     */
    add_user_message(text) {
        this.message_list.add_entry({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: "user",
            text,
            created_at: Date.now(),
        });
    }
    /**
     * 添加状态提示。
     *
     * @param text 状态文本。
     */
    add_status_message(text) {
        this.message_list.add_entry({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: "status",
            text,
            created_at: Date.now(),
        });
    }
    /**
     * 添加错误提示。
     *
     * @param text 错误文本。
     */
    add_error_message(text) {
        this.message_list.add_entry({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: "error",
            text,
            created_at: Date.now(),
        });
    }
    /**
     * 全局键盘输入处理。
     *
     * @param data pi-tui 输入数据。
     * @returns 是否消费该输入。
     */
    handle_global_input(data) {
        if (this.overlay_handle && !this.overlay_handle.isHidden()) {
            return undefined;
        }
        const page_size = Math.max(1, this.get_message_list_viewport_height() - 1);
        if (matchesKey(data, Key.pageUp)) {
            this.message_list.scroll_by(page_size);
            this.request_render();
            return { consume: true };
        }
        if (matchesKey(data, Key.pageDown)) {
            this.message_list.scroll_by(-page_size);
            this.request_render();
            return { consume: true };
        }
        if (matchesKey(data, Key.shift("up"))) {
            this.message_list.scroll_by(1);
            this.request_render();
            return { consume: true };
        }
        if (matchesKey(data, Key.shift("down"))) {
            this.message_list.scroll_by(-1);
            this.request_render();
            return { consume: true };
        }
        if (matchesKey(data, Key.ctrl("l"))) {
            this.message_list.scroll_to_bottom();
            this.request_render();
            return { consume: true };
        }
        return undefined;
    }
    /**
     * 构建终端标题。
     */
    build_title() {
        return `Agent chat · ${this.app_state.agent_id} · ${this.current_session_id}`;
    }
    /**
     * 格式化错误对象。
     *
     * @param error 错误对象。
     * @returns 错误文本。
     */
    format_error(error) {
        return error instanceof Error ? error.message : String(error);
    }
    /**
     * 切换最后一个 tool 卡片的展开/折叠状态。
     * 对齐 Kimi Code 的 Ctrl+O 展开 tool output。
     */
    toggle_last_tool_block() {
        const children = this.message_list.children;
        for (let i = children.length - 1; i >= 0; i -= 1) {
            const child = children[i];
            if (child instanceof ToolCallBlockComponent) {
                child.toggle();
                return;
            }
        }
    }
}
//# sourceMappingURL=AgentChatTuiCoordinator.js.map