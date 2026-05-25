/**
 * Telegram 渠道门面。
 *
 * 关键点（中文）
 * - `TelegramBot` 只保留入站授权、命令分发、消息入队与回复编排。
 * - polling、runtime 状态、webhook 清理、自愈重试已下沉到 `TelegramPlatformClient`。
 * - chatKey / audit / mention 清理 / 附件保存已下沉到 `TelegramInbound`。
 */

import { BaseChatChannel } from "@/plugin/builtins/chat/channels/BaseChatChannel.js";
import type {
  ChannelChatKeyParams,
  ChannelSendActionParams,
  ChannelSendTextParams,
} from "@/plugin/builtins/chat/channels/BaseChatChannel.js";
import {
  handleTelegramCallbackQuery,
  handleTelegramCommand,
} from "./Handlers.js";
import {
  type TelegramConfig,
  type TelegramUpdate,
  type TelegramUser,
} from "./Shared.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { ChatChannelTestResult } from "@/plugin/builtins/chat/types/ChannelStatus.js";
import {
  buildTelegramChatKey,
  parseTelegramMessageId,
} from "./TelegramInbound.js";
import { TelegramPlatformClient } from "./TelegramPlatformClient.js";
import {
  drainTelegramPendingUpdatesToHistory,
  type TelegramPendingDrainReason,
} from "./TelegramPendingUpdates.js";
import { handleTelegramMessage } from "./TelegramMessageHandler.js";

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
    reason: TelegramPendingDrainReason;
  }): Promise<void> {
    await drainTelegramPendingUpdatesToHistory({
      reason: params.reason,
      platform: this.platform,
      logger: this.logger,
      enqueueAuditMessage: async (message) => {
        await this.enqueueAuditMessage(message);
      },
    });
  }

  /**
   * 处理普通消息。
   */
  private async handleMessage(
    message: TelegramUpdate["message"],
  ): Promise<void> {
    await handleTelegramMessage(
      {
        context: this.context,
        rootPath: this.rootPath,
        logger: this.logger,
        inboundAckEmoji: TelegramBot.INBOUND_ACK_EMOJI,
        platform: this.platform,
        observeIncomingAuthorization: async (params) => {
          await this.observeIncomingAuthorization(params);
        },
        evaluateIncomingAuthorization: async (params) =>
          await this.evaluateIncomingAuthorization(params),
        sendAuthorizationText: async (params) => {
          await this.sendAuthorizationText(params);
        },
        buildUnauthorizedBlockedText: (params) =>
          this.buildUnauthorizedBlockedText(params),
        enqueueAuditMessage: async (params) => {
          await this.enqueueAuditMessage(params);
        },
        runInChat: async (chatKey, fn) => {
          await this.runInChat(chatKey, fn);
        },
        handleCommand: async (params) => {
          await this.handleCommand(
            params.chatId,
            params.command,
            params.from,
            params.messageThreadId,
          );
        },
        executeAndReply: async (params) => {
          await this.executeAndReply(
            params.chatId,
            params.instructions,
            params.from,
            params.chatTitle,
            params.messageId,
            params.chatType,
            params.messageThreadId,
            params.extra,
          );
        },
      },
      message,
    );
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
