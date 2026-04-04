/**
 * BaseChatChannel 共享辅助函数。
 *
 * 关键点（中文）
 * - 这里只放 session 映射、history 落盘、chat meta 更新等“通用支撑逻辑”。
 * - `BaseChatChannel` 保留编排职责，避免基类继续承担过多存储细节。
 */

import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import {
  resolveSessionIdByChatTarget,
  resolveOrCreateSessionIdByChatTarget,
  upsertChatMetaBySessionId,
} from "@services/chat/runtime/ChatMetaStore.js";
import {
  appendInboundChatHistory,
  appendOutboundChatHistory,
} from "@services/chat/runtime/ChatHistoryStore.js";

/**
 * 渠道附加元信息。
 */
export type ChannelUserMessageMeta = {
  /**
   * 任意附加字段名。
   */
  [key: string]: JsonValue | undefined;
};

/**
 * 基于渠道目标解析 sessionId 的输入。
 */
export interface ChannelSessionTargetParams {
  /**
   * 当前 execution runtime。
   */
  context: ExecutionContext;
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 平台 chatId。
   */
  chatId: string;
  /**
   * 可选 chatType。
   */
  chatType?: string;
  /**
   * 可选 thread / topic id。
   */
  messageThreadId?: number;
}

/**
 * 渠道 meta 更新输入。
 */
export interface ChannelChatMetaParams {
  /**
   * 当前 execution runtime。
   */
  context: ExecutionContext;
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * sessionId。
   */
  sessionId: string;
  /**
   * 平台 chatId。
   */
  chatId: string;
  /**
   * 可选目标类型。
   */
  targetType?: string;
  /**
   * 可选 thread id。
   */
  threadId?: number;
  /**
   * 可选消息 id。
   */
  messageId?: string;
  /**
   * 可选用户 id。
   */
  actorId?: string;
  /**
   * 可选用户名。
   */
  actorName?: string;
  /**
   * 会话标题。
   */
  chatTitle?: string;
}

/**
 * 入站 history 写入输入。
 */
export interface ChannelInboundHistoryParams {
  /**
   * 当前 execution runtime。
   */
  context: ExecutionContext;
  /**
   * 日志器。
   */
  logger: Logger;
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * sessionId。
   */
  sessionId: string;
  /**
   * 平台 chatId。
   */
  chatId: string;
  /**
   * 入站类型，audit 或 exec。
   */
  ingressKind: "audit" | "exec";
  /**
   * 文本内容。
   */
  text: string;
  /**
   * 可选目标类型。
   */
  targetType?: string;
  /**
   * 可选 thread id。
   */
  threadId?: number;
  /**
   * 可选消息 id。
   */
  messageId?: string;
  /**
   * 可选用户 id。
   */
  actorId?: string;
  /**
   * 可选用户名。
   */
  actorName?: string;
  /**
   * 附加元信息。
   */
  extra?: JsonObject;
}

/**
 * 工具侧 outbound history 输入。
 */
export interface ChannelToolOutboundHistoryParams extends ChannelSessionTargetParams {
  /**
   * 日志器。
   */
  logger: Logger;
  /**
   * 文本内容。
   */
  text: string;
  /**
   * 可选消息 id。
   */
  messageId?: string;
}

/**
 * 去除 meta 中的 undefined 字段。
 */
export function stripUndefinedMeta(meta: ChannelUserMessageMeta): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * 通过渠道目标解析或创建 sessionId。
 */
export async function resolveOrCreateChannelSessionId(
  params: ChannelSessionTargetParams,
): Promise<string | null> {
  const chatId = String(params.chatId || "").trim();
  if (!chatId) return null;
  return await resolveOrCreateSessionIdByChatTarget({
    context: params.context,
    channel: params.channel,
    chatId,
    ...(typeof params.chatType === "string" ? { targetType: params.chatType } : {}),
    ...(typeof params.messageThreadId === "number"
      ? { threadId: params.messageThreadId }
      : {}),
  });
}

/**
 * 通过渠道目标解析已有 sessionId。
 */
export async function resolveChannelSessionId(
  params: ChannelSessionTargetParams,
): Promise<string | null> {
  const chatId = String(params.chatId || "").trim();
  if (!chatId) return null;
  return await resolveSessionIdByChatTarget({
    context: params.context,
    channel: params.channel,
    chatId,
    ...(typeof params.chatType === "string" ? { targetType: params.chatType } : {}),
    ...(typeof params.messageThreadId === "number"
      ? { threadId: params.messageThreadId }
      : {}),
  });
}

/**
 * 更新 session 对应的 chat meta。
 */
export async function updateChannelChatMeta(
  params: ChannelChatMetaParams,
): Promise<void> {
  await upsertChatMetaBySessionId({
    context: params.context,
    sessionId: params.sessionId,
    channel: params.channel,
    chatId: params.chatId,
    targetType: params.targetType,
    threadId: params.threadId,
    messageId: params.messageId,
    actorId: params.actorId,
    actorName: params.actorName,
    chatTitle: params.chatTitle,
  });
}

/**
 * 追加入站 chat history。
 */
export async function appendInboundChannelHistory(
  params: ChannelInboundHistoryParams,
): Promise<void> {
  try {
    await appendInboundChatHistory({
      context: params.context,
      sessionId: params.sessionId,
      channel: params.channel,
      chatId: params.chatId,
      ingressKind: params.ingressKind,
      text: params.text,
      targetType: params.targetType,
      threadId: params.threadId,
      messageId: params.messageId,
      actorId: params.actorId,
      actorName: params.actorName,
      extra: params.extra,
    });
  } catch (error) {
    params.logger.warn("Failed to append inbound chat history", {
      error: String(error),
      channel: params.channel,
      sessionId: params.sessionId,
      chatId: params.chatId,
      ingressKind: params.ingressKind,
    });
  }
}

/**
 * 工具发送成功后补齐 outbound history。
 */
export async function appendToolOutboundChannelHistory(
  params: ChannelToolOutboundHistoryParams,
): Promise<void> {
  const chatId = String(params.chatId || "").trim();
  const text = String(params.text ?? "");
  if (!chatId || !text.trim()) return;

  const sessionId = await resolveOrCreateChannelSessionId(params);
  if (!sessionId) return;

  try {
    await appendOutboundChatHistory({
      context: params.context,
      sessionId,
      channel: params.channel,
      chatId,
      text,
      targetType: params.chatType,
      ...(typeof params.messageThreadId === "number"
        ? { threadId: params.messageThreadId }
        : {}),
      ...(typeof params.messageId === "string" && params.messageId
        ? { messageId: params.messageId }
        : {}),
      extra: {
        source: "channel_send_tool_text",
      },
    });
  } catch (error) {
    params.logger.warn("Failed to append outbound chat history", {
      error: String(error),
      channel: params.channel,
      sessionId,
      chatId,
    });
  }
}
