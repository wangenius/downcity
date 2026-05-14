/**
 * UIMessage 解析辅助。
 *
 * 关键点（中文）
 * - 这些能力属于 runtime 执行结果处理，不属于 prompts 组装
 * - 用于提取最终 assistant 文本与工具调用摘要
 */

import {
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from "ai";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";

type AnyUiMessagePart = UIMessagePart<UIDataTypes, UITools>;
type ToolNameReadablePart = Parameters<typeof getToolName>[0];
type ToolCallSummary = {
  tool: string;
  input: JsonObject;
  output: string;
};

type ToolPartCompatShape = {
  type?: string;
  state?: string;
  input?: JsonValue;
  output?: unknown;
  errorText?: unknown;
  error?: unknown;
  approval?: {
    reason?: unknown;
  };
};

function toUiParts(message: SessionMessageV1 | null | undefined): AnyUiMessagePart[] {
  return Array.isArray(message?.parts) ? message.parts : [];
}

function normalizeJsonValue(value: JsonValue | object | undefined): JsonValue {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

function toToolInput(rawInput: JsonValue | object | undefined): JsonObject {
  const normalized = normalizeJsonValue(rawInput);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    return normalized as JsonObject;
  }
  return { value: normalized };
}

function resolveToolName(part: ToolPartCompatShape, aiToolName?: string): string {
  const fromAi = String(aiToolName || "").trim();
  if (fromAi) return fromAi;

  const rawType = typeof part.type === "string" ? part.type.trim() : "";
  if (rawType.startsWith("tool-")) return rawType.slice("tool-".length);

  return "";
}

function tryReadAiToolName(part: AnyUiMessagePart): string {
  if (!isToolUIPart(part)) return "";
  return String(getToolName(part as ToolNameReadablePart) || "").trim();
}

function extractToolOutput(part: ToolPartCompatShape): string {
  const state = typeof part.state === "string" ? part.state.trim() : "";
  const outputObj =
    state === "output-available"
      ? part.output
      : state === "output-error"
        ? { error: part.errorText ?? part.error ?? "tool_error" }
        : state === "output-denied"
          ? { error: "tool_denied", reason: part.approval?.reason }
          : undefined;
  if (outputObj === undefined) return "";
  try {
    return JSON.stringify(outputObj);
  } catch {
    return String(outputObj);
  }
}

/**
 * 从 UIMessage 中提取纯文本。
 */
export function extractTextFromUiMessage(
  message: SessionMessageV1 | null | undefined,
): string {
  const parts = toUiParts(message);
  return parts
    .filter(isTextUIPart)
    .map((part) => String(part.text ?? ""))
    .join("\n")
    .trim();
}

/**
 * 从 UIMessage 中提取 tool 调用记录。
 */
export function extractToolCallsFromUiMessage(
  message: SessionMessageV1 | null | undefined,
): ToolCallSummary[] {
  const parts = toUiParts(message);
  const out: ToolCallSummary[] = [];

  for (const part of parts) {
    const partObject = part as ToolPartCompatShape;
    const toolUiPart = isToolUIPart(part) ? part : null;
    if (!toolUiPart) continue;

    const toolName = resolveToolName(partObject, tryReadAiToolName(part));
    if (!toolName) continue;

    const rawInput = (part as { input?: JsonValue }).input;
    const input = toToolInput(rawInput);
    const output = extractToolOutput(partObject);

    out.push({
      tool: toolName,
      input,
      output,
    });
  }

  return out;
}
