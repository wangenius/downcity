/**
 * Send text to a target chat using chatKey.
 *
 * 设计动机（中文）
 * - Task runner / scheduler 需要在“非当前对话上下文”向指定 chatKey 投递消息
 * - 复用现有 dispatcher 与 chat meta（尤其 QQ 的被动回复依赖 messageId）
 *
 * 注意
 * - 这里是运行时内部能力（不是 tool）；tool `chat_contact_send` 也会复用本实现
 */

import { getChatSender } from "./ChatSendRegistry.js";
import type {
  ChatDispatchAction,
  ChatDispatchChannel,
} from "@services/chat/types/ChatDispatcher.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import { readChatMetaBySessionId } from "./ChatMetaStore.js";

/**
 * 解析实际分发目标。
 *
 * 规则（中文）
 * - 仅使用 services/chat 维护的 session 路由映射。
 * - 不再支持 legacy chatKey 字符串解析回退。
 */
export async function resolveDispatchTargetByChatKey(params: {
  context: ExecutionRuntime;
  chatKey: string;
}): Promise<{
  channel: ChatDispatchChannel;
  chatId: string;
  chatType?: string;
  messageThreadId?: number;
  messageId?: string;
} | null> {
  const storedMeta = await readChatMetaBySessionId({
    context: params.context,
    sessionId: params.chatKey,
  });
  const channel = storedMeta?.channel;
  const chatId = String(storedMeta?.chatId || "").trim();
  if (!channel || !chatId) return null;

  const chatType =
    typeof storedMeta?.targetType === "string" && storedMeta.targetType
      ? storedMeta.targetType
      : undefined;
  const messageThreadId =
    typeof storedMeta?.threadId === "number" &&
    Number.isFinite(storedMeta.threadId)
      ? storedMeta.threadId
      : undefined;
  const messageId =
    typeof storedMeta?.messageId === "string" && storedMeta.messageId
      ? storedMeta.messageId
      : undefined;

  return {
    channel: channel as ChatDispatchChannel,
    chatId,
    ...(typeof chatType === "string" && chatType ? { chatType } : {}),
    ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
    ...(typeof messageId === "string" && messageId ? { messageId } : {}),
  };
}

/**
 * 按 chatKey 发送文本到对应平台。
 *
 * 流程（中文）
 * 1) 通过 sessionId 读取映射并定位 channel dispatcher
 * 2) 从 chat meta 回填 chatType/threadId/messageId
 * 3) 合并参数后调用 dispatcher 发送
 */
export async function sendTextByChatKey(params: {
  context: ExecutionRuntime;
  chatKey: string;
  text: string;
  replyToMessage?: boolean;
  messageId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const context = params.context;
  const chatKey = String(params.chatKey || "").trim();
  const text = String(params.text ?? "");
  if (!chatKey) return { success: false, error: "Missing chatKey" };
  if (!text.trim()) return { success: true };

  const target = await resolveDispatchTargetByChatKey({ context, chatKey });
  if (!target) {
    return {
      success: false,
      error: `Unsupported sessionId for dispatch: ${chatKey}`,
    };
  }

  const channel = target.channel;
  const chatId = target.chatId;

  const dispatcher = getChatSender(channel);
  if (!dispatcher) {
    return {
      success: false,
      error: `No dispatcher registered for channel: ${channel}`,
    };
  }

  const chatType = target.chatType;
  const messageThreadId = target.messageThreadId;
  const explicitMessageId = String(params.messageId || "").trim();
  const messageId = explicitMessageId || target.messageId;
  const shouldReplyToMessage = params.replyToMessage === true;

  if (channel === "qq") {
    if (!chatType || !messageId) {
      return {
        success: false,
        error:
          "QQ requires chatType + messageId to send a reply. Ask the target user to send a message first so Downcity can record latest chat meta.",
      };
    }
  }

  return dispatcher.sendText({
    chatId,
    text,
    ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
    ...(typeof chatType === "string" && chatType ? { chatType } : {}),
    ...(typeof messageId === "string" && messageId ? { messageId } : {}),
    ...(shouldReplyToMessage ? { replyToMessage: true } : {}),
  });
}

/**
 * 按 chatKey 发送平台动作（typing/react）。
 *
 * 流程（中文）
 * 1) 通过 sessionId 读取映射并定位 channel dispatcher
 * 2) 合并目标元信息与显式参数（显式 messageId 优先）
 * 3) 调用 dispatcher.sendAction
 */
export async function sendActionByChatKey(params: {
  context: ExecutionRuntime;
  chatKey: string;
  action: ChatDispatchAction;
  messageId?: string;
  reactionEmoji?: string;
  reactionIsBig?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const context = params.context;
  const chatKey = String(params.chatKey || "").trim();
  if (!chatKey) return { success: false, error: "Missing chatKey" };
  if (!params.action) return { success: false, error: "Missing action" };

  const target = await resolveDispatchTargetByChatKey({ context, chatKey });
  if (!target) {
    return {
      success: false,
      error: `Unsupported sessionId for dispatch: ${chatKey}`,
    };
  }

  const dispatcher = getChatSender(target.channel);
  if (!dispatcher || typeof dispatcher.sendAction !== "function") {
    return {
      success: false,
      error: `No action dispatcher registered for channel: ${target.channel}`,
    };
  }

  const messageId = String(params.messageId || "").trim() || target.messageId;
  return dispatcher.sendAction({
    chatId: target.chatId,
    action: params.action,
    ...(typeof target.messageThreadId === "number"
      ? { messageThreadId: target.messageThreadId }
      : {}),
    ...(typeof target.chatType === "string" && target.chatType
      ? { chatType: target.chatType }
      : {}),
    ...(typeof messageId === "string" && messageId ? { messageId } : {}),
    ...(typeof params.reactionEmoji === "string" && params.reactionEmoji.trim()
      ? { reactionEmoji: params.reactionEmoji.trim() }
      : {}),
    ...(params.reactionIsBig === true ? { reactionIsBig: true } : {}),
  });
}
