/**
 * Chat reply dispatch helper。
 *
 * 关键点（中文）
 * - 把 chat 回复前/回复后的 plugin 点统一收敛到这里。
 * - 仅服务 agent 执行生命周期，不覆盖手动 `chat send`。
 */

import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { ChatReplyDispatchInput, ChatReplyEffectInput } from "@/types/ChatPlugin.js";
import type { JsonValue } from "@/types/Json.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";
import { resolveDispatchTargetByChatKey } from "@services/chat/runtime/ChatkeySend.js";

function normalizeText(value: string | undefined): string {
  return String(value || "").trim();
}

/**
 * 回复前文本增强。
 */
export async function prepareChatReplyText(params: {
  runtime: ExecutionRuntime;
  input: ChatReplyDispatchInput;
}): Promise<string> {
  const input = {
    ...params.input,
    text: normalizeText(params.input.text),
  };
  if (!input.text) return "";

  const next = await params.runtime.plugins.pipeline<JsonValue>(
    CHAT_PLUGIN_POINTS.beforeReply,
    input as unknown as JsonValue,
  );
  const record =
    next && typeof next === "object" && !Array.isArray(next)
      ? (next as Record<string, unknown>)
      : {};
  return normalizeText(typeof record.text === "string" ? record.text : input.text);
}

/**
 * 回复后事件分发。
 */
export async function emitChatReplyEffect(params: {
  runtime: ExecutionRuntime;
  input: ChatReplyEffectInput;
}): Promise<void> {
  await params.runtime.plugins.effect(
    CHAT_PLUGIN_POINTS.afterReply,
    params.input as unknown as JsonValue,
  );
}

/**
 * 基于 chatKey 补齐回复目标上下文。
 */
export async function resolveChatReplyTarget(params: {
  runtime: ExecutionRuntime;
  chatKey: string;
}): Promise<{
  channel?: ChatDispatchChannel;
  chatId?: string;
  messageId?: string;
}> {
  const target = await resolveDispatchTargetByChatKey({
    context: params.runtime,
    chatKey: params.chatKey,
  });
  if (!target) return {};
  return {
    channel: target.channel,
    chatId: target.chatId,
    ...(target.messageId ? { messageId: target.messageId } : {}),
  };
}
