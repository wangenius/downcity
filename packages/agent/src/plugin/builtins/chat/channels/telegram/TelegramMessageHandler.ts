/**
 * Telegram 普通消息处理器。
 *
 * 关键点（中文）
 * - 负责单条 message 的授权、审计、附件保存、入队指令构造。
 * - 不持有 channel 实例；所有副作用通过显式依赖注入。
 * - `TelegramBot` 只保留平台生命周期与命令/callback 分发入口。
 */

import path from "path";
import type { Logger } from "@/utils/logger/Logger.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonObject } from "@/types/common/Json.js";
import type {
  IncomingAuthorizationParams,
  IncomingAuthorizationResult,
} from "@/plugin/builtins/chat/channels/BaseChatChannel.js";
import type { ChannelUserMessageMeta } from "@/plugin/builtins/chat/channels/BaseChatChannelSupport.js";
import {
  buildReplyContextExtra,
  buildReplyContextInstruction,
} from "@/plugin/builtins/chat/runtime/ReplyContextFormatter.js";
import {
  augmentChatInboundInput,
  buildChatInboundText,
} from "@/plugin/builtins/chat/runtime/InboundAugment.js";
import { renderChatMessageFileTag } from "@/plugin/builtins/chat/runtime/ChatMessageMarkup.js";
import { extractTelegramReplyContext } from "./ReplyContext.js";
import {
  getActorName,
  getTelegramChatTitle,
  type TelegramUpdate,
  type TelegramUser,
} from "./Shared.js";
import {
  buildTelegramAuditText,
  buildTelegramChatKey,
  isTelegramGroupChat,
  parseTelegramMessageId,
  saveTelegramIncomingAttachments,
  stripTelegramBotMention,
} from "./TelegramInbound.js";

/**
 * Telegram 普通消息处理所需平台能力。
 */
export interface TelegramMessagePlatform {
  /**
   * 当前 bot ID。
   */
  getBotId(): number | undefined;
  /**
   * 当前 bot 用户名。
   */
  getBotUsername(): string | undefined;
  /**
   * 发送入站轻量 ack reaction。
   */
  sendInboundAckReaction(params: {
    chatId: string;
    messageId?: number;
    emoji: string;
  }): Promise<void>;
  /**
   * 下载 Telegram 文件到本地缓存。
   */
  downloadTelegramFile(fileId: string, suggestedName?: string): Promise<string>;
}

/**
 * Audit 队列写入函数。
 */
export type TelegramMessageAuditWriter = (params: {
  chatId: string;
  messageId?: string;
  userId?: string;
  text: string;
  meta?: ChannelUserMessageMeta;
}) => Promise<void>;

/**
 * 执行队列入队函数。
 */
export type TelegramMessageExecutor = (params: {
  chatId: string;
  instructions: string;
  from?: TelegramUser;
  chatTitle?: string;
  messageId?: string;
  chatType?: NonNullable<TelegramUpdate["message"]>["chat"]["type"];
  messageThreadId?: number;
  extra?: JsonObject;
}) => Promise<void>;

/**
 * 命令分发函数。
 */
export type TelegramMessageCommandHandler = (params: {
  chatId: string;
  command: string;
  from?: TelegramUser;
  messageThreadId?: number;
}) => Promise<void>;

/**
 * Telegram message handler 依赖。
 */
export interface TelegramMessageHandlerOptions {
  /**
   * 当前 agent context。
   */
  context: AgentContext;
  /**
   * 项目根目录。
   */
  rootPath: string;
  /**
   * 日志器。
   */
  logger: Logger;
  /**
   * 入站 ack reaction emoji。
   */
  inboundAckEmoji: string;
  /**
   * Telegram 平台能力。
   */
  platform: TelegramMessagePlatform;
  /**
   * 入站主体观测。
   */
  observeIncomingAuthorization(
    params: IncomingAuthorizationParams,
  ): Promise<void>;
  /**
   * 入站授权判定。
   */
  evaluateIncomingAuthorization(
    params: IncomingAuthorizationParams,
  ): Promise<IncomingAuthorizationResult>;
  /**
   * 发送授权失败提示。
   */
  sendAuthorizationText(params: {
    chatId: string;
    text: string;
    chatType?: string;
    messageThreadId?: number;
  }): Promise<void>;
  /**
   * 构建授权失败提示文案。
   */
  buildUnauthorizedBlockedText(params?: {
    userId?: string;
    chatId?: string;
    chatType?: string;
  }): string;
  /**
   * Audit 队列写入。
   */
  enqueueAuditMessage: TelegramMessageAuditWriter;
  /**
   * 按 chatKey 串行执行。
   */
  runInChat(chatKey: string, fn: () => Promise<void>): Promise<void>;
  /**
   * 命令处理。
   */
  handleCommand: TelegramMessageCommandHandler;
  /**
   * 执行并回复。
   */
  executeAndReply: TelegramMessageExecutor;
}

