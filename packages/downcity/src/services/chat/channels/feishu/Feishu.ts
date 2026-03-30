/**
 * Feishu 渠道门面。
 *
 * 关键点（中文）
 * - `FeishuBot` 只保留入站授权、命令处理、消息入队与回复编排。
 * - Feishu SDK、token、Open API 查询、附件上传下载已经下沉到 `FeishuPlatformClient`。
 * - 纯入站解析逻辑下沉到 `FeishuInbound`，保持渠道门面聚焦主流程。
 */

import fs from "fs-extra";
import path from "path";
import { getCacheDirPath } from "@/main/env/Paths.js";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import type {
  ChannelChatKeyParams,
  ChannelSendTextParams,
} from "@services/chat/channels/BaseChatChannel.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import type { ParsedFeishuAttachmentCommand } from "@services/chat/types/FeishuAttachment.js";
import type { InboundReplyContext } from "@services/chat/types/ReplyContext.js";
import type {
  FeishuConfig,
  FeishuMessageEvent,
  FeishuMessagePayloadType,
} from "@/types/FeishuChannel.js";
import { parseFeishuAttachments } from "./Shared.js";
import { parseFeishuInboundMessage } from "./InboundAttachment.js";
import {
  buildReplyContextExtra,
  buildReplyContextInstruction,
} from "@services/chat/runtime/ReplyContextFormatter.js";
import {
  augmentChatInboundInput,
  buildChatInboundText,
} from "@services/chat/runtime/InboundAugment.js";
import { renderChatMessageFileTag } from "@services/chat/runtime/ChatMessageMarkup.js";
import {
  extractFeishuSenderIdentity,
  isFeishuGroupChat,
  stripFeishuAtMentions,
} from "./FeishuInbound.js";
import { FeishuPlatformClient } from "./FeishuPlatformClient.js";

/**
 * 飞书入站确认 reaction 类型。
 *
 * 说明（中文）
 * - 飞书 reaction API 使用 `emoji_type`，不是直接传 Unicode emoji。
 * - 这里选择 `OK` 作为更轻量的“已收到”反馈。
 */
export const FEISHU_INBOUND_ACK_REACTION_TYPE = "OK";

/**
 * 飞书平台适配器。
 */
export class FeishuBot extends BaseChatChannel {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly domain?: string;
  private readonly dedupeDir: string;
  private readonly platform: FeishuPlatformClient;
  private readonly processingMessages: Set<string> = new Set();
  private readonly processedMessages: Set<string> = new Set();
  private readonly knownChats: Map<
    string,
    { chatId: string; chatType: string; chatTitle?: string }
  > = new Map();

  constructor(
    context: ExecutionRuntime,
    appId: string,
    appSecret: string,
    domain: string | undefined,
  ) {
    super({ channel: "feishu", context });
    this.appId = appId;
    this.appSecret = appSecret;
    this.domain = domain;
    this.dedupeDir = path.join(getCacheDirPath(this.rootPath), "feishu", "dedupe");
    this.platform = new FeishuPlatformClient({
      context,
      config: {
        appId: this.appId,
        appSecret: this.appSecret,
        domain: this.domain,
      },
      onMessage: async (data) => {
        await this.handleMessage(data);
      },
    });
  }

  protected getChatKey(params: ChannelChatKeyParams): string {
    return this.buildChatKey(params.chatId);
  }

  protected async sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const chatType = typeof params.chatType === "string" ? params.chatType : "p2p";
    const messageId =
      typeof params.messageId === "string" ? params.messageId : undefined;
    const text = String(params.text ?? "");
    const shouldReplyToMessage = params.replyToMessage === true;

