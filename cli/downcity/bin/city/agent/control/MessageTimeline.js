/**
 * Control 消息时间线 helper。
 *
 * 关键点（中文）
 * - 负责把上下文消息映射成 control UI 可视时间线。
 * - 同时提供消息文件读取能力。
 */
import fs from "fs-extra";
import { getToolName, isTextUIPart, isToolUIPart, } from "ai";
import { pickLastSuccessfulChatSendText } from "@downcity/agent";
import { extractToolCallsFromUiMessage } from "@downcity/agent/internal/executor/messages/UIMessageTransformer.js";
import { truncateText } from "../../../city/agent/control/CommonHelpers.js";
function stringifyForDisplay(input, maxChars = 2400) {
    if (input === undefined)
        return "";
    if (input === null)
        return "null";
    if (typeof input === "string") {
        const value = input.trim();
        if (!value)
            return "";
        try {
            const parsed = JSON.parse(value);
            return truncateText(JSON.stringify(parsed, null, 2), maxChars);
        }
        catch {
            return truncateText(value, maxChars);
        }
    }
    if (typeof input === "number" || typeof input === "boolean") {
        return truncateText(String(input), maxChars);
    }
    try {
        return truncateText(JSON.stringify(input, null, 2), maxChars);
    }
    catch {
        return truncateText(String(input), maxChars);
    }
}
function extractMessageText(parts) {
    if (!Array.isArray(parts))
        return "";
    const texts = [];
    for (const part of parts) {
        if (!part || typeof part !== "object")
            continue;
        const p = part;
        if (p.type !== "text")
            continue;
        if (typeof p.text !== "string")
            continue;
        const value = p.text.trim();
        if (!value)
            continue;
        texts.push(value);
    }
    return texts.join("\n").trim();
}
function extractAssistantToolSummary(message) {
    const toolCalls = extractToolCallsFromUiMessage(message);
    if (!Array.isArray(toolCalls) || toolCalls.length === 0)
        return "";
    const toolNames = Array.from(new Set(toolCalls.map((item) => String(item.tool || "").trim()).filter(Boolean)));
    if (toolNames.length === 0)
        return "";
    return `[tool] ${toolNames.join(", ")}`;
}
function resolveToolName(part, aiToolName) {
    const fromAi = String(aiToolName || "").trim();
    if (fromAi)
        return fromAi;
    const rawType = typeof part.type === "string" ? part.type.trim() : "";
    if (rawType.startsWith("tool-"))
        return rawType.slice("tool-".length);
    return "unknown_tool";
}
function extractToolCallInput(part) {
    return part.input ?? undefined;
}
function extractToolResultOutput(part) {
    const state = typeof part.state === "string" ? part.state.trim() : "";
    if (state === "output-available")
        return part.output;
    if (state === "output-error") {
        return { error: part.errorText ?? part.error ?? "tool_error" };
    }
    if (state === "output-denied") {
        return {
            error: "tool_denied",
            reason: part.approval?.reason ?? "",
        };
    }
    if (state === "input-available" ||
        state === "input-streaming" ||
        state === "output-streaming") {
        return undefined;
    }
    return undefined;
}
function toUiMessageEvent(params) {
    const { message, role, text, sequence, toolName } = params;
    const metadata = (message.metadata || null);
    return {
        id: `${String(message.id || "")}:${sequence}`,
        role,
        ...(typeof metadata?.ts === "number" ? { ts: metadata.ts } : {}),
        ...(typeof metadata?.kind === "string" ? { kind: metadata.kind } : {}),
        ...(typeof metadata?.source === "string" ? { source: metadata.source } : {}),
        text,
        ...(toolName ? { toolName } : {}),
    };
}
function resolveUiMessageText(message) {
    const plainText = extractMessageText(message.parts);
    if (plainText)
        return plainText;
    if (message.role !== "assistant")
        return "";
    const userVisible = pickLastSuccessfulChatSendText(message).trim();
    if (userVisible)
        return userVisible;
    return extractAssistantToolSummary(message);
}
/**
 * 转成 control 时间线。
 */
export function toUiMessageTimeline(message) {
    if (message.role !== "assistant") {
        return [
            toUiMessageEvent({
                message,
                role: message.role,
                text: resolveUiMessageText(message),
                sequence: 0,
            }),
        ];
    }
    const parts = Array.isArray(message.parts)
        ? message.parts
        : [];
    const events = [];
    let sequence = 0;
    for (const part of parts) {
        if (!part || typeof part !== "object")
            continue;
        const partObject = part;
        if (isTextUIPart(part)) {
            const text = String(part.text || "").trim();
            if (!text)
                continue;
            events.push(toUiMessageEvent({
                message,
                role: "assistant",
                text,
                sequence,
            }));
            sequence += 1;
            continue;
        }
        if (isToolUIPart(part)) {
            const toolName = resolveToolName(partObject, String(getToolName(part) || ""));
            const inputText = stringifyForDisplay(extractToolCallInput(partObject));
            events.push(toUiMessageEvent({
                message,
                role: "tool-call",
                text: inputText || "(empty)",
                sequence,
                toolName,
            }));
            sequence += 1;
            const output = extractToolResultOutput(partObject);
            if (output !== undefined) {
                events.push(toUiMessageEvent({
                    message,
                    role: "tool-result",
                    text: stringifyForDisplay(output) || "(empty)",
                    sequence,
                    toolName,
                }));
                sequence += 1;
            }
            continue;
        }
    }
    // 关键点（中文）：assistant 若没有文本 part，也要保留一条可见事件，避免 control UI 空白。
    if (events.length === 0) {
        events.push(toUiMessageEvent({
            message,
            role: "assistant",
            text: resolveUiMessageText(message),
            sequence: 0,
        }));
    }
    return events;
}
/**
 * 读取 session 消息文件。
 */
export async function loadSessionMessagesFromFile(filePath) {
    if (!(await fs.pathExists(filePath)))
        return [];
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split("\n").filter(Boolean);
    const out = [];
    for (const line of lines) {
        try {
            const item = JSON.parse(line);
            if (!item || typeof item !== "object")
                continue;
            if (item.role !== "user" && item.role !== "assistant")
                continue;
            out.push(item);
        }
        catch {
            // 关键点（中文）：单行损坏不应影响整体可读性。
        }
    }
    return out;
}
/**
 * 读取适合摘要展示的消息预览文本。
 */
export function resolveUiMessagePreview(message) {
    return resolveUiMessageText(message);
}
//# sourceMappingURL=MessageTimeline.js.map