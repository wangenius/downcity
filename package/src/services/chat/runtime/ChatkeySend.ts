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
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type { ServiceRuntimeDependencies } from "@main/service/types/ServiceRuntimeTypes.js";
import { readChatMetaByContextId } from "./ChatMetaStore.js";

type DispatchableChannel = "telegram" | "feishu" | "qq";

/**
 * 解析 chatKey 为 dispatch 参数。
 *
 * 支持格式（中文）
 * - telegram-chat-<id>
 * - telegram-chat-<id>-topic-<thread>
 * - feishu-chat-<id>
 * - qq-<chatType>-<chatId>
 */
export function parseChatKeyForDispatch(chatKey: string): {
  channel: DispatchableChannel;
  chatId: string;
  chatType?: string;
  messageThreadId?: number;
} | null {
  const key = String(chatKey || "").trim();
  if (!key) return null;

  // Telegram: telegram-chat-<id> 或 telegram-chat-<id>-topic-<thread>
  // 关键点（中文）：chatId 可能是负数（例如 supergroup：-100...），因此不能排除 `-`。
  const tgTopic = key.match(/^telegram-chat-(\S+)-topic-(\d+)$/i);
  if (tgTopic) {
    const chatId = String(tgTopic[1] || "").trim();
    if (!chatId) return null;
    return {
      channel: "telegram",
      chatId,
      messageThreadId: Number.parseInt(tgTopic[2], 10),
    };
  }
  const tg = key.match(/^telegram-chat-(\S+)$/i);
  if (tg) {
    const chatId = String(tg[1] || "").trim();
    if (!chatId) return null;
    return { channel: "telegram", chatId };
  }

  // Feishu: feishu-chat-<id>
  const fe = key.match(/^feishu-chat-(.+)$/i);
  if (fe) return { channel: "feishu", chatId: fe[1] };

  // QQ: qq-<chatType>-<chatId>
  const qq = key.match(/^qq-([^-\s]+)-(.+)$/i);
  if (qq) return { channel: "qq", chatType: qq[1], chatId: qq[2] };

  return null;
}

/**
 * 解析实际分发目标。
 *
 * 规则（中文）
 * - 优先显式 chatKey 解析结果
 * - parse 失败时回退到 services/chat 维护的 chat meta
 */
async function resolveDispatchTarget(params: {
  context: ServiceRuntimeDependencies;
  chatKey: string;
}): Promise<{
  channel: ChatDispatchChannel;
  chatId: string;
  chatType?: string;
  messageThreadId?: number;
  messageId?: string;
} | null> {
  const parsed = parseChatKeyForDispatch(params.chatKey);
  const storedMeta = await readChatMetaByContextId({
    context: params.context,
    contextId: params.chatKey,
  });

  const channel = parsed?.channel || storedMeta?.channel;
  const chatId = String(parsed?.chatId || storedMeta?.chatId || "").trim();
  if (!channel || !chatId) return null;

  const chatType =
    typeof storedMeta?.targetType === "string" && storedMeta.targetType
      ? storedMeta.targetType
      : typeof parsed?.chatType === "string"
        ? parsed.chatType
        : undefined;
  const messageThreadId =
    typeof storedMeta?.threadId === "number" && Number.isFinite(storedMeta.threadId)
      ? storedMeta.threadId
      : typeof parsed?.messageThreadId === "number"
        ? parsed.messageThreadId
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
 * 1) 解析 chatKey（失败时回退 chat meta）并定位 channel dispatcher
 * 2) 从 chat meta 回填 chatType/threadId/messageId
 * 3) 合并参数后调用 dispatcher 发送
 */
export async function sendTextByChatKey(params: {
  context: ServiceRuntimeDependencies;
  chatKey: string;
  text: string;
}): Promise<{ success: boolean; error?: string }> {
  const context = params.context;
  const chatKey = String(params.chatKey || "").trim();
  const text = String(params.text ?? "");
  if (!chatKey) return { success: false, error: "Missing chatKey" };
  if (!text.trim()) return { success: true };

  const target = await resolveDispatchTarget({ context, chatKey });
  if (!target) {
    return {
      success: false,
      error: `Unsupported chatKey/contextId for dispatch: ${chatKey}`,
    };
  }

  const channel = target.channel;
  const chatId = target.chatId;

  const dispatcher = getChatSender(channel);
  if (!dispatcher) {
    return { success: false, error: `No dispatcher registered for channel: ${channel}` };
  }

  const chatType = target.chatType;
  const messageThreadId = target.messageThreadId;
  const messageId = target.messageId;

  if (channel === "qq") {
    if (!chatType || !messageId) {
      return {
        success: false,
        error:
          "QQ requires chatType + messageId to send a reply. Ask the target user to send a message first so ShipMyAgent can record latest chat meta.",
      };
    }
  }

  return dispatcher.sendText({
    chatId,
    text,
    ...(typeof messageThreadId === "number" ? { messageThreadId } : {}),
    ...(typeof chatType === "string" && chatType ? { chatType } : {}),
    ...(typeof messageId === "string" && messageId ? { messageId } : {}),
  });
}
