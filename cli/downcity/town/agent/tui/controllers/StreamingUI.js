/**
 * 流式会话事件控制器。
 *
 * 关键点（中文）
 * - 把 @downcity/agent 的 AgentSessionEvent 映射为消息流条目。
 * - 维护当前 turn id，保证跨事件状态一致。
 * - 所有状态变更最终反映到 MessageListComponent。
 */
import { generateTuiId } from "../utils/id.js";
/**
 * 流式 UI 控制器。
 */
export class StreamingUIController {
    message_list;
    active_turn_id = "";
    current_assistant_entry_id = "";
    current_assistant_text = "";
    /**
     * @param options 构造选项。
     */
    constructor(options) {
        this.message_list = options.message_list;
    }
    /**
     * 启动新一轮渲染。
     */
    start_turn() {
        this.active_turn_id = "";
        this.current_assistant_entry_id = "";
        this.current_assistant_text = "";
    }
    /**
     * 绑定当前 turn id。
     *
     * @param turn_id turn id。
     */
    attach_turn_id(turn_id) {
        this.active_turn_id = String(turn_id || "").trim();
    }
    /**
     * 处理单个 session 事件。
     *
     * @param event AgentSessionEvent。
     */
    handle_event(event) {
        const event_turn_id = this.extract_event_turn_id(event);
        if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
            return;
        }
        switch (event.type) {
            case "turn-start":
                this.attach_turn_id(event.turnId);
                this.create_assistant_entry();
                break;
            case "text-delta":
                this.append_assistant_text(event.text || "");
                break;
            case "tool-call":
                this.add_tool_call(event.toolName, event.args);
                break;
            case "tool-result":
                this.add_tool_result(event.toolName, event.result);
                break;
            case "tool-approval-request":
                this.add_approval_request(event);
                break;
            case "tool-approval-result":
                this.add_approval_result(event);
                break;
            case "reasoning-delta":
                // reasoning 不在 TUI 中直接展示，只保证状态为 thinking。
                break;
            case "error":
                this.add_error(event.message || "unknown error");
                break;
            case "turn-finish":
                this.finalize_assistant();
                break;
            case "assistant-step":
            case "session-title":
            default:
                break;
        }
    }
    /**
     * 结束当前一轮渲染。
     */
    finish_turn() {
        this.finalize_assistant();
    }
    extract_event_turn_id(event) {
        if (event.type === "tool-approval-request" || event.type === "tool-approval-result") {
            return "";
        }
        if ("turnId" in event && typeof event.turnId === "string") {
            return event.turnId;
        }
        return "";
    }
    create_assistant_entry() {
        const id = generateTuiId();
        this.current_assistant_entry_id = id;
        this.current_assistant_text = "";
        const entry = {
            id,
            kind: "assistant",
            text: "",
            streaming: true,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
    append_assistant_text(delta) {
        if (!this.current_assistant_entry_id) {
            this.create_assistant_entry();
        }
        this.current_assistant_text += delta;
        this.message_list.update_assistant_text(this.current_assistant_entry_id, this.current_assistant_text, true);
    }
    finalize_assistant() {
        if (!this.current_assistant_entry_id) {
            return;
        }
        this.message_list.update_assistant_text(this.current_assistant_entry_id, this.current_assistant_text, false);
        this.current_assistant_entry_id = "";
        this.current_assistant_text = "";
    }
    add_tool_call(tool_name, args) {
        const entry = {
            id: generateTuiId(),
            kind: "tool-call",
            tool_name,
            args,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
    add_tool_result(tool_name, result) {
        const entry = {
            id: generateTuiId(),
            kind: "tool-result",
            tool_name,
            result,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
    add_approval_request(event) {
        const operation = event.operation || (event.toolName === "shell_write" ? "write" : "exec");
        const command_value = operation === "write" ? event.inputPreview || event.cmd : event.cmd;
        const entry = {
            id: generateTuiId(),
            kind: "tool-approval-request",
            approval_id: event.approvalId,
            tool_name: event.toolName,
            operation,
            command_value,
            cwd: event.cwd,
            reason: event.reason,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
    add_approval_result(event) {
        const entry = {
            id: generateTuiId(),
            kind: "tool-approval-result",
            approval_id: event.approvalId,
            tool_name: event.toolName,
            decision: event.decision,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
    add_error(text) {
        const entry = {
            id: generateTuiId(),
            kind: "error",
            text,
            created_at: Date.now(),
        };
        this.message_list.add_entry(entry);
    }
}
//# sourceMappingURL=StreamingUI.js.map