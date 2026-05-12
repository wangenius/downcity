/**
 * Telegram 渠道门面。
 *
 * 关键点（中文）
 * - `TelegramBot` 只保留入站授权、命令分发、消息入队与回复编排。
 * - polling、runtime 状态、webhook 清理、自愈重试已下沉到 `TelegramPlatformClient`。
 * - chatKey / audit / mention 清理 / 附件保存已下沉到 `TelegramInbound`。
 */

import path from "path";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import type {
  ChannelChatKeyParams,
  ChannelSendActionParams,
  ChannelSendTextParams,
} from "@services/chat/channels/BaseChatChannel.js";
import {
  handleTelegramCallbackQuery,
  handleTelegramCommand,
} from "./Handlers.js";
import {
  getActorName,
  getTelegramChatTitle,
  type TelegramConfig,
  type TelegramUpdate,
  type TelegramUser,
} from "./Shared.js";
import { extractTelegramReplyContext } from "./ReplyContext.js";
import {
  buildReplyContextExtra,
  buildReplyContextInstruction,
} from "@services/chat/runtime/ReplyContextFormatter.js";
import {
  augmentChatInboundInput,
  buildChatInboundText,
} from "@services/chat/runtime/InboundAugment.js";
import { renderChatMessageFileTag } from "@services/chat/runtime/ChatMessageMarkup.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import {
  buildTelegramAuditText,
  buildTelegramChatKey,
  isTelegramGroupChat,
  parseTelegramMessageId,
  saveTelegramIncomingAttachments,
  stripTelegramBotMention,
} from "./TelegramInbound.js";
import { TelegramPlatformClient } from "./TelegramPlatformClient.js";

/**
 * Telegram 平台适配器。
 */
export class TelegramBot extends BaseChatChannel {
  /**
   * 入站确认 reaction。
   */
  private static readonly INBOUND_ACK_EMOJI = "👀";

  private readonly botToken: string;
  private readonly platform: TelegramPlatformClient;

  constructor(context: AgentContext, botToken: string) {
    super({ channel: "telegram", context });
    this.botToken = botToken;
    this.platform = new TelegramPlatformClient({
      context,
      botToken,
      onMessage: async (message) => {
        await this.handleMessage(message);
      },
      onCallbackQuery: async (callbackQuery) => {
        await this.handleCallbackQuery(callbackQuery);
      },
      onWebhookConflictResolved: async () => {
        await this.drainPendingUpdatesToHistory({ reason: "webhook_conflict" });
      },
    });
  }

  protected getChatKey(params: ChannelChatKeyParams): string {
    return buildTelegramChatKey(params.chatId, params.messageThreadId);
  }

