// Telegram adapter implementation (moved into submodule for maintainability).
import path from "path";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import type {
  ChannelChatKeyParams,
  ChannelSendTextParams,
  ChannelSendActionParams,
} from "@services/chat/channels/BaseChatChannel.js";
import { isTelegramAdmin } from "./Access.js";
import { TelegramApiClient } from "./ApiClient.js";
import {
  handleTelegramCallbackQuery,
  handleTelegramCommand,
} from "./Handlers.js";
import {
  getActorName,
  type TelegramAttachmentType,
  type TelegramConfig,
  type TelegramUpdate,
  type TelegramUser,
} from "./Shared.js";
import { buildTelegramVoiceTranscriptionInstruction } from "./VoiceInput.js";
import { TelegramStateStore } from "./StateStore.js";
import { appendOutboundChatHistory } from "@services/chat/runtime/ChatHistoryStore.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";

/**
 * Telegram 平台适配器。
 *
 * 关键职责（中文）
 * - 轮询拉取 updates，并转换为统一会话输入
 * - 维护 follow-up 窗口与群聊访问策略，提升群内连续对话体验
 * - 统一走 BaseChatChannel 入队（history 由 process 写入），确保调度语义一致
 */
export class TelegramBot extends BaseChatChannel {
  private botToken: string;
  private followupWindowMs: number;
  private groupAccess: "initiator_or_admin" | "anyone";
  private lastUpdateId: number = 0;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private pollInFlight: boolean = false;
  private lastDrainAttemptAt: number = 0;
  private consecutivePollErrors: number = 0;
  private nextPollAllowedAt: number = 0;

  private readonly api: TelegramApiClient;
  private readonly stateStore: TelegramStateStore;
  private threadInitiators: Map<string, string> = new Map();

  private botUsername?: string;
  private botId?: number;
  private clearedWebhookOnce: boolean = false;
  private followupExpiryByActorAndThread: Map<string, number> = new Map();
  private followupExpiryByThread: Map<string, number> = new Map();

  constructor(
    context: ServiceRuntime,
    botToken: string,
    followupWindowMs: number | undefined,
    groupAccess: TelegramConfig["groupAccess"] | undefined,
  ) {
    super({ channel: "telegram", context });
    this.botToken = botToken;
    this.followupWindowMs =
      Number.isFinite(followupWindowMs as number) &&
      (followupWindowMs as number) > 0
        ? (followupWindowMs as number)
        : 10 * 60 * 1000;
    this.groupAccess =
      groupAccess === "initiator_or_admin" ? "initiator_or_admin" : "anyone";
    this.api = new TelegramApiClient({
      botToken,
      projectRoot: this.rootPath,
      logger: this.logger,
    });
    this.stateStore = new TelegramStateStore(this.rootPath);
  }

  /**
   * 轮询错误是否属于“超时”。
   *
   * 说明（中文）
   * - getUpdates 长轮询超时是正常行为，不应计入失败重试。
   */
  private isPollingTimeoutError(message: string): boolean {
    return /timeout/i.test(String(message || ""));
  }

  /**
   * 粗粒度识别网络波动类错误。
   *
   * 说明（中文）
   * - 仅用于日志分级（warn/error），不影响功能语义。
   */
  private isLikelyNetworkError(message: string): boolean {
    return /fetch failed|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|TLS/i.test(
      String(message || ""),
    );
  }

  /**
   * 计算轮询失败后的退避时间。
   *
   * 说明（中文）
   * - 指数退避：1s -> 2s -> 4s ...，上限 30s
   * - 降低网络抖动时的日志噪声与无效请求洪峰
   */
  private computePollBackoffMs(failureCount: number): number {
    const safeFailureCount = Number.isFinite(failureCount) ? failureCount : 1;
    const exponent = Math.max(0, safeFailureCount - 1);
    return Math.min(30_000, 1_000 * Math.pow(2, exponent));
  }

