/**
 * Chat inbound augment helper。
 *
 * 关键点（中文）
 * - chat service 先构造基础输入，再交给 plugin pipeline 做增强。
 * - 最终拼装顺序固定为：attachmentText -> pluginSections -> bodyText。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ChatInboundAugmentInput } from "@/types/ChatPlugin.js";
import type { JsonValue } from "@/types/Json.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";

function normalizeText(value: string | undefined): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

/**
 * 执行 chat 入站增强 pipeline。
 */
export async function augmentChatInboundInput(params: {
  runtime: ExecutionContext;
  input: ChatInboundAugmentInput;
}): Promise<ChatInboundAugmentInput> {
  const normalized: ChatInboundAugmentInput = {
    ...params.input,
    ...(params.input.chatType ? { chatType: params.input.chatType } : {}),
    ...(params.input.chatKey ? { chatKey: params.input.chatKey } : {}),
    ...(params.input.messageId ? { messageId: params.input.messageId } : {}),
    ...(normalizeText(params.input.attachmentText)
      ? { attachmentText: normalizeText(params.input.attachmentText) }
      : {}),
    ...(normalizeText(params.input.bodyText)
      ? { bodyText: normalizeText(params.input.bodyText) }
      : {}),
    pluginSections: Array.isArray(params.input.pluginSections)
      ? params.input.pluginSections.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    attachments: Array.isArray(params.input.attachments) ? params.input.attachments : [],
  };

  return (params.runtime.plugins.pipeline<JsonValue>(
    CHAT_PLUGIN_POINTS.augmentInbound,
    normalized as unknown as JsonValue,
  ) as unknown) as Promise<ChatInboundAugmentInput>;
}

/**
 * 把增强后的 chat 入站输入拼成最终正文。
 */
export function buildChatInboundText(input: ChatInboundAugmentInput): string {
  return [
    normalizeText(input.attachmentText),
    ...(Array.isArray(input.pluginSections)
      ? input.pluginSections.map((item) => normalizeText(item)).filter(Boolean)
      : []),
    normalizeText(input.bodyText),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
