/**
 * `town agent chat` TUI 聊天界面。
 *
 * 关键点（中文）
 * - 用全屏 TUI 替换 readline 持续对话。
 * - 顶部展示当前 agent / session，中央滚动展示消息与 tool 事件，底部输入。
 * - 只负责交互式持续对话；一次性 `--message` 仍走原有脚本化路径。
 */
import blessed from "neo-blessed";
import { format_tool_call_block, format_tool_result_block, } from "./AgentChatToolFormatter.js";
function extract_event_turn_id(event) {
    if ("turnId" in event && typeof event.turnId === "string") {
        return event.turnId;
    }
    return "";
}
/**
 * TUI 聊天渲染器。
 */
class AgentChatTuiRenderer {
    active_turn_id = "";
    emitted_visible_text = false;
    stream_text = "";
    history_lines;
    refresh_view;
    constructor(params) {
        this.history_lines = params.history_lines;
        this.refresh_view = params.refresh_view;
    }
    start_turn() {
        this.active_turn_id = "";
        this.emitted_visible_text = false;
        this.stream_text = "";
    }
    attach_turn_id(turn_id) {
        this.active_turn_id = String(turn_id || "").trim();
    }
    render_event(event) {
        const typed_event = event;
        const event_turn_id = extract_event_turn_id(typed_event);
        if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
            return;
        }
        switch (typed_event.type) {
            case "turn-start":
                this.attach_turn_id(typed_event.turnId);
                this.push_status("Thinking...");
                return;
            case "tool-call":
                this.flush_stream();
                this.push_tool_block(format_tool_call_block({
                    tool_name: typed_event.toolName,
                    args: typed_event.args,
                }));
                return;
            case "tool-result":
                this.flush_stream();
                this.push_tool_block(format_tool_result_block({
                    tool_name: typed_event.toolName,
                    result: typed_event.result,
                }));
                return;
            case "reasoning-delta":
                return;
            case "text-delta":
                this.stream_text += typed_event.text || "";
                if (this.stream_text.trim()) {
                    this.emitted_visible_text = true;
                }
                this.refresh_view();
                return;
            case "turn-finish":
            case "assistant-step":
            case "session-title":
            case "error":
            default:
                return;
        }
    }
    finish_turn() {
        this.flush_stream();
        this.refresh_view();
        return {
            emitted_visible_text: this.emitted_visible_text,
        };
    }
    get_stream_preview() {
        return this.stream_text;
    }
    flush_stream() {
        const normalized_text = String(this.stream_text || "").trim();
        if (normalized_text) {
            this.history_lines.push(`assistant> ${normalized_text}`);
            this.emitted_visible_text = true;
        }
        this.stream_text = "";
    }
    push_status(text) {
        this.history_lines.push(`status> ${text}`);
        this.refresh_view();
    }
    push_tool_block(block) {
        this.history_lines.push(`tool> ${block.title}`);
        for (const detail_line of block.detail_lines) {
            this.history_lines.push(`  ${detail_line}`);
        }
        this.refresh_view();
    }
}
/**
 * 打开 TUI 聊天面板。
 */
