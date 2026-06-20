/**
 * `city agent chat` 交互式终端渲染器。
 *
 * 职责说明（中文）
 * - 只服务于交互式 `city agent chat`，不参与 `--message` 一次性输出。
 * - 负责 spinner 生命周期、tool 事件可见性，以及 assistant 文本流式渲染。
 * - 把“终端展示状态机”从主命令流程中拆出，降低 `AgentChat.ts` 复杂度。
 */
import chalk from "chalk";
import { createSpinner, shouldRenderSpinner, } from "../../city/utils/cli/Spinner.js";
import { format_tool_call_block, format_tool_result_block, } from "../../city/agent/AgentChatToolFormatter.js";
function format_approval_request_block(event) {
    const operation = event.operation || (event.toolName === "shell_write" ? "write" : "exec");
    const command_label = operation === "write" ? "input_preview" : "cmd";
    const command_value = operation === "write" ? event.inputPreview || event.cmd : event.cmd;
    return {
        title: `[approval] ${event.toolName} requests unrestricted sandbox`,
        detail_lines: [
            `approval_id: ${event.approvalId}`,
            `operation: ${operation}`,
            ...(event.shellId ? [`shell_id: ${event.shellId}`] : []),
            `${command_label}: ${command_value}`,
            ...(typeof event.inputChars === "number" ? [`input_chars: ${event.inputChars}`] : []),
            `cwd: ${event.cwd}`,
            `reason: ${event.reason}`,
            "approve: call agent.approve({ approval_id })",
            "deny: call agent.deny({ approval_id })",
        ],
    };
}
function format_approval_result_block(event) {
    return {
        title: `[approval] ${event.decision}`,
        detail_lines: [
            `approval_id: ${event.approvalId}`,
            `tool: ${event.toolName}`,
        ],
    };
}
function extract_event_turn_id(event) {
    if (event.type === "tool-approval-request" || event.type === "tool-approval-result") {
        return "";
    }
    if ("turnId" in event && typeof event.turnId === "string") {
        return event.turnId;
    }
    return "";
}
/**
 * 交互式单轮渲染器。
 */
export class AgentChatInteractiveRenderer {
    spinner = null;
    spinner_text = "";
    emitted_visible_text = false;
    text_stream_open = false;
    has_block_output = false;
    active_turn_id = "";
    spinner_enabled;
    constructor() {
        this.spinner_enabled = shouldRenderSpinner();
    }
    /**
     * 启动新一轮交互渲染。
     */
    start_turn() {
        this.active_turn_id = "";
        this.emitted_visible_text = false;
        this.text_stream_open = false;
        this.has_block_output = false;
        this.set_spinner_text("Thinking...");
    }
    /**
     * 绑定当前 turn id。
     */
    attach_turn_id(turn_id) {
        this.active_turn_id = String(turn_id || "").trim();
    }
    /**
     * 渲染单个 session 事件。
     */
    render_event(event) {
        const event_turn_id = extract_event_turn_id(event);
        if (event_turn_id && this.active_turn_id && event_turn_id !== this.active_turn_id) {
            return;
        }
        switch (event.type) {
            case "turn-start":
                this.attach_turn_id(event.turnId);
                this.set_spinner_text("Thinking...");
                return;
            case "tool-call":
                this.print_tool_block(format_tool_call_block({
                    tool_name: event.toolName,
                    args: event.args,
                }));
                this.set_spinner_text(`Running ${event.toolName}...`);
                return;
            case "tool-result":
                this.print_tool_block(format_tool_result_block({
                    tool_name: event.toolName,
                    result: event.result,
                }));
                this.set_spinner_text("Thinking...");
                return;
            case "tool-approval-request":
                this.print_tool_block(format_approval_request_block(event));
                this.set_spinner_text("Waiting for approval...");
                return;
            case "tool-approval-result":
                this.print_tool_block(format_approval_result_block(event));
                this.set_spinner_text("Thinking...");
                return;
            case "error":
                this.stop_spinner();
                return;
            case "turn-finish":
                this.stop_spinner();
                return;
            case "assistant-step":
            case "session-title":
                return;
            case "reasoning-delta":
                this.set_spinner_text("Thinking...");
                return;
            case "text-delta":
                this.print_text_delta(event.text);
                return;
            default:
                return;
        }
    }
    /**
     * 结束当前一轮渲染，补齐末尾换行。
     */
    finish_turn() {
        this.stop_spinner();
        if (this.text_stream_open) {
            process.stdout.write("\n\n");
            this.text_stream_open = false;
            this.has_block_output = true;
        }
        return {
            emitted_visible_text: this.emitted_visible_text,
        };
    }
    set_spinner_text(spinner_text) {
        const normalized_text = String(spinner_text || "").trim() || "Thinking...";
        if (!this.spinner_enabled)
            return;
        if (this.spinner && this.spinner_text === normalized_text)
            return;
        this.stop_spinner();
        this.spinner_text = normalized_text;
        this.spinner = createSpinner({
            text: normalized_text,
        });
        this.spinner.start();
    }
    stop_spinner() {
        if (!this.spinner)
            return;
        this.spinner.stop();
        this.spinner = null;
    }
    print_text_delta(text) {
        if (!text)
            return;
        this.stop_spinner();
        if (!this.text_stream_open) {
            process.stdout.write("\n");
            this.text_stream_open = true;
        }
        process.stdout.write(text);
        this.emitted_visible_text = true;
    }
    print_tool_block(block) {
        this.stop_spinner();
        if (this.text_stream_open) {
            process.stdout.write("\n\n");
            this.text_stream_open = false;
        }
        else if (this.has_block_output) {
            process.stdout.write("\n");
        }
        console.log(chalk.cyan(block.title));
        for (const detail_line of block.detail_lines) {
            console.log(chalk.dim(`  ${detail_line}`));
        }
        this.has_block_output = true;
    }
}
//# sourceMappingURL=AgentChatInteractiveRenderer.js.map