  protected async sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const replyToMessageId =
      params.replyToMessage === true
        ? parseTelegramMessageId(params.messageId)
        : undefined;
    await this.sendMessage(params.chatId, params.text, {
      messageThreadId: params.messageThreadId,
      ...(typeof replyToMessageId === "number" ? { replyToMessageId } : {}),
    });
  }

  /**
   * Telegram 支持 chat action（typing / react）。
   */
  protected async sendActionToPlatform(
    params: ChannelSendActionParams,
  ): Promise<void> {
    if (params.action === "typing") {
      await this.platform.sendChatAction(params.chatId, "typing", {
        messageThreadId: params.messageThreadId,
      });
      return;
    }
    if (params.action !== "react") return;

    const messageId = parseTelegramMessageId(params.messageId);
    if (!messageId) {
      throw new Error(
        "Telegram reaction requires a numeric messageId. Provide --message-id or ensure chat meta has latest messageId.",
      );
    }
    await this.platform.setMessageReaction(params.chatId, messageId, {
      emoji: params.reactionEmoji,
      isBig: params.reactionIsBig === true,
    });
  }

  /**
   * 兼容旧的 per-chat locking 入口。
   */
  private runInChat(_chatKey: string, fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  /**
   * 读取 runtime 快照。
   */
  getExecutorStatus(): {
    running: boolean;
    linkState: "connected" | "disconnected" | "unknown";
    statusText: string;
    detail: Record<string, string | number | boolean | null>;
  } {
    return this.platform.getExecutorStatus();
  }

  /**
   * 连接性测试。
   */
  async testConnection(): Promise<ChatChannelTestResult> {
    return await this.platform.testConnection();
  }

  /**
   * 启动 Telegram polling。
   */
  async start(): Promise<void> {
    if (!this.botToken) {
      this.logger.warn("Telegram Bot Token not configured, skipping startup");
      return;
    }

    this.logger.info("🤖 Starting Telegram Bot...");
    try {
      await this.platform.preparePolling();
      await this.drainPendingUpdatesToHistory({ reason: "startup" });
      this.platform.startPollingLoop();
    } catch (error) {
      this.logger.error("Failed to start Telegram Bot", {
        error: String(error),
      });
      await this.platform.stop();
    }
  }

  /**
   * 把离线期间积压 updates 只入队，不执行/不回复。
   */
  private async drainPendingUpdatesToHistory(params: {
    reason: "startup" | "webhook_conflict";
  }): Promise<void> {
    const drained = await this.platform.drainPendingUpdates({
      reason: params.reason,
      handleUpdate: async (update) => {
        if (update.message?.chat?.id) {
          const message = update.message;
          const chatId = message.chat.id.toString();
          const messageThreadId =
            typeof message.message_thread_id === "number"
              ? message.message_thread_id
              : undefined;
          const chatKey = buildTelegramChatKey(chatId, messageThreadId);
          const from = message.from;
          const chatTitle = getTelegramChatTitle(message.chat);
          const botId = this.platform.getBotId();
          const botUsername = this.platform.getBotUsername();
          const fromIsBot =
            from?.is_bot === true ||
            (!!botId && typeof from?.id === "number" && from.id === botId) ||
            (!!botUsername &&
              typeof from?.username === "string" &&
              from.username.toLowerCase() === botUsername.toLowerCase());
          const isGroup = isTelegramGroupChat(message.chat.type);
          if (fromIsBot && !isGroup) return;

          const rawText =
            typeof message.text === "string"
              ? message.text
              : typeof message.caption === "string"
                ? message.caption
                : "";
          const hasIncomingAttachment =
            !!message.document ||
            (Array.isArray(message.photo) && message.photo.length > 0) ||
            !!message.voice ||
            !!message.audio ||
            !!message.video;

          const messageId =
            typeof message.message_id === "number"
              ? String(message.message_id)
              : undefined;
          const actorId = from?.id ? String(from.id) : undefined;

          await this.enqueueAuditMessage({
            chatId,
            messageId,
            userId: actorId,
            text: buildTelegramAuditText({ rawText, hasIncomingAttachment, message }),
            meta: {
              kind: "pending",
              pendingReason: params.reason,
              updateId: update.update_id,
              chatType: message.chat.type,
              chatTitle,
              messageThreadId,
              username: from?.username,
              fromIsBot,
              chatKey,
            },
          });
          return;
        }

        if (update.callback_query?.from?.id) {
          const query = update.callback_query;
          const chatId = query.message?.chat?.id?.toString?.() || "";
          if (!chatId) return;
          const messageThreadId =
            typeof query.message?.message_thread_id === "number"
              ? query.message.message_thread_id
              : undefined;
          await this.enqueueAuditMessage({
            chatId,
            messageId: undefined,
            userId: query.from?.id ? String(query.from.id) : undefined,
            text: `[callback_query] ${String(query.data || "").slice(0, 1000)}`.trim(),
            meta: {
              kind: "pending",
              pendingReason: params.reason,
              updateId: update.update_id,
              messageThreadId,
              username: query.from?.username,
            },
          });
        }
      },
    });

    if (drained > 0) {
      this.logger.info(`Drained ${drained} pending Telegram updates to queue`, {
        reason: params.reason,
      });
    }
  }

  /**
   * 处理普通消息。
   */
  private async handleMessage(
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
    const hasIncomingAttachment =
      !!message.document ||
      (Array.isArray(message.photo) && message.photo.length > 0) ||
      !!message.voice ||
      !!message.audio ||
      !!message.video;
    const messageId =
      typeof message.message_id === "number" ? String(message.message_id) : undefined;
    const messageThreadId =
      typeof message.message_thread_id === "number"
        ? message.message_thread_id
        : undefined;
    const from = message.from;
    const botId = this.platform.getBotId();
    const botUsername = this.platform.getBotUsername();
    const fromIsBot =
      from?.is_bot === true ||
      (!!botId && typeof from?.id === "number" && from.id === botId) ||
      (!!botUsername &&
        typeof from?.username === "string" &&
        from.username.toLowerCase() === botUsername.toLowerCase());
    const actorId = from?.id ? String(from.id) : undefined;
    const actorName = getActorName(from);
    const chatTitle = getTelegramChatTitle(message.chat);
    const isGroup = isTelegramGroupChat(message.chat.type);
    const chatKey = buildTelegramChatKey(chatId, messageThreadId);

    if (!actorId) {
      this.logger.warn("Telegram 消息缺少发送者 userId，已忽略", {
        chatId,
        chatType: message.chat.type,
        messageId,
        messageThreadId,
        hasFrom: !!from,
      });
      return;
    }

    await this.observeIncomingAuthorization({
      chatId,
      chatType: message.chat.type,
      chatTitle,
      userId: actorId,
      username: actorName,
    });

    const authResult = await this.evaluateIncomingAuthorization({
      chatId,
      chatType: message.chat.type,
      chatTitle,
      userId: actorId,
      username: actorName,
    });
    if (authResult.decision !== "allow") {
      if (!isGroup) {
        await this.sendAuthorizationText({
          chatId,
          chatType: message.chat.type,
          messageThreadId,
          text: this.buildUnauthorizedBlockedText(),
        });
      }
      return;
    }

    const enqueueGroupAudit = async (params: {
      reason: string;
      kind?: string;
    }): Promise<void> => {
      if (!isGroup) return;
      await this.enqueueAuditMessage({
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
      this.logger.debug("Ignored bot-originated message", {
        chatId,
        chatType: message.chat.type,
        messageId,
        fromId: from?.id,
        fromUsername: from?.username,
      });
      return;
    }

    await this.runInChat(chatKey, async () => {
      this.logger.debug("Telegram message received", {
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

      await this.platform.sendInboundAckReaction({
        chatId,
        messageId: parseTelegramMessageId(messageId),
        emoji: TelegramBot.INBOUND_ACK_EMOJI,
      });

      if (rawText.startsWith("/")) {
        await this.enqueueAuditMessage({
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

        await this.handleCommand(chatId, rawText, from, messageThreadId);
        return;
      }

      const cleaned = isGroup
        ? stripTelegramBotMention(rawText, botUsername)
        : rawText;
      if (!cleaned && !hasIncomingAttachment) {
        await enqueueGroupAudit({ reason: "empty_after_clean" });
        return;
      }

      const attachmentLines: string[] = [];
      let incomingAttachments: Array<{
        type: "photo" | "document" | "voice" | "audio" | "video";
        path: string;
        desc?: string;
      }> = [];
      try {
        incomingAttachments = await saveTelegramIncomingAttachments({
          downloader: this.platform,
          message,
        });
        for (const attachment of incomingAttachments) {
          const rel = path.relative(this.rootPath, attachment.path);
          attachmentLines.push(
            renderChatMessageFileTag({
              type: attachment.type,
              path: rel,
              ...(attachment.desc ? { caption: attachment.desc } : {}),
            }),
          );
        }
      } catch (error) {
        this.logger.warn("Failed to save incoming Telegram attachment(s)", {
          error: String(error),
          chatId,
          messageId,
          chatKey,
        });
      }
      const replyContext = extractTelegramReplyContext(message);

      const instructions = buildReplyContextInstruction({
        text:
          buildChatInboundText(
            await augmentChatInboundInput({
              context: this.context,
              input: {
                channel: "telegram",
                chatId,
                chatType: message.chat.type,
                chatKey,
                messageId,
                rootPath: this.rootPath,
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

      await this.executeAndReply(
        chatId,
        instructions,
        from,
        chatTitle,
        messageId,
        message.chat.type,
        messageThreadId,
        buildReplyContextExtra(replyContext),
      );
    });
  }

  /**
   * 命令分发。
   */
  private async handleCommand(
    chatId: string,
    command: string,
    from?: TelegramUser,
    messageThreadId?: number,
  ): Promise<void> {
    await handleTelegramCommand(
      {
        logger: this.logger,
        sendMessage: (chatIdInput, text, opts) =>
          this.sendMessage(chatIdInput, text, opts),
        clearChat: async (chatIdInput, threadIdInput) => {
          await this.clearChatByTarget({
            chatId: chatIdInput,
            ...(typeof threadIdInput === "number"
              ? { messageThreadId: threadIdInput }
              : {}),
          });
        },
      },
      { chatId, command, from, messageThreadId },
    );
  }

  /**
   * callback_query 分发。
   */
  private async handleCallbackQuery(
    callbackQuery: TelegramUpdate["callback_query"],
  ): Promise<void> {
    await handleTelegramCallbackQuery(
      {
        logger: this.logger,
        sendMessage: (chatIdInput, text, opts) =>
          this.sendMessage(chatIdInput, text, opts),
        clearChat: async (chatIdInput, threadIdInput) => {
          await this.clearChatByTarget({
            chatId: chatIdInput,
            ...(typeof threadIdInput === "number"
              ? { messageThreadId: threadIdInput }
              : {}),
          });
        },
      },
      callbackQuery,
    );
  }

  /**
   * 执行并回复。
   */
  private async executeAndReply(
    chatId: string,
    instructions: string,
    from?: TelegramUser,
    chatTitle?: string,
    messageId?: string,
    chatType?: NonNullable<TelegramUpdate["message"]>["chat"]["type"],
    messageThreadId?: number,
    extra?: JsonObject,
  ): Promise<void> {
    try {
      const userId = from?.id ? String(from.id) : undefined;
      const username = from?.username ? String(from.username) : undefined;
      await this.enqueueMessage({
        chatId,
        text: instructions,
        chatType,
        messageId,
        messageThreadId,
        userId,
        username,
        chatTitle,
        ...(extra ? { extra } : {}),
      });
    } catch (error) {
      await this.sendMessage(chatId, `❌ Execution error: ${String(error)}`, {
        messageThreadId,
      });
    }
  }

  /**
   * 发送普通消息。
   */
  async sendMessage(
    chatId: string,
    text: string,
    opts?: { messageThreadId?: number; replyToMessageId?: number },
  ): Promise<void> {
    await this.platform.sendMessage(chatId, text, opts);
  }

  /**
   * 发送 inline keyboard。
   */
  async sendMessageWithInlineKeyboard(
    chatId: string,
    text: string,
    buttons: Array<{ text: string; callback_data: string }>,
    opts?: { messageThreadId?: number },
  ): Promise<void> {
    await this.platform.sendMessageWithInlineKeyboard(chatId, text, buttons, opts);
  }

  /**
   * 停止 Telegram bot。
   */
  async stop(): Promise<void> {
    await this.platform.stop();
  }
}

/**
 * 创建 Telegram bot。
 */
export function createTelegramBot(
  config: TelegramConfig,
  context: AgentContext,
): TelegramBot | null {
  if (!config.enabled || !config.botToken || config.botToken === "${}") {
    return null;
  }
  return new TelegramBot(context, config.botToken);
}