  private async drainPendingUpdatesToHistory(params: {
    reason: "startup" | "webhook_conflict";
  }): Promise<void> {
    const now = Date.now();
    // 避免高频 drain（尤其是 webhook 冲突 / 网络抖动时）
    if (now - this.lastDrainAttemptAt < 30_000) return;
    this.lastDrainAttemptAt = now;

    let drained = 0;
    try {
      // 关键点（中文）
      // - Telegram 会把离线期间的消息缓存为 pending updates。
      // - 我们会把这些消息“只入队，不执行/不回复”，然后推进 offset，避免重启后补回复旧消息。
      for (let i = 0; i < 50; i++) {
        const updates = await this.api.requestJson<TelegramUpdate[]>(
          "getUpdates",
          {
            offset: this.lastUpdateId + 1,
            limit: 100,
            timeout: 0,
          },
        );
        if (!Array.isArray(updates) || updates.length === 0) break;

        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);

          // 仅把 pending 入队，不触发执行
          if (update.message?.chat?.id) {
            const message = update.message;
            const chatId = message.chat.id.toString();
            const messageThreadId =
              typeof message.message_thread_id === "number"
                ? message.message_thread_id
                : undefined;
            const chatKey = this.buildChatKey(chatId, messageThreadId);
            const from = message.from;
            const fromIsBot =
              from?.is_bot === true ||
              (!!this.botId &&
                typeof from?.id === "number" &&
                from.id === this.botId) ||
              (!!this.botUsername &&
                typeof from?.username === "string" &&
                from.username.toLowerCase() === this.botUsername.toLowerCase());
            const isGroup = this.isGroupChat(message.chat.type);
            if (fromIsBot && !isGroup) continue;

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
              chatKey,
              messageId,
              userId: actorId,
              text: this.buildAuditText({ rawText, hasIncomingAttachment, message }),
              meta: {
                kind: "pending",
                pendingReason: params.reason,
                updateId: update.update_id,
                chatType: message.chat.type,
                messageThreadId,
                username: from?.username,
                fromIsBot,
              },
            });
          } else if (update.callback_query?.from?.id) {
            const q = update.callback_query;
            const chatId = q.message?.chat?.id?.toString?.() || "";
            if (!chatId) continue;
            const messageThreadId =
              typeof q.message?.message_thread_id === "number"
                ? q.message.message_thread_id
                : undefined;
            const chatKey = this.buildChatKey(chatId, messageThreadId);
            await this.enqueueAuditMessage({
              chatId,
              chatKey,
              messageId: undefined,
              userId: q.from?.id ? String(q.from.id) : undefined,
              text: `[callback_query] ${String(q.data || "").slice(0, 1000)}`.trim(),
              meta: {
                kind: "pending",
                pendingReason: params.reason,
                updateId: update.update_id,
                messageThreadId,
                username: q.from?.username,
              },
            });
          }
        }

        drained += updates.length;
      }

      await this.stateStore.saveLastUpdateId(this.lastUpdateId);
      if (drained > 0) {
        this.logger.info(`Drained ${drained} pending Telegram updates to queue`, {
          reason: params.reason,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to drain pending Telegram updates to queue", {
        error: String(error),
        reason: params.reason,
      });
    }
  }

  /**
   * 构建 lane 维度 chatKey。
   *
   * 说明（中文）
   * - supergroup topic 以 messageThreadId 细分 lane
   * - 普通私聊/群聊共享 chatId 级别 lane
   */
  private buildChatKey(chatId: string, messageThreadId?: number): string {
    if (
      typeof messageThreadId === "number" &&
      Number.isFinite(messageThreadId) &&
      messageThreadId > 0
    ) {
      return `telegram-chat-${chatId}-topic-${messageThreadId}`;
    }
    return `telegram-chat-${chatId}`;
  }

  protected getChatKey(params: ChannelChatKeyParams): string {
    return this.buildChatKey(params.chatId, params.messageThreadId);
  }

  protected async sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const replyToMessageId =
      params.replyToMessage === true
        ? this.parseTelegramMessageId(params.messageId)
        : undefined;
    await this.sendMessage(params.chatId, params.text, {
      messageThreadId: params.messageThreadId,
      ...(typeof replyToMessageId === "number"
        ? { replyToMessageId }
        : {}),
    });
  }

  /**
   * Telegram 支持 chat action（typing 等），用于在执行期间展示“正在处理”状态。
   */
  protected async sendActionToPlatform(
    params: ChannelSendActionParams,
  ): Promise<void> {
    if (params.action === "typing") {
      await this.api.sendChatAction(params.chatId, "typing", {
        messageThreadId: params.messageThreadId,
      });
      return;
    }
    if (params.action !== "react") return;

    const messageId = this.parseTelegramMessageId(params.messageId);
    if (!messageId) {
      throw new Error(
        "Telegram reaction requires a numeric messageId. Provide --message-id or ensure chat meta has latest messageId.",
      );
    }
    await this.api.setMessageReaction(params.chatId, messageId, {
      emoji: params.reactionEmoji,
      isBig: params.reactionIsBig === true,
    });
  }

  /**
   * 解析 Telegram 消息 ID。
   *
   * 关键点（中文）
   * - Telegram `message_id` 为正整数；无效值返回 undefined。
   */
  private parseTelegramMessageId(messageId?: string): number | undefined {
    const raw = String(messageId || "").trim();
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }

  /**
   * Compatibility hook for older per-chat locking flows.
   *
   * 说明：
   * - 当前采用“按 chatKey 分 lane”的调度器：同一 chatKey 串行、不同 chatKey 可并发。
   * - 因此这里不再需要额外的 per-chat 锁。
   */
  private runInChat(_chatKey: string, fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  private getFollowupKey(threadKey: string, actorId: string): string {
    return `${threadKey}|${actorId}`;
  }

  private isWithinFollowupWindow(threadKey: string, actorId?: string): boolean {
    const now = Date.now();

    // 会话级窗口：同一群/话题内更容易续聊，不要求同一 actor。
    const threadExp = this.followupExpiryByThread.get(threadKey);
    if (typeof threadExp === "number") {
      if (now <= threadExp) return true;
      this.followupExpiryByThread.delete(threadKey);
    }

    if (!actorId) return false;
    const key = this.getFollowupKey(threadKey, actorId);
    const actorExp = this.followupExpiryByActorAndThread.get(key);
    if (!actorExp) return false;
    if (now > actorExp) {
      this.followupExpiryByActorAndThread.delete(key);
      return false;
    }
    return true;
  }

  private touchFollowupWindow(threadKey: string, actorId?: string): void {
    const expiry = Date.now() + this.followupWindowMs;
    this.followupExpiryByThread.set(threadKey, expiry);

    if (!actorId) return;
    const key = this.getFollowupKey(threadKey, actorId);
    this.followupExpiryByActorAndThread.set(key, expiry);
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private isGroupChat(chatType?: string): boolean {
    return chatType === "group" || chatType === "supergroup";
  }

  /**
   * 将“所有入站消息”统一转成可落盘的文本形式（用于审计/回溯）。
   *
   * 关键点（中文）
   * - 即使消息最终不执行（例如：空消息或无权限），也应当先入队落盘
   * - 但纯附件消息可能没有 text/caption，这里会生成一个稳定的占位文本
   */
  private buildAuditText(params: {
    rawText: string;
    hasIncomingAttachment: boolean;
    message: TelegramUpdate["message"];
  }): string {
    const rawText = String(params.rawText ?? "");
    if (rawText.trim()) return rawText;
    if (!params.hasIncomingAttachment) return "[message] (no_text_or_supported_attachment)";

    const types: string[] = [];
    const message = params.message;
    if (message?.document) types.push("document");
    if (Array.isArray(message?.photo) && message.photo.length > 0) types.push("photo");
    if (message?.voice) types.push("voice");
    if (message?.audio) types.push("audio");
    if (message?.video) types.push("video");

    const uniq = Array.from(new Set(types)).filter(Boolean);
    const suffix = uniq.length > 0 ? ` (${uniq.join(", ")})` : "";
    return `[attachment]${suffix}`;
  }

  private isBotMentioned(
    text: string,
    entities?: NonNullable<TelegramUpdate["message"]>["entities"],
  ): boolean {
    if (!text) return false;
    const username = this.botUsername;

    if (username) {
      const re = new RegExp(`@${this.escapeRegExp(username)}\\b`, "i");
      if (re.test(text)) return true;
    }

    if (!entities || entities.length === 0) return false;

    for (const ent of entities) {
      if (!ent || typeof ent !== "object") continue;
      if (
        ent.type === "text_mention" &&
        this.botId &&
        ent.user?.id === this.botId
      )
        return true;
      if (ent.type === "mention" && username) {
        const mentionText = text.slice(ent.offset, ent.offset + ent.length);
        if (mentionText.toLowerCase() === `@${username.toLowerCase()}`)
          return true;
      }
    }

    return false;
  }

  private stripBotMention(text: string): string {
    if (!text) return text;
    if (!this.botUsername) return text.trim();
    const re = new RegExp(
      `\\s*@${this.escapeRegExp(this.botUsername)}\\b`,
      "ig",
    );
    return text.replace(re, " ").replace(/\s+/g, " ").trim();
  }

  private async isAllowedGroupActor(
    threadId: string,
    originChatId: string,
    actorId: string,
  ): Promise<boolean> {
    if (this.groupAccess === "anyone") return true;
    const existing = this.threadInitiators.get(threadId);
    if (!existing) {
      this.threadInitiators.set(threadId, actorId);
      await this.stateStore.saveThreadInitiators(this.threadInitiators);
      return true;
    }
    if (existing === actorId) return true;
    return isTelegramAdmin(
      (method, data) => this.api.requestJson(method, data),
      this.logger,
      originChatId,
      actorId,
    );
  }

  async start(): Promise<void> {
    if (!this.botToken) {
      this.logger.warn("Telegram Bot Token not configured, skipping startup");
      return;
    }

    this.isRunning = true;
    this.logger.info("🤖 Starting Telegram Bot...");
    const lastUpdateId = await this.stateStore.loadLastUpdateId();
    if (typeof lastUpdateId === "number" && lastUpdateId > 0) {
      this.lastUpdateId = lastUpdateId;
    }
    this.threadInitiators = await this.stateStore.loadThreadInitiators();

    // Ensure polling works even if a webhook was previously configured.
    // Telegram disallows getUpdates while a webhook is active.
    try {
      await this.api.requestJson<boolean>("deleteWebhook", {
        drop_pending_updates: false,
      });
      this.clearedWebhookOnce = true;
      this.logger.info("Telegram webhook cleared (polling mode)");
    } catch (error) {
      this.logger.warn("Failed to clear Telegram webhook (continuing)", {
        error: String(error),
      });
    }

    // Get bot info
    try {
      const me = await this.api.requestJson<{ id?: number; username?: string }>(
        "getMe",
        {},
      );
      this.botUsername = me.username || undefined;
      this.botId = typeof me.id === "number" ? me.id : undefined;
      this.logger.info(`Bot username: @${me.username || "unknown"}`);
    } catch (error) {
      this.logger.error("Failed to get Bot info", { error: String(error) });
      return;
    }

    // 关键点（中文）：把离线期间积压的 updates 入队，但不执行/不回复
    await this.drainPendingUpdatesToHistory({ reason: "startup" });

    // Start polling
    this.consecutivePollErrors = 0;
    this.nextPollAllowedAt = 0;
    this.pollingInterval = setInterval(() => this.pollUpdates(), 1000);
    this.logger.info("Telegram Bot started");

    // tool_strict: do not auto-push run completion messages; agent should use `chat_send`.
  }

  /**
   * 长轮询入口。
   *
   * 说明（中文）
   * - 使用 pollInFlight 防重入，避免并发轮询造成 offset 竞争
   * - 先推进 lastUpdateId 再逐条处理，保证 at-least-once + 幂等容错
   */
  private async pollUpdates(): Promise<void> {
    if (!this.isRunning) return;
    if (this.pollInFlight) return;
    if (Date.now() < this.nextPollAllowedAt) return;
    this.pollInFlight = true;

    try {
      const updates = await this.api.requestJson<TelegramUpdate[]>("getUpdates", {
        offset: this.lastUpdateId + 1,
        limit: 10,
        timeout: 30,
      });

      if (this.consecutivePollErrors > 0) {
        this.logger.info(
          `Telegram polling recovered after ${this.consecutivePollErrors} failed attempt(s)`,
        );
      }
      this.consecutivePollErrors = 0;
      this.nextPollAllowedAt = 0;

      // 更新 lastUpdateId
      for (const update of updates) {
        this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
      }
      await this.stateStore.saveLastUpdateId(this.lastUpdateId);

      for (const update of updates) {
        try {
          if (update.message) {
            await this.handleMessage(update.message);
          } else if (update.callback_query) {
            await this.handleCallbackQuery(update.callback_query);
          }
        } catch (error) {
          this.logger.error(
            `Failed to process message (update_id: ${update.update_id})`,
            { error: String(error) },
          );
        }
      }
    } catch (error) {
      // Polling timeout is normal
      const msg = (error as Error)?.message || String(error);
      if (!this.isPollingTimeoutError(msg)) {
        // Self-heal common setup issue: webhook enabled while using getUpdates polling.
        const looksLikeWebhookConflict =
          /webhook/i.test(msg) ||
          /Conflict/i.test(msg) ||
          /getUpdates/i.test(msg);
        if (!this.clearedWebhookOnce && looksLikeWebhookConflict) {
          try {
            await this.api.requestJson<boolean>("deleteWebhook", {
              drop_pending_updates: false,
            });
            this.clearedWebhookOnce = true;
            this.logger.warn(
              "Telegram polling conflict detected; cleared webhook and will retry",
              { error: msg },
            );
            await this.drainPendingUpdatesToHistory({ reason: "webhook_conflict" });
            this.consecutivePollErrors = 0;
            this.nextPollAllowedAt = 0;
            return;
          } catch (e) {
            this.logger.error(
              "Telegram polling conflict detected; failed to clear webhook",
              { error: msg, clearError: String(e) },
            );
          }
        }

        this.consecutivePollErrors += 1;
        const backoffMs = this.computePollBackoffMs(this.consecutivePollErrors);
        this.nextPollAllowedAt = Date.now() + backoffMs;
        const retryInSeconds = Math.ceil(backoffMs / 1000);

        if (this.isLikelyNetworkError(msg)) {
          this.logger.warn(
            `Telegram polling network error, retrying in ${retryInSeconds}s: ${msg}`,
          );
        } else {
          this.logger.error(
            `Telegram polling error, retrying in ${retryInSeconds}s: ${msg}`,
          );
        }
      }
    } finally {
      this.pollInFlight = false;
    }
  }

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
      typeof message.message_id === "number"
        ? String(message.message_id)
        : undefined;
    const messageThreadId =
      typeof message.message_thread_id === "number"
        ? message.message_thread_id
        : undefined;
    const from = message.from;
    const fromIsBot =
      from?.is_bot === true ||
      (!!this.botId &&
        typeof from?.id === "number" &&
        from.id === this.botId) ||
      (!!this.botUsername &&
        typeof from?.username === "string" &&
        from.username.toLowerCase() === this.botUsername.toLowerCase());
    const actorId = from?.id ? String(from.id) : undefined;
    const actorName = getActorName(from);
    const isGroup = this.isGroupChat(message.chat.type);
    const chatKey = this.buildChatKey(chatId, messageThreadId);

    const enqueueGroupAudit = async (params: {
      reason: string;
      kind?: string;
    }): Promise<void> => {
      if (!isGroup) return;
      await this.enqueueAuditMessage({
        chatId,
        chatKey,
        messageId,
        userId: actorId,
        text: this.buildAuditText({ rawText, hasIncomingAttachment, message }),
        meta: {
          chatType: message.chat.type,
          messageThreadId,
          username: from?.username,
          actorName,
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
    const replyToFrom = message.reply_to_message?.from;
    const isReplyToBot =
      (!!this.botId && replyToFrom?.id === this.botId) ||
      (!!this.botUsername &&
        typeof replyToFrom?.username === "string" &&
        replyToFrom.username.toLowerCase() === this.botUsername.toLowerCase());

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
        isReplyToBot,
        hasIncomingAttachment,
        textPreview:
          rawText.length > 240 ? `${rawText.slice(0, 240)}…` : rawText,
        entityTypes: (entities || []).map((e) => e.type),
        botUsername: this.botUsername,
        botId: this.botId,
      });

      // If neither text/caption nor attachments exist, ignore.
      if (!rawText && !hasIncomingAttachment) {
        await enqueueGroupAudit({ reason: "empty_payload" });
        return;
      }

      // Check if it's a command
      if (rawText.startsWith("/")) {
        // 关键点（中文）：命令消息也要入队（否则历史会“断层”）。
        await this.enqueueAuditMessage({
          chatId,
          chatKey,
          messageId,
          userId: actorId,
          text: this.buildAuditText({ rawText, hasIncomingAttachment, message }),
          meta: {
            chatType: message.chat.type,
            messageThreadId,
            username: from?.username,
            kind: "command",
          },
        });

        if (isGroup && actorId) {
          const cmdName = (rawText.trim().split(/\s+/)[0] || "")
            .split("@")[0]
            ?.toLowerCase();
          const allowAny = cmdName === "/help" || cmdName === "/start";
          if (!allowAny) {
            const ok = await this.isAllowedGroupActor(chatKey, chatId, actorId);
            if (!ok) {
              await this.sendMessage(
                chatId,
                "⛔️ 仅发起人或群管理员可以使用该命令。",
                { messageThreadId },
              );
              return;
            }
          }
        }
        if (isGroup) this.touchFollowupWindow(chatKey, actorId);
        await this.handleCommand(chatId, rawText, from, messageThreadId);
      } else {
        // 关键点（中文）：群聊“是否触发 bot” 与 “是否入队” 解耦。
        // - 触发 bot：群聊非空内容默认可触发（权限门禁仍生效）
        // - 入队：所有入站消息都应落盘（审计/回溯）
        const isMentioned = isGroup ? this.isBotMentioned(rawText, entities) : false;
        const inWindow = isGroup ? this.isWithinFollowupWindow(chatKey, actorId) : false;
        const explicit = isGroup ? (isMentioned || isReplyToBot) : true;
        const isAddressed = isGroup ? (explicit || inWindow) : true;

        if (isGroup) {
          if (!actorId) {
            await enqueueGroupAudit({ reason: "missing_actor" });
            return;
          }

          const ok = await this.isAllowedGroupActor(chatKey, chatId, actorId);
          if (!ok) {
            await enqueueGroupAudit({ reason: "permission_denied" });
            // 关键点（中文）：未显式点名 bot 时静默拒绝，避免群里刷屏。
            if (isAddressed) {
              await this.sendMessage(
                chatId,
                "⛔️ 仅发起人或群管理员可以与我对话。",
                { messageThreadId },
              );
            }
            return;
          }
        }

        const cleaned = isGroup ? this.stripBotMention(rawText) : rawText;
        if (!cleaned && !hasIncomingAttachment) {
          // 关键点（中文）：显式 @bot / 回复bot 的“空消息”也可激活 follow-up 窗口，
          // 便于用户先点名机器人，再发送下一条具体内容。
          if (isGroup && actorId && explicit) {
            this.touchFollowupWindow(chatKey, actorId);
          }
          await enqueueGroupAudit({ reason: "empty_after_clean" });
          return;
        }

        if (isGroup && actorId) {
          // 处理到这里说明已有有效内容（文本或附件），可以续期开窗。
          this.touchFollowupWindow(chatKey, actorId);
        }

        const attachmentLines: string[] = [];
        let incomingAttachments: Array<{
          type: TelegramAttachmentType;
          path: string;
          desc?: string;
        }> = [];
        try {
          incomingAttachments = await this.saveIncomingAttachments(message);
          for (const att of incomingAttachments) {
            const rel = path.relative(this.rootPath, att.path);
            const desc = att.desc ? ` | ${att.desc}` : "";
            attachmentLines.push(`@attach ${att.type} ${rel}${desc}`);
          }
        } catch (e) {
          this.logger.warn("Failed to save incoming Telegram attachment(s)", {
            error: String(e),
            chatId,
            messageId,
            chatKey,
          });
        }

        const instructions =
          [
            attachmentLines.length > 0 ? attachmentLines.join("\n") : undefined,
            await buildTelegramVoiceTranscriptionInstruction({
              context: this.context,
              logger: this.logger,
              rootPath: this.rootPath,
              chatId,
              messageId,
              chatKey,
              attachments: incomingAttachments,
            }),
            cleaned ? cleaned.trim() : undefined,
          ]
            .filter(Boolean)
            .join("\n\n")
            .trim() ||
          (attachmentLines.length > 0
            ? `${attachmentLines.join("\n")}\n\n请查看以上附件。`
            : "");

        if (!instructions) return;

        // Regular message, execute instruction
        await this.executeAndReply(
          chatId,
          instructions,
          from,
          messageId,
          message.chat.type,
          messageThreadId,
        );
      }
    });
  }

  private pickBestPhotoFileId(
    photo?: Array<{ file_id?: string; file_size?: number }>,
  ): string | undefined {
    if (!Array.isArray(photo) || photo.length === 0) return undefined;
    // Prefer largest file_size, fall back to last item (often the highest resolution).
    const sorted = [...photo].sort(
      (a, b) => Number(a?.file_size || 0) - Number(b?.file_size || 0),
    );
    const best = sorted[sorted.length - 1];
    return typeof best?.file_id === "string" ? best.file_id : undefined;
  }

  private async saveIncomingAttachments(
    message: TelegramUpdate["message"],
  ): Promise<
    Array<{ type: TelegramAttachmentType; path: string; desc?: string }>
  > {
    if (!message) return [];
    const items: Array<{
      type: TelegramAttachmentType;
      fileId: string;
      fileName?: string;
      desc?: string;
    }> = [];

    if (message.document?.file_id) {
      items.push({
        type: "document",
        fileId: message.document.file_id,
        fileName: message.document.file_name,
        desc: message.document.file_name,
      });
    }

    const bestPhotoId = this.pickBestPhotoFileId(message.photo);
    if (bestPhotoId) {
      items.push({
        type: "photo",
        fileId: bestPhotoId,
        fileName: "photo.jpg",
        desc: "photo",
      });
    }

    if (message.voice?.file_id) {
      items.push({
        type: "voice",
        fileId: message.voice.file_id,
        fileName: "voice.ogg",
        desc: "voice",
      });
    }

    if (message.audio?.file_id) {
      items.push({
        type: "audio",
        fileId: message.audio.file_id,
        fileName: message.audio.file_name || "audio",
        desc: message.audio.file_name || "audio",
      });
    }

    if (message.video?.file_id) {
      items.push({
        type: "video",
        fileId: message.video.file_id,
        fileName: message.video.file_name || "video.mp4",
        desc: message.video.file_name || "video",
      });
    }

    if (items.length === 0) return [];

    const out: Array<{
      type: TelegramAttachmentType;
      path: string;
      desc?: string;
    }> = [];
    for (const item of items) {
      const saved = await this.api.downloadTelegramFile(item.fileId, item.fileName);
      out.push({ type: item.type, path: saved, desc: item.desc });
    }

    return out;
  }

  private async handleCommand(
    chatId: string,
    command: string,
    from?: TelegramUser,
    messageThreadId?: number,
  ): Promise<void> {
    await handleTelegramCommand(
      {
        logger: this.logger,
        buildChatKey: (c, t) => this.buildChatKey(c, t),
        runInChat: (key, fn) => this.runInChat(key, fn),
        sendMessage: (c, text, opts) => this.sendMessage(c, text, opts),
        clearChat: (key) => this.clearChat(key),
      },
      { chatId, command, from, messageThreadId },
    );
  }

  private async handleCallbackQuery(
    callbackQuery: TelegramUpdate["callback_query"],
  ): Promise<void> {
    await handleTelegramCallbackQuery(
      {
        logger: this.logger,
        buildChatKey: (c, t) => this.buildChatKey(c, t),
        runInChat: (key, fn) => this.runInChat(key, fn),
        sendMessage: (c, text, opts) => this.sendMessage(c, text, opts),
        clearChat: (key) => this.clearChat(key),
      },
      callbackQuery,
    );
  }

  private async executeAndReply(
    chatId: string,
    instructions: string,
    from?: TelegramUser,
    messageId?: string,
    chatType?: NonNullable<TelegramUpdate["message"]>["chat"]["type"],
    messageThreadId?: number,
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
      });
    } catch (error) {
      await this.sendMessage(chatId, `❌ Execution error: ${String(error)}`, {
        messageThreadId,
      });
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    opts?: { messageThreadId?: number; replyToMessageId?: number },
  ): Promise<void> {
    await this.api.sendMessage(chatId, text, opts);
    await this.appendBotOutboundHistory({
      chatId,
      text,
      messageThreadId: opts?.messageThreadId,
      source: "telegram_send_message",
    });
  }

  async sendMessageWithInlineKeyboard(
    chatId: string,
    text: string,
    buttons: Array<{ text: string; callback_data: string }>,
    opts?: { messageThreadId?: number },
  ): Promise<void> {
    await this.api.sendMessageWithInlineKeyboard(chatId, text, buttons, opts);
    await this.appendBotOutboundHistory({
      chatId,
      text,
      messageThreadId: opts?.messageThreadId,
      source: "telegram_send_inline_keyboard",
    });
  }

  /**
   * 记录 Telegram 出站消息到 chat history（best-effort）。
   *
   * 关键点（中文）
   * - 仅落审计文件，不会入执行队列，避免形成回环执行。
   * - contextId 使用 chatKey（含 topic lane），便于与入站历史对齐查询。
   */
  private async appendBotOutboundHistory(params: {
    chatId: string;
    text: string;
    messageThreadId?: number;
    source: string;
  }): Promise<void> {
    const chatId = String(params.chatId || "").trim();
    const text = String(params.text ?? "");
    if (!chatId || !text.trim()) return;

    const contextId = this.buildChatKey(chatId, params.messageThreadId);
    try {
      await appendOutboundChatHistory({
        context: this.context,
        contextId,
        channel: "telegram",
        chatId,
        text,
        ...(typeof params.messageThreadId === "number"
          ? { threadId: params.messageThreadId }
          : {}),
        ...(typeof this.botId === "number" ? { actorId: String(this.botId) } : {}),
        ...(typeof this.botUsername === "string" && this.botUsername.trim()
          ? { actorName: this.botUsername.trim() }
          : {}),
        extra: {
          source: params.source,
        },
      });
    } catch (error) {
      this.logger.warn("Failed to append outbound Telegram chat history", {
        error: String(error),
        contextId,
        chatId,
      });
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.consecutivePollErrors = 0;
    this.nextPollAllowedAt = 0;
    this.logger.info("Telegram Bot stopped");
  }
}

export function createTelegramBot(
  config: TelegramConfig,
  context: ServiceRuntime,
): TelegramBot | null {
  if (!config.enabled || !config.botToken || config.botToken === "${}") {
    return null;
  }

  const bot = new TelegramBot(
    context,
    config.botToken,
    config.followupWindowMs,
    config.groupAccess,
  );
  return bot;
}
