/**
 * city agent chat TUI 协调器。
 *
 * 关键点（中文）
 * - 对齐 Kimi Code 的 KimiTUI 布局：transcriptContainer + status/activity + editor，交给 pi-tui 裁剪顶部溢出。
 * - 不再手动计算 message list 的可用高度或维护 scroll_offset。
 * - 消息直接作为子组件追加到 MessageList（Container），终端自然向下生长，最新内容靠近底部输入区。
 */
import { Key, matchesKey, ProcessTerminal, TUI, } from "@earendil-works/pi-tui";
import { ChatEditorComponent, StatusLineComponent, } from "../../../city/agent/tui/components/index.js";
import { MessageListComponent } from "../../../city/agent/tui/components/MessageList.js";
import { SessionPickerComponent } from "../../../city/agent/tui/dialogs/SessionPicker.js";
import { PiTuiChatRenderer } from "../../../city/agent/tui/PiTuiChatRenderer.js";
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
        this.status_line = new StatusLineComponent(this.app_state);
        this.message_list = new MessageListComponent();
        this.editor = new ChatEditorComponent(this.tui);
        this.editor.on_submit = (text) => {
            void this.handle_user_input(text);
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
        // 关键点（中文）：顺序是 transcript → status/activity → editor，让 pi-tui 从顶部裁剪溢出。
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
     * 处理用户输入。
     *
     * @param raw_text 原始输入文本。
     */
    async handle_user_input(raw_text) {
        if (this.stopped || this.app_state.is_executing) {
            return;
        }
        const text = String(raw_text || "").trim();
        if (!text) {
            this.editor.clear();
            this.request_render();
            return;
        }
        this.editor.clear();
        if (text === "/quit" || text === "/exit") {
            await this.stop();
            return;
        }
        if (text === "/clear") {
            this.message_list.clear();
            this.request_render();
            return;
        }
        if (text === "/help") {
            this.add_status_message("/help · /session · /new · /clear · /quit");
            this.request_render();
            return;
        }
        if (text === "/new") {
            await this.create_new_session();
            return;
        }
        if (text === "/session") {
            await this.show_session_picker();
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
        this.app_state.status_text = "Thinking...";
        this.status_line.set_state(this.app_state);
        this.editor.disableSubmit = true;
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
        if (matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
            void this.stop();
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
}
//# sourceMappingURL=AgentChatTuiCoordinator.js.map