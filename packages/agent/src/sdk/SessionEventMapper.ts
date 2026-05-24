/**
 * Session 事件映射辅助。
 *
 * 关键点（中文）
 * - 把底层 AI SDK `UIMessageChunk` 归一到内部 `InternalUiChunkEvent`。
 * - 再把内部 chunk 事件转换为 `session.subscribe()` 可见的 Session 事件。
 */

import type { UIMessageChunk } from "ai";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { InternalUiChunkEvent } from "@/types/sdk/InternalUiChunkEvent.js";

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
 * 把单个 UI chunk 映射为内部 chunk 事件。
 */
export function mapUiMessageChunkToAgentEvent(
  chunk: UIMessageChunk,
): InternalUiChunkEvent | null {
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
        error: String(chunk.reason || "execution aborted"),
      };
    default:
      return null;
  }
}

/**
 * 把内部 chunk 事件映射为 Session actor 事件。
 *
 * 关键点（中文）
 * - Session 级事件只保留 turn 维度所需的最小字段。
 * - `finish` 与通用 `error` 由 turn 生命周期统一表达，不在这里直接透出。
 */
export function mapAgentEventToSessionEvent(params: {
  /**
   * 当前内部 chunk 事件。
   */
  event: InternalUiChunkEvent;
  /**
   * 当前 turn 标识。
   */
  turnId: string;
}): AgentSessionEvent | null {
  const { event, turnId } = params;
  switch (event.type) {
    case "text-delta":
      return {
        type: "text-delta",
        turnId,
        text: event.text,
      };
    case "reasoning-delta":
      return {
        type: "reasoning-delta",
        turnId,
        text: event.text,
      };
    case "tool-call":
      return {
        type: "tool-call",
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      };
    case "tool-result":
      return {
        type: "tool-result",
        turnId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
      };
    default:
      return null;
  }
}