/**
 * 处理 Telegram 普通消息。
 */
export async function handleTelegramMessage(
  options: TelegramMessageHandlerOptions,
  message: TelegramUpdate["message"],
): Promise<void> {
  if (!message || !message.chat) return;

  const chatId = message.chat.id.toString();
  const rawText =
    typeof message.text === "string"
      ? message.text
      : typeof message.caption === "string"
        ? message.caption
        : "";
  const entities = message.entities || message.caption_entities;
  const hasIncomingAttachment = hasTelegramIncomingAttachment(message);
  const messageId =
    typeof message.message_id === "number" ? String(message.message_id) : undefined;
  const messageThreadId =
    typeof message.message_thread_id === "number"
      ? message.message_thread_id
      : undefined;
  const from = message.from;
  const botId = options.platform.getBotId();
  const botUsername = options.platform.getBotUsername();
  const fromIsBot = isTelegramBotSender({ from, botId, botUsername });
  const actorId = from?.id ? String(from.id) : undefined;
  const actorName = getActorName(from);
  const chatTitle = getTelegramChatTitle(message.chat);
  const isGroup = isTelegramGroupChat(message.chat.type);
  const chatKey = buildTelegramChatKey(chatId, messageThreadId);

  if (!actorId) {
    options.logger.warn("Telegram 消息缺少发送者 userId，已忽略", {
      chatId,
      chatType: message.chat.type,
      messageId,
      messageThreadId,
      hasFrom: !!from,
    });
    return;
  }

  await options.observeIncomingAuthorization({
    chatId,
    chatType: message.chat.type,
    chatTitle,
    userId: actorId,
    username: actorName,
  });

  const authResult = await options.evaluateIncomingAuthorization({
    chatId,
    chatType: message.chat.type,
    chatTitle,
    userId: actorId,
    username: actorName,
  });
  if (authResult.decision !== "allow") {
    if (!isGroup) {
      await options.sendAuthorizationText({
        chatId,
        chatType: message.chat.type,
        messageThreadId,
        text: options.buildUnauthorizedBlockedText({
          chatId,
          chatType: message.chat.type,
          userId: actorId,
        }),
      });
    }
    return;
  }

  const enqueueGroupAudit = async (params: {
    reason: string;
    kind?: string;
  }): Promise<void> => {
    if (!isGroup) return;
    await options.enqueueAuditMessage({
      chatId,
      messageId,
      userId: actorId,
      text: buildTelegramAuditText({ rawText, hasIncomingAttachment, message }),
      meta: {
        chatType: message.chat.type,
        messageThreadId,
        username: from?.username,
        actorName,
        chatTitle,
        reason: params.reason,
        ...(params.kind ? { kind: params.kind } : {}),
        ...(fromIsBot ? { fromIsBot: true } : {}),
      },
    });
  };

  if (fromIsBot) {
    await enqueueGroupAudit({ reason: "bot_originated" });
    options.logger.debug("Ignored bot-originated message", {
      chatId,
      chatType: message.chat.type,
      messageId,
      fromId: from?.id,
      fromUsername: from?.username,
    });
    return;
  }

  await options.runInChat(chatKey, async () => {
    options.logger.debug("Telegram message received", {
      chatId,
      chatType: message.chat.type,
      isGroup,
      actorId,
      actorUsername: from?.username,
      actorName,
      messageId,
      messageThreadId,
      chatKey,
      hasIncomingAttachment,
      textPreview: rawText.length > 240 ? `${rawText.slice(0, 240)}…` : rawText,
      entityTypes: (entities || []).map((entity) => entity.type),
      botUsername,
      botId,
    });

    if (!rawText && !hasIncomingAttachment) {
      await enqueueGroupAudit({ reason: "empty_payload" });
      return;
    }

    await options.platform.sendInboundAckReaction({
      chatId,
      messageId: parseTelegramMessageId(messageId),
      emoji: options.inboundAckEmoji,
    });

    if (rawText.startsWith("/")) {
      await options.enqueueAuditMessage({
        chatId,
        messageId,
        userId: actorId,
        text: buildTelegramAuditText({ rawText, hasIncomingAttachment, message }),
        meta: {
          chatType: message.chat.type,
          chatTitle,
          messageThreadId,
          username: from?.username,
          kind: "command",
        },
      });

      await options.handleCommand({
        chatId,
        command: rawText,
        from,
        messageThreadId,
      });
      return;
    }

    const cleaned = isGroup
      ? stripTelegramBotMention(rawText, botUsername)
      : rawText;
    if (!cleaned && !hasIncomingAttachment) {
      await enqueueGroupAudit({ reason: "empty_after_clean" });
      return;
    }

    const { attachmentLines, incomingAttachments } = await collectIncomingAttachments({
      options,
      message,
      chatId,
      messageId,
      chatKey,
    });
    const replyContext = extractTelegramReplyContext(message);

    const instructions = buildReplyContextInstruction({
      text:
        buildChatInboundText(
          await augmentChatInboundInput({
            context: options.context,
            input: {
              channel: "telegram",
              chatId,
              chatType: message.chat.type,
              chatKey,
              messageId,
              rootPath: options.rootPath,
              attachmentText:
                attachmentLines.length > 0 ? attachmentLines.join("\n") : undefined,
              bodyText: cleaned ? cleaned.trim() : undefined,
              attachments: incomingAttachments.map((attachment) => ({
                channel: "telegram" as const,
                kind: attachment.type,
                path: attachment.path,
                desc: attachment.desc,
              })),
            },
          }),
        ) ||
        (attachmentLines.length > 0
          ? `${attachmentLines.join("\n")}\n\n请查看以上附件。`
          : ""),
      replyContext,
    });

    if (!instructions) return;

    await options.executeAndReply({
      chatId,
      instructions,
      from,
      chatTitle,
      messageId,
      chatType: message.chat.type,
      messageThreadId,
      extra: buildReplyContextExtra(replyContext),
    });
  });
}

