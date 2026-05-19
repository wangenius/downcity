/**
 * SDK Stream 事件映射辅助。
 *
 * 关键点（中文）
 * - 把底层 AI SDK `UIMessageChunk` 归一到 `AgentSessionStreamEvent`。
 * - 仅保留 SDK 当前需要的稳定事件，不把所有底层细节直接暴露出去。
 */

import type { UIMessageChunk } from "ai";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentSessionStreamEvent } from "@/sdk/AgentSdkTypes.js";

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

/**
 * 把单个 UI chunk 映射为 SDK stream 事件。
 */
export function mapUiMessageChunkToSdkEvent(
  chunk: UIMessageChunk,
): AgentSessionStreamEvent | null {
  switch (chunk.type) {
    case "text-delta":
      return {
        type: "text-delta",
        text: chunk.delta,
      };
    case "reasoning-delta":
      return {
        type: "reasoning-delta",
        text: chunk.delta,
      };
    case "tool-input-available":
      return {
        type: "tool-call",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        args: toJsonValue(chunk.input),
      };
    case "tool-output-available":
      return {
        type: "tool-result",
        toolCallId: chunk.toolCallId,
        toolName: "unknown",
        result: toJsonValue(chunk.output),
      };
    case "tool-output-error":
      return {
        type: "tool-error",
        toolCallId: chunk.toolCallId,
        toolName: "unknown",
        error: chunk.errorText,
      };
    case "tool-input-error":
      return {
        type: "tool-error",
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        error: chunk.errorText,
      };
    case "finish":
      return {
        type: "finish",
        ...(typeof chunk.finishReason === "string"
          ? { finishReason: chunk.finishReason }
          : {}),
      };
    case "error":
      return {
        type: "error",
        error: chunk.errorText,
      };
    case "abort":
      return {
        type: "error",
        error: String(chunk.reason || "stream aborted"),
      };
    default:
      return null;
  }
}
