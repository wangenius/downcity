/**
 * Memory Flush（手动刷写）。
 *
 * 关键点（中文）
 * - 首版使用确定性规则，不依赖额外模型调用。
 * - 仅提取最近消息的可读文本并落盘到 daily 记忆。
 */

import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { isTextUIPart } from "ai";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type {
  MemoryFlushPayload,
  MemoryFlushResponse,
} from "@services/memory/types/Memory.js";
import type { MemoryRuntimeState } from "./Store.js";
import { storeMemory } from "./Writer.js";

type AnyUiMessagePart = UIMessagePart<UIDataTypes, UITools>;

function toUiParts(message: { parts?: AnyUiMessagePart[] } | null | undefined): AnyUiMessagePart[] {
  return Array.isArray(message?.parts) ? message.parts : [];
}

function extractReadableLine(message: {
  role?: string;
  parts?: AnyUiMessagePart[];
}): string {
  const role = String(message.role || "").toLowerCase() === "user" ? "User" : "Assistant";
  const text = toUiParts(message)
    .filter(isTextUIPart)
    .map((part) => String(part.text || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) {
    return "";
  }
  return `${role}: ${text}`;
}

/**
 * 把当前会话最近消息刷写到 daily 记忆。
 */
export async function flushMemory(
  runtime: ExecutionContext,
  state: MemoryRuntimeState,
  payload: MemoryFlushPayload,
): Promise<MemoryFlushResponse> {
  const sessionId = String(payload.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("sessionId is required");
  }
  const maxMessages = Number.isFinite(payload.maxMessages)
    ? Math.max(1, Math.floor(payload.maxMessages as number))
    : 30;
  const persistor = runtime.session.getPersistor(sessionId);
  const total = await persistor.size();
  const start = Math.max(0, total - maxMessages);
  const messages = await persistor.slice(start, total);
  const lines = messages
    .map((msg) => extractReadableLine(msg))
    .filter((line) => line.length > 0);
  const summary =
    lines.length > 0
      ? lines.join("\n\n")
      : "本次 flush 未找到可写入的用户/助手文本内容。";
  const content = [
    `Flush Session: ${sessionId}`,
    `Window: ${start}-${Math.max(start, total - 1)}`,
    "",
    summary,
  ].join("\n");
  const saved = await storeMemory(runtime, state, {
    content,
    target: "daily",
  });
  return {
    path: saved.path,
    messageCount: lines.length,
    writtenChars: saved.writtenChars,
  };
}
