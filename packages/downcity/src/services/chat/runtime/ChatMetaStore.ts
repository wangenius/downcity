/**
 * ChatMetaStore：按 sessionId 维护 chat 路由元信息。
 *
 * 关键点（中文）
 * - 入站消息到达时由 services/chat 写入
 * - 出站按 sessionId/chatKey 发送时由 services/chat 读取
 * - 底层数据落在 `.downcity/channel/meta.json`，由 ChannelContextStore 统一维护
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { ChatMetaV1 } from "@services/chat/types/ChatMeta.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import {
  removeChannelSessionRouteBySessionId,
  readChannelSessionRouteBySessionId,
  resolveChannelSessionIdByTarget,
  resolveOrCreateChannelSessionIdByTarget,
  upsertChannelSessionRouteBySessionId,
} from "./ChannelContextStore.js";

function normalizeSessionId(sessionId: string): string {
  return String(sessionId || "").trim();
}

function normalizeChatId(chatId: string): string {
  return String(chatId || "").trim();
}

/**
 * 读取指定 sessionId 的 chat meta。
 */
export async function readChatMetaBySessionId(params: {
  context: ServiceRuntime;
  sessionId: string;
}): Promise<ChatMetaV1 | null> {
  const sessionId = normalizeSessionId(params.sessionId);
  if (!sessionId) return null;
  const route = await readChannelSessionRouteBySessionId({
    context: params.context,
    sessionId,
  });
  if (!route) return null;
  return {
    v: 1,
    updatedAt: route.updatedAt,
    sessionId: route.sessionId,
    channel: route.channel,
    chatId: route.chatId,
    ...(route.targetType ? { targetType: route.targetType } : {}),
    ...(typeof route.threadId === "number" ? { threadId: route.threadId } : {}),
    ...(route.messageId ? { messageId: route.messageId } : {}),
    ...(route.actorId ? { actorId: route.actorId } : {}),
    ...(route.actorName ? { actorName: route.actorName } : {}),
    ...(route.chatTitle ? { chatTitle: route.chatTitle } : {}),
  };
}

/**
 * 更新指定 sessionId 的 chat meta（全量覆盖最近快照）。
 */
export async function upsertChatMetaBySessionId(params: {
  context: ServiceRuntime;
  sessionId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  chatTitle?: string;
}): Promise<void> {
  const sessionId = normalizeSessionId(params.sessionId);
  const chatId = normalizeChatId(params.chatId);
  if (!sessionId || !chatId) return;
  await upsertChannelSessionRouteBySessionId({
    context: params.context,
    sessionId,
    target: {
      channel: params.channel,
      chatId,
      ...(typeof params.targetType === "string" ? { targetType: params.targetType } : {}),
      ...(typeof params.threadId === "number" ? { threadId: params.threadId } : {}),
    },
    messageId: params.messageId,
    actorId: params.actorId,
    actorName: params.actorName,
    chatTitle: params.chatTitle,
  });
}

/**
 * 通过渠道目标查找已有 sessionId。
 */
export async function resolveSessionIdByChatTarget(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  chatId: string;
  targetType?: string;
  threadId?: number;
}): Promise<string | null> {
  const chatId = normalizeChatId(params.chatId);
  if (!chatId) return null;
  return await resolveChannelSessionIdByTarget({
    context: params.context,
    target: {
      channel: params.channel,
      chatId,
      ...(typeof params.targetType === "string" ? { targetType: params.targetType } : {}),
      ...(typeof params.threadId === "number" ? { threadId: params.threadId } : {}),
    },
  });
}

/**
 * 通过渠道目标解析或创建 sessionId。
 */
export async function resolveOrCreateSessionIdByChatTarget(params: {
  context: ServiceRuntime;
  channel: ChatDispatchChannel;
  chatId: string;
  targetType?: string;
  threadId?: number;
}): Promise<string | null> {
  const chatId = normalizeChatId(params.chatId);
  if (!chatId) return null;
  return await resolveOrCreateChannelSessionIdByTarget({
    context: params.context,
    target: {
      channel: params.channel,
      chatId,
      ...(typeof params.targetType === "string" ? { targetType: params.targetType } : {}),
      ...(typeof params.threadId === "number" ? { threadId: params.threadId } : {}),
    },
  });
}

/**
 * 删除指定 sessionId 的 chat meta 映射。
 *
 * 关键点（中文）
 * - 删除后该 sessionId 不再可用于 chatKey 路由发送。
 * - 若同一 target 重新收到入站消息，会创建新的 sessionId。
 */
export async function removeChatMetaBySessionId(params: {
  context: ServiceRuntime;
  sessionId: string;
}): Promise<{
  removed: boolean;
  route: ChatMetaV1 | null;
}> {
  const sessionId = normalizeSessionId(params.sessionId);
  if (!sessionId) {
    return {
      removed: false,
      route: null,
    };
  }
  const result = await removeChannelSessionRouteBySessionId({
    context: params.context,
    sessionId,
  });
  const route = result.route;
  if (!route) {
    return {
      removed: false,
      route: null,
    };
  }
  return {
    removed: result.removed,
    route: {
      v: 1,
      updatedAt: route.updatedAt,
      sessionId: route.sessionId,
      channel: route.channel,
      chatId: route.chatId,
      ...(route.targetType ? { targetType: route.targetType } : {}),
      ...(typeof route.threadId === "number" ? { threadId: route.threadId } : {}),
      ...(route.messageId ? { messageId: route.messageId } : {}),
      ...(route.actorId ? { actorId: route.actorId } : {}),
      ...(route.actorName ? { actorName: route.actorName } : {}),
      ...(route.chatTitle ? { chatTitle: route.chatTitle } : {}),
    },
  };
}
