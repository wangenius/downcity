/**
 * `city agent chat` tool 事件摘要格式化。
 *
 * 职责说明（中文）
 * - 将 tool call / tool result / tool error 事件格式化成适合交互式终端展示的简洁文本。
 * - 避免把完整大 JSON 或超长输出直接刷到终端，保持可读性与节奏感。
 * - 为后续继续贴近 Codex CLI / Claude Code 风格保留独立演进边界。
 */
import type { JsonValue } from "@downcity/agent";
import type { AgentChatToolDisplayBlock } from "../types/AgentChatInteractive.js";
/**
 * 格式化 tool 开始事件。
 */
export declare function format_tool_call_block(params: {
    tool_name: string;
    args: JsonValue;
}): AgentChatToolDisplayBlock;
/**
 * 格式化 tool 完成事件。
 */
export declare function format_tool_result_block(params: {
    tool_name: string;
    result: JsonValue;
}): AgentChatToolDisplayBlock;
//# sourceMappingURL=AgentChatToolFormatter.d.ts.map