    if (shouldReplyToMessage && messageId && chatType !== "p2p") {
      await this.sendMessage(params.chatId, chatType, messageId, text);
    } else {
      await this.sendChatMessage(params.chatId, chatType, text);
    }
  }

  /**
   * 兼容旧的 per-chat locking 入口。
   */
  private runInChat(_chatKey: string, fn: () => Promise<void>): Promise<void> {
    return fn();
  }

  /**
   * 读取线程级去重集合。
   */
  private async loadDedupeSet(threadId: string): Promise<Set<string>> {
    const file = path.join(this.dedupeDir, `${encodeURIComponent(threadId)}.json`);
    try {
      if (!(await fs.pathExists(file))) return new Set();
      const data = (await fs.readJson(file)) as JsonObject;
      const ids = Array.isArray(data?.ids) ? data.ids : [];
      return new Set(ids.map((value) => String(value)));
    } catch {
      return new Set();
    }
  }

  /**
   * 持久化线程级去重集合。
   */
  private async persistDedupeSet(
    threadId: string,
    set: Set<string>,
  ): Promise<void> {
    const file = path.join(this.dedupeDir, `${encodeURIComponent(threadId)}.json`);
    try {
      await fs.ensureDir(this.dedupeDir);
      const ids = Array.from(set).slice(-800);
      await fs.writeJson(file, { ids }, { spaces: 2 });
    } catch {
      // ignore
    }
  }

  /**
   * 读取 Feishu runtime 快照。
   */
  getRuntimeStatus(): {
    running: boolean;
    linkState: "connected" | "disconnected" | "unknown";
    statusText: string;
    detail: Record<string, string | number | boolean | null>;
  } {
    const runtime = this.platform.getRuntimeStatus();
    return {
      ...runtime,
      detail: {
        ...runtime.detail,
        knownChatCount: this.knownChats.size,
        dedupeCacheSize: this.processedMessages.size,
      },
    };
  }

  /**
   * 执行 Feishu 连通性测试。
   */
  async testConnection(): Promise<ChatChannelTestResult> {
    return await this.platform.testConnection();
  }

  /**
   * 启动机器人。
   */
  async start(): Promise<void> {
    if (!this.appId || !this.appSecret) {
      this.logger.warn("Feishu App ID or App Secret not configured, skipping startup");
      return;
    }

    this.logger.info("🤖 Starting Feishu Bot...");
    try {
      await this.platform.start(this.processedMessages);
    } catch (error) {
      this.logger.error("Failed to start Feishu Bot", { error: String(error) });
    }
  }

  /**
   * 处理入站消息。
   */
  private async handleMessage(data: FeishuMessageEvent): Promise<void> {
    try {
      if (!data?.message) return;
      const {
        message: {
          chat_id,
          content,
          message_type,
          chat_type,
          message_id,
          parent_id,
        },
      } = data;

      const threadId = this.buildChatKey(chat_id);
      const senderIdentity = extractFeishuSenderIdentity(data);
      const actorId = senderIdentity.senderId;
      const normalizedMessageId = String(message_id || "").trim();
      if (!normalizedMessageId) return;
      if (!actorId) {
        this.logger.warn("飞书消息缺少发送者 userId/open_id，已忽略", {
          chatId: chat_id,
          chatType: chat_type,
          messageId: normalizedMessageId,
        });
        return;
      }

      if (this.processedMessages.has(normalizedMessageId)) {
        this.logger.debug(`Message already processed, skipping: ${normalizedMessageId}`);
        return;
      }

      const persisted = await this.loadDedupeSet(threadId);
      if (persisted.has(normalizedMessageId)) {
        this.logger.debug(
          `Message already processed (persisted), skipping: ${normalizedMessageId}`,
        );
        return;
      }

      if (this.processingMessages.has(normalizedMessageId)) {
        this.logger.debug(
          `Message is already being processed, skipping duplicate delivery: ${normalizedMessageId}`,
        );
        return;
      }
      this.processingMessages.add(normalizedMessageId);

      let handled = false;
      try {
        let userMessage = "";
        let incomingAttachments = [] as Awaited<
          ReturnType<FeishuPlatformClient["downloadIncomingAttachments"]>
        >;
        let replyContext: InboundReplyContext | undefined;
        try {
          const parsed = parseFeishuInboundMessage({
            messageType: message_type,
            content,
          });
          if (parsed.unsupportedType) {
            await this.sendErrorMessage(
              chat_id,
              chat_type,
              message_id,
              `Unsupported Feishu message type: ${parsed.unsupportedType}`,
            );
            handled = true;
            return;
          }

          userMessage = parsed.text;
          incomingAttachments = await this.platform.downloadIncomingAttachments({
            messageId: message_id,
            attachments: parsed.attachments,
          });
          replyContext = await this.platform.resolveReplyContext({
            parentMessageId: parent_id,
          });
        } catch (error) {
          await this.sendErrorMessage(
            chat_id,
            chat_type,
            message_id,
            `Failed to parse message: ${String(error)}`,
          );
          handled = true;
          return;
        }

        this.logger.info(`Received Feishu message: ${userMessage || "[attachment]"}`);
        const actorName =
          (await this.platform.resolveSenderName({
            ...senderIdentity,
            chatId: chat_id,
          })) || undefined;
        const resolvedChatTitle = await this.platform.resolveChatTitle(chat_id);
        const chatTitle = resolvedChatTitle || (chat_type === "p2p" ? actorName : undefined);

        await this.observeIncomingAuthorization({
          chatId: chat_id,
          chatType: chat_type,
          chatTitle,
          userId: actorId,
          username: actorName,
        });

        const authResult = await this.evaluateIncomingAuthorization({
          chatId: chat_id,
          chatType: chat_type,
          chatTitle,
          userId: actorId,
          username: actorName,
        });
        if (authResult.decision !== "allow") {
          if (chat_type === "p2p") {
            await this.sendAuthorizationText({
              chatId: chat_id,
              chatType: chat_type,
              text: this.buildUnauthorizedBlockedText(),
            });
          }
          handled = true;
          return;
        }

        this.knownChats.set(threadId, {
          chatId: chat_id,
          chatType: chat_type,
          ...(chatTitle ? { chatTitle } : {}),
        });

        await this.platform.sendInboundAckReaction({
          messageId: message_id,
        });

        await this.runInChat(threadId, async () => {
          if (userMessage.startsWith("/") && incomingAttachments.length === 0) {
            await this.handleCommand(chat_id, chat_type, message_id, userMessage);
            return;
          }

          const attachmentLines = incomingAttachments.map((attachment) => {
            const rel = path.relative(this.rootPath, attachment.path);
            return renderChatMessageFileTag({
              type: attachment.type,
              path: rel,
              ...(attachment.desc ? { caption: attachment.desc } : {}),
            });
          });

          if (isFeishuGroupChat(chat_type)) {
            userMessage = stripFeishuAtMentions(userMessage);
          }

          const instructions = buildReplyContextInstruction({
            text:
              buildChatInboundText(
                await augmentChatInboundInput({
                  runtime: this.context,
                  input: {
                    channel: "feishu",
                    chatId: chat_id,
                    chatType: chat_type,
                    chatKey: threadId,
                    messageId: message_id,
                    rootPath: this.rootPath,
                    attachmentText:
                      attachmentLines.length > 0 ? attachmentLines.join("\n") : undefined,
                    bodyText: userMessage ? userMessage.trim() : undefined,
                    attachments: incomingAttachments.map((attachment) => ({
                      channel: "feishu" as const,
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
            chat_id,
            chat_type,
            message_id,
            instructions,
            actorId,
            actorName,
            chatTitle,
            buildReplyContextExtra(replyContext),
          );
        });
        handled = true;
      } finally {
        this.processingMessages.delete(normalizedMessageId);
        if (handled) {
          this.processedMessages.add(normalizedMessageId);
          persisted.add(normalizedMessageId);
          await this.persistDedupeSet(threadId, persisted);
        }
      }
    } catch (error) {
      this.logger.error("Failed to process Feishu message", {
        error: String(error),
      });
    }
  }

  /**
   * 处理命令。
   */
  private async handleCommand(
    chatId: string,
    chatType: string,
    messageId: string,
    command: string,
  ): Promise<void> {
    this.logger.info(`Received Feishu command: ${command}`);

    let responseText = "";
    switch (command.toLowerCase().split(" ")[0]) {
      case "/help":
      case "/帮助":
        responseText = `🤖 Downcity Bot

Available commands:
- /help or /帮助 - View help information
- /status or /状态 - View agent status
- /tasks or /任务 - View task list
- /clear or /清除 - Delete current conversation completely
- <any message> - Execute instruction`;
        break;
      case "/status":
      case "/状态":
        responseText = "📊 Agent status: Running\nTasks: 0\nPending approvals: 0";
        break;
      case "/tasks":
      case "/任务":
        responseText = "📋 Task list\nNo tasks";
        break;
      case "/clear":
      case "/清除":
        await this.clearChatByTarget({
          chatId,
          chatType,
        });
        responseText = "✅ Conversation deleted completely";
        break;
      default:
        responseText = `Unknown command: ${command}\nType /help to view available commands`;
    }

    await this.sendMessage(chatId, chatType, messageId, responseText);
  }

  /**
   * 执行指令并回复。
   */
  private async executeAndReply(
    chatId: string,
    chatType: string,
    messageId: string,
    instructions: string,
    actorId?: string,
    actorName?: string,
    chatTitle?: string,
    extra?: JsonObject,
  ): Promise<void> {
    try {
      const { chatKey } = await this.enqueueMessage({
        chatId,
        text: instructions,
        chatType,
        messageId,
        userId: actorId,
        username: actorName,
        chatTitle,
        ...(extra ? { extra } : {}),
      });

      this.knownChats.set(chatKey, {
        chatId,
        chatType,
        ...(chatTitle ? { chatTitle } : {}),
      });
    } catch (error) {
      await this.sendErrorMessage(
        chatId,
        chatType,
        messageId,
        `Execution error: ${String(error)}`,
      );
    }
  }

  /**
   * 回复消息。
   */
  async sendMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const parsed = parseFeishuAttachments(text);
    await this.sendParsedMessage(chatId, chatType, messageId, parsed.segments);
  }

  /**
   * 普通发送消息。
   */
  async sendChatMessage(
    chatId: string,
    chatType: string,
    text: string,
  ): Promise<void> {
    const parsed = parseFeishuAttachments(text);
    await this.sendParsedMessage(chatId, chatType, undefined, parsed.segments);
  }

  /**
   * 按正文与附件的真实顺序发送。
   */
  private async sendParsedMessage(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    segments: Array<
      | {
          kind: "text";
          text: string;
        }
      | {
          kind: "attachment";
          attachment: ParsedFeishuAttachmentCommand;
        }
    >,
  ): Promise<void> {
    for (const segment of segments) {
      if (segment.kind === "text") {
        const normalizedText = String(segment.text || "").trim();
        if (!normalizedText) continue;
        await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
          text: normalizedText,
        });
        continue;
      }

      try {
        await this.sendAttachment(chatId, chatType, messageId, segment.attachment);
      } catch (error) {
        await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
          text: `❌ Failed to send attachment: ${segment.attachment.pathOrUrl}\n${String(error)}`,
        });
      }
    }
  }

  /**
   * 发送单个附件。
   */
  async sendAttachment(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    attachment: ParsedFeishuAttachmentCommand,
  ): Promise<void> {
    await this.platform.sendAttachment(chatId, chatType, messageId, attachment);
  }

  /**
   * 发送底层平台消息。
   */
  async sendPlatformMessage(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    msgType: FeishuMessagePayloadType,
    content: Record<string, unknown> | string,
  ): Promise<void> {
    await this.platform.sendPlatformMessage(chatId, chatType, messageId, msgType, content);
  }

  /**
   * 发送统一错误文本。
   */
  private async sendErrorMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    errorText: string,
  ): Promise<void> {
    await this.sendMessage(chatId, chatType, messageId, `❌ ${errorText}`);
  }

  /**
   * 停止机器人。
   */
  async stop(): Promise<void> {
    await this.platform.stop();
    this.processedMessages.clear();
  }

  /**
   * 生成 chatKey。
   */
  private buildChatKey(chatId: string): string {
    return `feishu-chat-${chatId}`;
  }
}

/**
 * 创建飞书机器人实例。
 */
export async function createFeishuBot(
  config: FeishuConfig,
  context: ExecutionRuntime,
): Promise<FeishuBot | null> {
  if (!config.enabled || !config.appId || !config.appSecret) {
    return null;
  }

  return new FeishuBot(context, config.appId, config.appSecret, config.domain);
}