/**
 * 是否有支持的入站附件。
 */
function hasTelegramIncomingAttachment(
  message: NonNullable<TelegramUpdate["message"]>,
): boolean {
  return (
    !!message.document ||
    (Array.isArray(message.photo) && message.photo.length > 0) ||
    !!message.voice ||
    !!message.audio ||
    !!message.video
  );
}

/**
 * 是否为 bot 发送者。
 */
function isTelegramBotSender(params: {
  from?: TelegramUser;
  botId?: number;
  botUsername?: string;
}): boolean {
  return (
    params.from?.is_bot === true ||
    (!!params.botId &&
      typeof params.from?.id === "number" &&
      params.from.id === params.botId) ||
    (!!params.botUsername &&
      typeof params.from?.username === "string" &&
      params.from.username.toLowerCase() === params.botUsername.toLowerCase())
  );
}

/**
 * 保存附件并转换为入站 `<file>` 标记。
 */
async function collectIncomingAttachments(params: {
  options: TelegramMessageHandlerOptions;
  message: TelegramUpdate["message"];
  chatId: string;
  messageId?: string;
  chatKey: string;
}): Promise<{
  attachmentLines: string[];
  incomingAttachments: Array<{
    type: "photo" | "document" | "voice" | "audio" | "video";
    path: string;
    desc?: string;
  }>;
}> {
  const attachmentLines: string[] = [];
  let incomingAttachments: Array<{
    type: "photo" | "document" | "voice" | "audio" | "video";
    path: string;
    desc?: string;
  }> = [];

  try {
    incomingAttachments = await saveTelegramIncomingAttachments({
      downloader: params.options.platform,
      message: params.message,
    });
    for (const attachment of incomingAttachments) {
      const rel = path.relative(params.options.rootPath, attachment.path);
      attachmentLines.push(
        renderChatMessageFileTag({
          type: attachment.type,
          path: rel,
          ...(attachment.desc ? { caption: attachment.desc } : {}),
        }),
      );
    }
  } catch (error) {
    params.options.logger.warn("Failed to save incoming Telegram attachment(s)", {
      error: String(error),
      chatId: params.chatId,
      messageId: params.messageId,
      chatKey: params.chatKey,
    });
  }

  return { attachmentLines, incomingAttachments };
}
