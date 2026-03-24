/**
 * DirectDispatchParser：direct 模式 assistant 文本解析器。
 *
 * 关键点（中文）
 * - 默认把 assistant 文本原样当作用户可见正文发送。
 * - frontmatter metadata 语义与 `city chat send` 保持一致。
 * - 额外保留 `react` 字段用于 direct 模式贴表情。
 */

import type {
  DirectReactTagPayload,
  ResolvedDirectDispatchPlan,
  ResolvedDirectReactionPayload,
  ResolvedDirectTextPayload,
} from "@services/chat/types/DirectDispatch.js";
import {
  buildChatMessageText,
  parseChatMessageMarkup,
} from "@services/chat/runtime/ChatMessageMarkup.js";
import { parseChatSendOptionsFromMetadata } from "@services/chat/runtime/ChatSendMetadata.js";
import type { ChatMessageSegment } from "@services/chat/types/ChatMessageMarkup.js";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = normalizeText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function parseReactionFromMetadata(value: unknown): DirectReactTagPayload | null {
  if (typeof value === "string") {
    const emoji = normalizeText(value);
    return emoji ? { emoji } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const emoji = normalizeText(raw.emoji);
  if (!emoji) return null;
  const big = parseBoolean(raw.big);
  return {
    emoji,
    ...(big ? { big: true } : {}),
  };
}

function parseReactionsFromMetadata(
  metadata: Record<string, unknown>,
): DirectReactTagPayload[] {
  const out: DirectReactTagPayload[] = [];
  const raw = metadata.react;
  if (!raw) return out;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    const parsed = parseReactionFromMetadata(item);
    if (!parsed) continue;
    out.push(parsed);
  }
  return out;
}

function resolveTextPlan(params: {
  fallbackChatKey: string;
  metadata: Record<string, unknown>;
  segments: ChatMessageSegment[];
}): ResolvedDirectTextPayload | null {
  const sendOptions = parseChatSendOptionsFromMetadata({
    metadata: params.metadata,
    strict: false,
  });
  const chatKey = normalizeText(sendOptions.chatKey || params.fallbackChatKey);
  const text = buildChatMessageText({
    segments: params.segments,
  });
  if (!chatKey || !text) return null;

  return {
    text,
    chatKey,
    replyToMessage: sendOptions.replyToMessage === true,
    ...(typeof sendOptions.messageId === "string" && sendOptions.messageId
      ? { messageId: sendOptions.messageId }
      : {}),
    ...(typeof sendOptions.delayMs === "number"
      ? { delayMs: sendOptions.delayMs }
      : {}),
    ...(typeof sendOptions.sendAtMs === "number"
      ? { sendAtMs: sendOptions.sendAtMs }
      : {}),
  };
}

function resolveReactionPlans(params: {
  fallbackChatKey: string;
  metadata: Record<string, unknown>;
  reacts: DirectReactTagPayload[];
}): ResolvedDirectReactionPayload[] {
  const out: ResolvedDirectReactionPayload[] = [];
  const sendOptions = parseChatSendOptionsFromMetadata({
    metadata: params.metadata,
    strict: false,
  });
  const chatKey = normalizeText(sendOptions.chatKey || params.fallbackChatKey);
  const messageId = normalizeText(sendOptions.messageId);
  if (!chatKey) return out;

  for (const react of params.reacts) {
    const emoji = normalizeText(react.emoji);
    if (!emoji) continue;
    out.push({
      emoji,
      chatKey,
      ...(messageId ? { messageId } : {}),
      big: react.big === true,
    });
  }
  return out;
}

/**
 * 从 assistant 文本中解析 direct 出站执行计划。
 *
 * 协议（中文）
 * - frontmatter metadata：与 `city chat send` 参数保持一致。
 * - 附件统一使用 `<file type=\"document|photo|voice|audio|video\">path</file>`。
 * - `react` 仍仅用于 direct 模式的反应动作。
 */
export function parseDirectDispatchAssistantText(params: {
  assistantText: string;
  fallbackChatKey: string;
}): ResolvedDirectDispatchPlan | null {
  const source = String(params.assistantText ?? "");
  const fallbackChatKey = normalizeText(params.fallbackChatKey);
  if (!normalizeText(source) || !fallbackChatKey) return null;

  const parsed = parseChatMessageMarkup(source);
  const reacts = parseReactionsFromMetadata(parsed.metadata);
  const textPlan = resolveTextPlan({
    fallbackChatKey,
    metadata: parsed.metadata,
    segments: parsed.segments,
  });
  const reactionPlans = resolveReactionPlans({
    fallbackChatKey,
    metadata: parsed.metadata,
    reacts,
  });

  if (!textPlan && reactionPlans.length === 0) return null;
  return {
    text: textPlan,
    reactions: reactionPlans,
  };
}
