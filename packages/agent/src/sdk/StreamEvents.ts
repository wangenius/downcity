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
import type { AsyncQueue } from "@/sdk/AsyncQueue.js";

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

/**
 * 把 UI chunk 推入 SDK stream 队列。
 *
 * 关键点（中文）
 * - `tool-output-*` chunk 本身不总是携带 toolName。
 * - 这里用调用 id 维护一次流式执行内的工具名称映射，避免上层重复关心底层 chunk 细节。
 */
export function pushUiMessageChunkAsSdkEvent(params: {
  /**
   * SDK stream 事件队列。
   */
  queue: AsyncQueue<AgentSessionStreamEvent>;
  /**
   * 底层 AI SDK UI chunk。
   */
  chunk: UIMessageChunk;
  /**
   * 当前 stream 生命周期内的 toolCallId 到 toolName 映射。
   */
  toolNameByCallId: Map<string, string>;
}): void {
  const { queue, chunk, toolNameByCallId } = params;
  if (chunk.type === "tool-input-start") {
    toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
    return;
  }
  const event = mapUiMessageChunkToSdkEvent(chunk);
  if (!event) return;
  if (event.type === "tool-call" || event.type === "tool-error") {
    toolNameByCallId.set(event.toolCallId, event.toolName);
  }
  if (
    (event.type === "tool-result" || event.type === "tool-error") &&
    event.toolName === "unknown"
  ) {
    const toolName = toolNameByCallId.get(event.toolCallId);
    queue.push(toolName ? { ...event, toolName } : event);
    return;
  }
  queue.push(event);
}
