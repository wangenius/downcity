/**
 * ChatActionExecution：chat plugin runtime 的业务 action 执行模块。
 *
 * 关键点（中文）
 * - 这里只放与会话/消息相关的执行逻辑。
 * - 渠道生命周期与配置控制已拆到 `ChatChannelFacade`，避免单文件混合过多职责。
 * - 输出结构保持原有格式，确保 CLI/API 行为不变。
 */

import path from "node:path";
import type { JsonObject } from "@downcity/agent";
import type { AgentContext } from "@downcity/agent";
import type { PluginRunContext } from "@downcity/agent";
import type {
  ChatDeleteActionPayload,
  ChatHistoryActionPayload,
  ChatHistoryClearActionPayload,
  ChatInfoActionPayload,
  ChatListActionPayload,
  ChatReactActionPayload,
  ChatSendActionPayload,
  ChatSessionActionPayload,
} from "@/chat/types/ChatPluginActionPayload.js";
import type { ChatHistoryEventV1 } from "@/chat/types/ChatHistory.js";
import type { ChatListItemV1 } from "@/chat/types/ChatCommand.js";
import {
  deleteChatByChatKey,
  resolveChatKey,
  resolveChatSessionSnapshot,
  sendChatActionByChatKey,
  sendChatTextByChatKey,
} from "@/chat/Action.js";
import { listChannelSessionRoutes } from "@/chat/runtime/ChannelContextStore.js";
import { readChatHistory } from "@/chat/runtime/ChatHistoryStore.js";
import { readChatMetaBySessionId } from "@/chat/runtime/ChatMetaStore.js";
import { resolveChatChannelNameOrThrow } from "@/chat/runtime/ChatChannelFacade.js";
import {
  clear_chat_history,
  get_chat_channel_meta_path,
  get_chat_history_path,
  get_chat_session_dir_path,
} from "@/chat/runtime/ChatStorage.js";

/**
 * 执行 `chat.history_clear` action。
 */
export async function execute_chat_history_clear_action(params: {
  context: AgentContext;
  payload: ChatHistoryClearActionPayload;
}) {
  const session_id = String(params.payload.sessionId || "").trim();
  if (!session_id) {
    return {
      success: false,
      error: "Missing sessionId",
    };
  }
  const cleared = await clear_chat_history(params.context.rootPath, session_id);
  return {
    success: true,
    data: {
      sessionId: session_id,
      cleared,
    },
  };
}

function toChatHistoryView(events: ChatHistoryEventV1[]): JsonObject[] {
  return events.map((event) => ({
    ...event,
    isoTime: new Date(event.ts).toISOString(),
  })) as JsonObject[];
}

/**
 * 执行 `chat.context` action。
 */
export async function executeChatContextAction(params: {
  context: AgentContext;
  payload: ChatSessionActionPayload;
  run_context?: PluginRunContext;
}) {
  const snapshot = resolveChatSessionSnapshot({
    context: params.context,
    run_context: params.run_context,
    ...(params.payload.chatKey ? { chatKey: params.payload.chatKey } : {}),
    ...(params.payload.sessionId ? { sessionId: params.payload.sessionId } : {}),
  });
  return {
    success: true,
    data: {
      context: snapshot,
    },
  };
}

/**
 * 执行 `chat.list` action。
 */
export async function executeChatListAction(params: {
  context: AgentContext;
  payload: ChatListActionPayload;
}) {
  const rawChannel = String(params.payload.channel || "").trim();
  const channel = rawChannel ? resolveChatChannelNameOrThrow(rawChannel) : undefined;
  const rawLimit =
    typeof params.payload.limit === "number" && Number.isFinite(params.payload.limit)
      ? Math.trunc(params.payload.limit)
      : undefined;
  const limit = rawLimit && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;
  const q = String(params.payload.q || "").trim();
  const qLower = q ? q.toLowerCase() : "";

  const meta = await listChannelSessionRoutes({ context: params.context });

  const matches = (value?: string): boolean => {
    if (!qLower) return true;
    const text = String(value || "").trim().toLowerCase();
    return text ? text.includes(qLower) : false;
  };

  const filtered = meta.routes
    .filter((route) => (channel ? route.channel === channel : true))
    .filter((route) => {
      if (!qLower) return true;
      return (
        matches(route.sessionId) ||
        matches(route.chatId) ||
        matches(route.chatTitle) ||
        matches(route.actorName) ||
        matches(route.actorId) ||
        matches(route.targetType)
      );
    });

  const total = filtered.length;
  const chats: ChatListItemV1[] = filtered.slice(0, limit).map((route) => ({
    chatKey: route.sessionId,
    sessionId: route.sessionId,
    channel: route.channel,
    chatId: route.chatId,
    ...(route.targetType ? { targetType: route.targetType } : {}),
    ...(typeof route.threadId === "number" ? { threadId: route.threadId } : {}),
    ...(route.chatTitle ? { chatTitle: route.chatTitle } : {}),
    ...(route.actorName ? { actorName: route.actorName } : {}),
    ...(route.actorId ? { actorId: route.actorId } : {}),
    updatedAt: route.updatedAt,
    isoUpdatedAt: new Date(route.updatedAt).toISOString(),
  }));

  return {
    success: true,
    data: {
      metaUpdatedAt: meta.updatedAt,
      metaIsoUpdatedAt: new Date(meta.updatedAt).toISOString(),
      total,
      count: chats.length,
      chats,
    },
  };
}

/**
 * 执行 `chat.info` action。
 */
