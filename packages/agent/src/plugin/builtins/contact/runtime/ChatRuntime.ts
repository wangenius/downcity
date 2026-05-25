/**
 * contact chat 运行时。
 *
 * 关键点（中文）
 * - 一个 contact 固定一条长期对话历史。
 * - 远端收到 chat 后运行本地 agent session，并返回 assistant 文本。
 */

import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { ContactChatResponse } from "@/plugin/builtins/contact/types/ContactChat.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import {
  appendContactMessage,
  findContactByInboundToken,
} from "./ContactStore.js";

function extractMessageText(message: SessionMessageV1 | null | undefined): string {
  const parts = Array.isArray((message as { parts?: unknown } | null)?.parts)
    ? ((message as { parts: unknown[] }).parts)
    : [];
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as { type?: unknown; text?: unknown };
      return item.type === "text" ? String(item.text || "") : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * 处理远端 contact chat 消息。
 */
export async function receiveContactChatMessage(params: {
  /**
   * 当前 agent context。
   */
  context: AgentContext;
  /**
   * 入站 contact token。
   */
  token: string;
  /**
   * 消息正文。
   */
  message: string;
}): Promise<ContactChatResponse> {
  const contact = await findContactByInboundToken(params.context.rootPath, params.token);
  if (!contact || contact.status !== "trusted") {
    return {
      success: false,
      reply: "",
      contactId: "",
      error: "Invalid contact token",
    };
  }

  const now = Date.now();
  await appendContactMessage(params.context.rootPath, contact.id, {
    role: "remote",
    text: params.message,
    createdAt: now,
  });

  const sessionId = `contact_${contact.id}`;
  const turn = await params.context.session.get(sessionId).prompt({
    query: params.message,
    extra: {
      ingressKind: "exec",
      via: "contact_chat",
      contactId: contact.id,
    },
  });
  const result = await turn.finished;
  const reply = extractMessageText(result.assistantMessage);
  await appendContactMessage(params.context.rootPath, contact.id, {
    role: "local",
    text: reply,
    createdAt: Date.now(),
  });

  return {
    success: true,
    reply,
    contactId: contact.id,
  };
}
