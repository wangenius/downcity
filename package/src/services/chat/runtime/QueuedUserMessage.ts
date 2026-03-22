/**
 * QueuedUserMessage：构造入队执行消息文本。
 *
 * 关键点（中文）
 * - 统一生成 `<info>...</info>` 头部，供模型读取会话路由与身份元信息。
 * - 供 chat 入站执行与其他复用入口共用，避免重复实现。
 */

import type { ChatAuthorizationPermission } from "@/types/AuthPlugin.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

function normalizeInfoValue(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (!text) return "";
  return text.replace(/</g, "&#60;").replace(/>/g, "&#62;");
}

/**
 * 构造“入队 user message”文本。
 *
 * 说明（中文）
 * - 顶部 `<info>` 为内部语义块，记录 channel/context/chat/user 等路由元信息。
 * - 正文为用户原始输入（可为空）。
 */
export function buildQueuedUserMessageWithInfo(params: {
  channel: ChatDispatchChannel;
  contextId: string;
  chatKey: string;
  chatId: string;
  chatType?: string;
  threadId?: number;
  messageId?: string;
  userId?: string;
  username?: string;
  roleId?: string;
  permissions?: ChatAuthorizationPermission[];
  text: string;
}): string {
  const infoLines = [
    `channel: ${normalizeInfoValue(params.channel)}`,
    `context_id: ${normalizeInfoValue(params.contextId)}`,
    `chat_key: ${normalizeInfoValue(params.chatKey)}`,
    `chat_id: ${normalizeInfoValue(params.chatId)}`,
    `chat_type: ${normalizeInfoValue(params.chatType || "unknown")}`,
    `thread_id: ${normalizeInfoValue(
      typeof params.threadId === "number" ? String(params.threadId) : "none",
    )}`,
    `message_id: ${normalizeInfoValue(params.messageId || "unknown")}`,
    `user_id: ${normalizeInfoValue(params.userId || "unknown")}`,
    `username: ${normalizeInfoValue(params.username || "unknown")}`,
    `role_id: ${normalizeInfoValue(params.roleId || "unknown")}`,
    `permissions: ${normalizeInfoValue((params.permissions || []).join("," ) || "none")}`,
    `received_at: ${new Date().toISOString()}`,
  ];
  const infoBlock = `<info>\n${infoLines.join("\n")}\n</info>`;
  const body = String(params.text ?? "").trim();
  if (!body) return infoBlock;
  return `${infoBlock}\n\n${body}`;
}
