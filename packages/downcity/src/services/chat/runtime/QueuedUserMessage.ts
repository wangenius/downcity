/**
 * QueuedUserMessage：构造入队执行消息文本。
 *
 * 关键点（中文）
 * - 统一生成 `<info>...</info>` 头部，供模型读取用户与本次请求元信息。
 * - chat 路由环境不再放入 `<info>`，改由 system prompt 注入。
 * - 供 chat 入站执行与其他复用入口共用，避免重复实现。
 */

import type { QueuedUserInfoInput } from "@/types/ChatPromptContext.js";

function normalizeInfoValue(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (!text) return "";
  return text.replace(/</g, "&#60;").replace(/>/g, "&#62;");
}

/**
 * 构造“入队 user message”文本。
 *
 * 说明（中文）
 * - 顶部 `<info>` 为内部语义块，仅记录 user/request 元信息。
 * - 正文为用户原始输入（可为空）。
 */
export function buildQueuedUserMessageWithInfo(params: {
  text: string;
} & QueuedUserInfoInput): string {
  const infoLines = [
    `message_id: ${normalizeInfoValue(params.messageId || "unknown")}`,
    `user_id: ${normalizeInfoValue(params.userId || "unknown")}`,
    `username: ${normalizeInfoValue(params.username || "unknown")}`,
    `role_id: ${normalizeInfoValue(params.roleId || "unknown")}`,
    `permissions: ${normalizeInfoValue((params.permissions || []).join(",") || "none")}`,
    `received_at: ${normalizeInfoValue(params.receivedAt || new Date().toISOString())}`,
  ];
  if (normalizeInfoValue(params.userTimezone)) {
    infoLines.push(`user_timezone: ${normalizeInfoValue(params.userTimezone)}`);
  }
  const infoBlock = `<info>\n${infoLines.join("\n")}\n</info>`;
  const body = String(params.text ?? "").trim();
  if (!body) return infoBlock;
  return `${infoBlock}\n\n${body}`;
}