export async function run_agent_chat_tui(params) {
    const history_lines = [
        `system> Agent chat · ${params.agent_id}`,
        "system> Type /help for shortcuts, /quit to exit.",
    ];
    await new Promise((resolve) => {
        const screen = blessed.screen({
            smartCSR: true,
            fullUnicode: true,
            title: `Agent Chat · ${params.agent_id}`,
            dockBorders: true,
            autoPadding: true,
        });
        let active_input_resolver = null;
        let closed = false;
        const log_box = blessed.box({
            parent: screen,
            top: 0,
            left: 0,
            width: "100%",
            height: "100%-4",
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            border: "line",
            label: ` Agent Chat · ${params.agent_id} `,
            padding: { left: 1, right: 1, top: 1, bottom: 1 },
            style: {
                border: { fg: "green" },
            },
            content: "",
        });
        const input_box = blessed.textbox({
            parent: screen,
            left: 0,
            bottom: 0,
            width: "100%",
            height: 4,
            // 关键点（中文）：这里必须手动调用 readInput(callback)。
            // inputOnFocus 会在 focus 时先触发无 callback 的 readInput，导致后续 Enter 无法交给聊天循环。
            inputOnFocus: false,
            keys: true,
            mouse: true,
            border: "line",
            label: " Message ",
            style: {
                border: { fg: "green" },
                fg: "white",
                bg: "black",
            },
        });
        const refresh_view = (stream_preview = "") => {
            const content = [...history_lines];
            const normalized_stream = String(stream_preview || "").trim();
            if (normalized_stream) {
                content.push(`assistant> ${normalized_stream}`);
            }
            log_box.setContent(content.join("\n"));
            if (typeof log_box.setScrollPerc === "function") {
                log_box.setScrollPerc(100);
            }
            screen.render();
        };
        const finish = () => {
            if (closed)
                return;
            closed = true;
            if (active_input_resolver) {
                const resolver = active_input_resolver;
                active_input_resolver = null;
                resolver(undefined);
            }
            screen.destroy();
            resolve();
        };
        const read_message_once = async () => {
            input_box.focus();
            input_box.clearValue();
            screen.render();
            return await new Promise((resolve_input) => {
                let finished_input = false;
                let raw_input_listener;
                const cleanup_input = () => {
                    if (raw_input_listener) {
                        process.stdin.off("data", raw_input_listener);
                        raw_input_listener = undefined;
                    }
                };
                const finish_input = (value) => {
                    if (finished_input)
                        return;
                    finished_input = true;
                    cleanup_input();
                    if (active_input_resolver === finish_input) {
                        active_input_resolver = null;
                    }
                    resolve_input(value);
                };
                active_input_resolver = finish_input;
                input_box.readInput((error, value) => {
                    if (error) {
                        finish_input(undefined);
                        return;
                    }
                    finish_input(normalize_textbox_value(value));
                });
                input_box.key(["enter", "return"], () => {
                    // 关键点（中文）：不同终端会把回车解析为 enter 或 return，统一转成 textbox submit。
                    input_box.submit();
                });
                input_box.key(["escape", "C-c"], () => finish_input(undefined));
                input_box.key(["C-u"], () => {
                    input_box.clearValue();
                    screen.render();
                });
                raw_input_listener = (chunk) => {
                    const text = String(chunk);
                    if (text.includes("\u0003") || is_plain_escape_input(text)) {
                        finish_input(undefined);
                        return;
                    }
                    if (text.includes("\u0015")) {
                        input_box.clearValue();
                        screen.render();
                        return;
                    }
                    if (text.includes("\r") || text.includes("\n")) {
                        // 关键点（中文）：部分终端的回车不会触发 blessed 的 enter/return，延后一拍读取最新值。
                        setImmediate(() => submit_textbox_value(input_box, () => {
                            finish_input(normalize_textbox_value(input_box.getValue()));
                        }));
                    }
                };
                process.stdin.on("data", raw_input_listener);
            });
        };
        screen.key(["C-c"], () => finish());
        refresh_view();
        void (async () => {
            while (!closed) {
                const line = await read_message_once();
                if (closed || line === undefined) {
                    break;
                }
                const text = String(line || "").trim();
                if (!text) {
                    continue;
                }
                if (text === "/quit" || text === "/exit") {
                    break;
                }
                if (text === "/clear") {
                    history_lines.splice(0, history_lines.length, `system> Agent chat · ${params.agent_id}`);
                    refresh_view();
                    continue;
                }
                if (text === "/help") {
                    history_lines.push("system> /help · /clear · /quit");
                    refresh_view();
                    continue;
                }
                history_lines.push(`user> ${text}`);
                const renderer = new AgentChatTuiRenderer({
                    history_lines,
                    refresh_view: () => refresh_view(renderer.get_stream_preview()),
                });
                refresh_view();
                const outcome = await params.run_turn({
                    message: text,
                    interactive_renderer: renderer,
                });
                renderer.finish_turn();
                if (!outcome.success) {
                    history_lines.push(`error> ${outcome.error || "agent chat failed"}`);
                }
                else if (!outcome.emitted_visible_text) {
                    history_lines.push("assistant> [no visible reply]");
                }
                refresh_view();
            }
            finish();
        })();
    });
}
function normalize_textbox_value(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "");
}
function submit_textbox_value(textbox, finish) {
    if (textbox._done) {
        // 关键点（中文）：stop 只释放 blessed 内部 readInput 状态，不触发 submit/cancel 回调。
        textbox._done("stop");
    }
    finish();
}
function is_plain_escape_input(text) {
    return text === "\u001b";
}
//# sourceMappingURL=AgentChatTui.js.map