export async function executeChatInfoAction(params: {
  context: AgentContext;
  payload: ChatInfoActionPayload;
  run_context?: PluginRunContext;
}) {
  const explicitSessionId = String(params.payload.sessionId || "").trim();
  const explicitChatKey = String(params.payload.chatKey || "").trim();
  const snapshot = resolveChatSessionSnapshot({
    context: params.context,
    run_context: params.run_context,
    ...(explicitSessionId ? { sessionId: explicitSessionId } : {}),
    ...(explicitChatKey ? { chatKey: explicitChatKey } : {}),
  });

  const sessionId = String(explicitSessionId || snapshot.sessionId || "").trim();
  const chatKey = String(explicitChatKey || snapshot.chatKey || sessionId || "").trim();
  if (!sessionId) {
    return {
      success: false,
      error:
        "Missing sessionId. Provide --session-id/--chat-key or ensure DC_SESSION_ID/DC_CTX_CHAT_KEY is injected.",
    };
  }

  const route = await readChatMetaBySessionId({
    context: params.context,
    sessionId,
  });

  const toPosixRelativePath = (absPath: string): string =>
    path.relative(params.context.rootPath, absPath).split(path.sep).join("/");

  const channelMetaPath = toPosixRelativePath(
    get_chat_channel_meta_path(params.context.rootPath),
  );
  const chatDirPath = toPosixRelativePath(
    get_chat_session_dir_path(params.context.rootPath, sessionId),
  );
  const historyPath = toPosixRelativePath(
    get_chat_history_path(params.context.rootPath, sessionId),
  );

  return {
    success: true,
    data: {
      sessionId,
      chatKey,
      context: snapshot,
      route,
      ...(route ? { routeIsoUpdatedAt: new Date(route.updatedAt).toISOString() } : {}),
      paths: {
        channelMetaPath,
        chatDirPath,
        historyPath,
      },
    },
  };
}

/**
 * 执行 `chat.history` action。
 */
export async function executeChatHistoryAction(params: {
  context: AgentContext;
  payload: ChatHistoryActionPayload;
  run_context?: PluginRunContext;
}) {
  const payload = params.payload;
  const snapshot = resolveChatSessionSnapshot({
    context: params.context,
    run_context: params.run_context,
    ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
    ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
  });
  const explicitSessionId = String(payload.sessionId || "").trim();
  const explicitChatKey = String(payload.chatKey || "").trim();
  const sessionId = String(
    explicitSessionId || explicitChatKey || snapshot.sessionId || "",
  ).trim();
  if (!sessionId) {
    return {
      success: false,
      error:
        "Missing sessionId. Provide --session-id/--chat-key or ensure DC_SESSION_ID is injected.",
    };
  }

  const historyResult = await readChatHistory({
    context: params.context,
    sessionId,
    limit: payload.limit,
    direction: payload.direction || "all",
    beforeTs: payload.beforeTs,
    afterTs: payload.afterTs,
  });
  const historyPath = historyResult.historyPath
    .replace(`${params.context.rootPath}/`, "")
    .split("\\")
    .join("/");

  return {
    success: true,
    data: {
      context: snapshot,
      historyPath,
      count: historyResult.events.length,
      events: toChatHistoryView(historyResult.events),
    },
  };
}

/**
 * 执行 `chat.send` action。
 */
export async function executeChatSendAction(params: {
  context: AgentContext;
  payload: ChatSendActionPayload;
  run_context?: PluginRunContext;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
    run_context: params.run_context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const shouldScheduleInBackground =
    typeof params.payload.delayMs === "number" ||
    typeof params.payload.sendAtMs === "number";
  const result = await sendChatTextByChatKey({
    context: params.context,
    chatKey,
    text: String(params.payload.text || ""),
    delayMs: params.payload.delayMs,
    sendAtMs: params.payload.sendAtMs,
    // 关键点（中文）：plugin runtime action 面向 CLI/API，定时或延迟发送应立即返回，
    // 由 runtime 在后台内存中继续等待并到点投递，避免 HTTP 请求长时间挂起。
    ...(shouldScheduleInBackground ? { nonBlockingDelay: true } : {}),
    replyToMessage: params.payload.replyToMessage === true,
    ...(typeof params.payload.messageId === "string" && params.payload.messageId.trim()
      ? { messageId: params.payload.messageId.trim() }
      : {}),
    run_context: params.run_context,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat send failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
    },
  };
}

/**
 * 执行 `chat.react` action。
 */
export async function executeChatReactAction(params: {
  context: AgentContext;
  payload: ChatReactActionPayload;
  run_context?: PluginRunContext;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
    run_context: params.run_context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const messageId = String(params.payload.messageId || "").trim() || undefined;
  const result = await sendChatActionByChatKey({
    context: params.context,
    chatKey,
    action: "react",
    messageId,
    reactionEmoji: params.payload.emoji,
    reactionIsBig: params.payload.big === true,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat react failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
      ...(messageId ? { messageId } : {}),
      ...(typeof params.payload.emoji === "string" && params.payload.emoji.trim()
        ? { emoji: params.payload.emoji.trim() }
        : {}),
      ...(params.payload.big === true ? { big: true } : {}),
    },
  };
}

/**
 * 执行 `chat.delete` action。
 */
export async function executeChatDeleteAction(params: {
  context: AgentContext;
  payload: ChatDeleteActionPayload;
  run_context?: PluginRunContext;
}) {
  const result = await deleteChatByChatKey({
    context: params.context,
    run_context: params.run_context,
    ...(params.payload.chatKey ? { chatKey: params.payload.chatKey } : {}),
    ...(params.payload.sessionId ? { sessionId: params.payload.sessionId } : {}),
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat delete failed",
    };
  }
  return {
    success: true,
    data: {
      sessionId: result.sessionId || null,
      deleted: result.deleted === true,
      removedMeta: result.removedMeta === true,
      removedChatDir: result.removedChatDir === true,
      removedSessionDir: result.removedSessionDir === true,
    },
  };
}
