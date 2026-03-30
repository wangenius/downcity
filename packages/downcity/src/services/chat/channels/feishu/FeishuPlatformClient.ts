/**
 * FeishuPlatformClient：飞书平台连接与消息能力封装。
 *
 * 关键点（中文）
 * - 负责 SDK client / WS client、token 缓存、Open API 查询、附件上传下载、消息发送。
 * - `FeishuBot` 只调用这里暴露的平台能力，不再直接持有底层 Feishu 连接细节。
 */

import * as Lark from "@larksuiteoapi/node-sdk";
import fs from "fs-extra";
import path from "path";
import { getCacheDirPath } from "@/main/env/Paths.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type {
  FeishuConfig,
  FeishuDownloadedAttachment,
  FeishuMessageEvent,
  FeishuMessagePayloadType,
} from "@/types/FeishuChannel.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import type { ParsedFeishuAttachmentCommand } from "@services/chat/types/FeishuAttachment.js";
import type { FeishuIncomingAttachmentDescriptor } from "@services/chat/types/FeishuInboundAttachment.js";
import type { InboundReplyContext } from "@services/chat/types/ReplyContext.js";
import {
  buildFeishuInboundCacheFileName,
} from "./InboundAttachment.js";
import { buildFeishuReplyContext } from "./ReplyContext.js";

const FEISHU_INBOUND_ACK_REACTION_TYPE = "OK";

/**
 * Feishu 平台 client 构造参数。
 */
export interface FeishuPlatformClientOptions {
  /**
   * 当前执行上下文。
   */
  context: ExecutionRuntime;
  /**
   * 飞书渠道配置。
   */
  config: Pick<FeishuConfig, "appId" | "appSecret" | "domain">;
  /**
   * 入站消息回调。
   */
  onMessage: (data: FeishuMessageEvent) => Promise<void>;
}

/**
 * 飞书平台 client。
 */
export class FeishuPlatformClient {
  private readonly context: ExecutionRuntime;
  private readonly rootPath: string;
  private readonly logger: ExecutionRuntime["logger"];
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly domain?: string;
  private readonly onMessage: (data: FeishuMessageEvent) => Promise<void>;

  private client: Lark.Client | null = null;
  private wsClient: Lark.WSClient | null = null;
  private isRunning = false;
  private messageCleanupInterval: NodeJS.Timeout | null = null;
  private appAccessToken = "";
  private appAccessTokenExpiresAtMs = 0;
  private readonly chatTitleByChatId: Map<string, string> = new Map();
  private readonly senderNameBySenderKey: Map<string, string> = new Map();
  private readonly lookupWarnings: Set<string> = new Set();

  constructor(options: FeishuPlatformClientOptions) {
    this.context = options.context;
    this.rootPath = options.context.rootPath;
    this.logger = options.context.logger;
    this.appId = options.config.appId;
    this.appSecret = options.config.appSecret;
    this.domain = options.config.domain;
    this.onMessage = options.onMessage;
  }

  /**
   * 获取 runtime 快照。
   */
  getRuntimeStatus(): {
    running: boolean;
    linkState: "connected" | "disconnected" | "unknown";
    statusText: string;
    detail: Record<string, string | number | boolean | null>;
  } {
    const running = this.isRunning;
    const hasClients = Boolean(this.client && this.wsClient);
    const linkState = running && hasClients ? "connected" : running ? "unknown" : "disconnected";
    return {
      running,
      linkState,
      statusText:
        linkState === "connected"
          ? "ws_online"
          : linkState === "unknown"
            ? "starting"
            : "stopped",
      detail: {
        hasClient: Boolean(this.client),
        hasWsClient: Boolean(this.wsClient),
        cachedChatTitleCount: this.chatTitleByChatId.size,
        cachedSenderNameCount: this.senderNameBySenderKey.size,
      },
    };
  }

  /**
   * 连通性测试。
   */
  async testConnection(): Promise<ChatChannelTestResult> {
    const startedAt = Date.now();
    if (!this.appId || !this.appSecret) {
      return {
        channel: "feishu",
        success: false,
        testedAtMs: startedAt,
        message: "App credentials are missing",
      };
    }

    const domain = this.domain || "https://open.feishu.cn";
    const endpoint = `${domain.replace(/\/+$/, "")}/open-apis/auth/v3/app_access_token/internal`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
      });
      const raw = await response.text();
      const now = Date.now();
      let code: number | undefined;
      let msg: string | undefined;
      try {
        const parsed = JSON.parse(raw) as { code?: number; msg?: string };
        code = typeof parsed.code === "number" ? parsed.code : undefined;
        msg = typeof parsed.msg === "string" ? parsed.msg : undefined;
      } catch {
        // ignore parse error
      }

      if (response.ok && (code === 0 || code === undefined)) {
        return {
          channel: "feishu",
          success: true,
          testedAtMs: now,
          latencyMs: now - startedAt,
          message: "Connected to Feishu Open API",
          detail: {
            httpStatus: response.status,
            code: code ?? null,
          },
        };
      }

      return {
        channel: "feishu",
        success: false,
        testedAtMs: now,
        latencyMs: now - startedAt,
        message: `Feishu API check failed: HTTP ${response.status}${msg ? ` ${msg}` : ""}`,
        detail: {
          httpStatus: response.status,
          code: code ?? null,
        },
      };
    } catch (error) {
      const now = Date.now();
      return {
        channel: "feishu",
        success: false,
        testedAtMs: now,
        latencyMs: now - startedAt,
        message: `Feishu API check failed: ${String(error)}`,
      };
    }
  }

  /**
   * 启动平台连接。
   */
  async start(processedMessages: Set<string>): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("Feishu Bot is already running, skipping duplicate startup");
      return;
    }

    this.isRunning = true;
    const baseConfig = {
      appId: this.appId,
      appSecret: this.appSecret,
      domain: this.domain || "https://open.feishu.cn",
    };
    this.client = new Lark.Client(baseConfig);
    this.wsClient = new Lark.WSClient(baseConfig);

    const eventDispatcher = new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: FeishuMessageEvent) => {
        await this.onMessage(data);
      },
    });

    this.wsClient.start({ eventDispatcher });
    this.logger.info("Feishu Bot started, using long connection mode");

    this.messageCleanupInterval = setInterval(() => {
      if (processedMessages.size > 1000) {
        processedMessages.clear();
        this.logger.debug("Cleared message deduplication cache");
      }
    }, 5 * 60 * 1000);
  }

  /**
   * 停止平台连接。
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.messageCleanupInterval) {
      clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = null;
    }
    if (this.wsClient) {
      this.logger.info("Feishu Bot stopped");
    }
  }

  /**
   * 给入站消息补一个轻量 ack reaction。
   */
  async sendInboundAckReaction(params: { messageId?: string }): Promise<void> {
    const messageId = String(params.messageId || "").trim();
    if (!messageId || !this.client?.im?.v1?.messageReaction?.create) return;
    try {
      await this.client.im.v1.messageReaction.create({
        path: { message_id: messageId },
        data: {
          reaction_type: {
            emoji_type: FEISHU_INBOUND_ACK_REACTION_TYPE,
          },
        },
      });
    } catch (error) {
      this.logger.warn("飞书入站 ack reaction 失败，继续处理消息", {
        messageId,
        reactionType: FEISHU_INBOUND_ACK_REACTION_TYPE,
        error: String(error),
      });
    }
  }

  /**
   * 解析发送者姓名。
   */
  async resolveSenderName(params: {
    senderId?: string;
    idType?: "open_id" | "user_id" | "union_id";
    chatId?: string;
  }): Promise<string | undefined> {
    const senderId = String(params.senderId || "").trim();
    const idType = params.idType;
    if (!senderId || !idType) return undefined;

    const cacheKey = `${idType}:${senderId}`;
    const cached = this.senderNameBySenderKey.get(cacheKey);
    if (cached) return cached;

    const token = await this.getAppAccessToken();
    if (!token) return undefined;

    const domain = this.getNormalizedDomain();
    try {
      const response = await fetch(
        `${domain}/open-apis/contact/v3/users/${encodeURIComponent(senderId)}?user_id_type=${encodeURIComponent(idType)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            code?: number;
            msg?: string;
            data?: {
              user?: {
                name?: string;
                nickname?: string;
                en_name?: string;
                [key: string]: unknown;
              };
            };
          }
        | null;
      if (!response.ok) {
        this.warnLookupOnce(
          `feishu-user-http:${idType}:${senderId}:${response.status}:${String(payload?.code ?? "")}`,
          "Feishu 用户信息查询失败",
          {
            senderId,
            idType,
            httpStatus: response.status,
            code: payload?.code ?? null,
            msg: payload?.msg ?? null,
          },
        );
      } else if (payload?.code !== 0) {
        this.warnLookupOnce(
          `feishu-user-code:${idType}:${senderId}:${String(payload?.code ?? "")}`,
          "Feishu 用户信息查询返回错误",
          {
            senderId,
            idType,
            httpStatus: response.status,
            code: payload?.code ?? null,
            msg: payload?.msg ?? null,
          },
        );
      } else {
        const user = payload?.data?.user;
        const name = [user?.nickname, user?.name, user?.en_name]
          .map((value) => String(value || "").trim())
          .find(Boolean);
        if (name) {
          this.senderNameBySenderKey.set(cacheKey, name);
          return name;
        }

        this.warnLookupOnce(
          `feishu-user-empty:${idType}:${senderId}`,
          "Feishu 用户信息未返回姓名字段",
          {
            senderId,
            idType,
            returnedFields: user ? Object.keys(user) : [],
          },
        );
      }
    } catch (error) {
      this.warnLookupOnce(
        `feishu-user-exception:${idType}:${senderId}:${error instanceof Error ? error.name : "unknown"}`,
        "Feishu 用户信息查询异常",
        {
          senderId,
          idType,
          error: String(error),
        },
      );
    }

    const memberName = await this.resolveSenderNameFromChatMembers({
      chatId: params.chatId,
      senderId,
      idType,
    });
    if (memberName) {
      this.senderNameBySenderKey.set(cacheKey, memberName);
      return memberName;
    }
    return undefined;
  }

  /**
   * 解析群聊/会话标题。
   */
  async resolveChatTitle(chatId: string): Promise<string | undefined> {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return undefined;

    const cached = this.chatTitleByChatId.get(normalizedChatId);
    if (cached) return cached;

    const token = await this.getAppAccessToken();
    if (!token) return undefined;

    const domain = this.getNormalizedDomain();
    try {
      const response = await fetch(
        `${domain}/open-apis/im/v1/chats/${encodeURIComponent(normalizedChatId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) {
        this.logger.debug("Feishu 群信息查询失败", {
          chatId: normalizedChatId,
          httpStatus: response.status,
        });
        return undefined;
      }
      const payload = (await response.json().catch(() => null)) as
        | {
            code?: number;
            msg?: string;
            data?: {
              name?: string;
              chat_name?: string;
              chat?: {
                name?: string;
                chat_name?: string;
              };
            };
          }
        | null;
      if (typeof payload?.code === "number" && payload.code !== 0) {
        this.logger.debug("Feishu 群信息查询返回错误", {
          chatId: normalizedChatId,
          code: payload.code,
          msg: payload.msg,
        });
        return undefined;
      }
      const title = [
        payload?.data?.name,
        payload?.data?.chat_name,
        payload?.data?.chat?.name,
        payload?.data?.chat?.chat_name,
      ]
        .map((value) => String(value || "").trim())
        .find(Boolean);
      if (!title) return undefined;
      this.chatTitleByChatId.set(normalizedChatId, title);
      return title;
    } catch {
      return undefined;
    }
  }

  /**
   * 查询 reply 的父消息上下文。
   */
  async resolveReplyContext(params: {
    parentMessageId?: string;
  }): Promise<InboundReplyContext | undefined> {
    const parentMessageId = String(params.parentMessageId || "").trim();
    if (!parentMessageId) return undefined;

    const token = await this.getAppAccessToken();
    if (!token) return undefined;

    const domain = this.getNormalizedDomain();
    try {
      const response = await fetch(
        `${domain}/open-apis/im/v1/messages/${encodeURIComponent(parentMessageId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            code?: number;
            msg?: string;
            data?: {
              items?: Array<{
                message_id?: string;
                msg_type?: string;
                sender?: {
                  id?: string;
                  sender_type?: string;
                };
                body?: {
                  content?: string;
                };
              }>;
            };
          }
        | null;
      if (!response.ok || payload?.code !== 0) {
        this.logger.debug("Feishu reply 父消息查询失败", {
          parentMessageId,
          httpStatus: response.status,
          code: payload?.code ?? null,
          msg: payload?.msg ?? null,
        });
        return undefined;
      }

      const item = Array.isArray(payload?.data?.items) ? payload?.data?.items[0] : undefined;
      if (!item) return undefined;
      return buildFeishuReplyContext({
        messageId:
          typeof item.message_id === "string" ? item.message_id : parentMessageId,
        messageType: item.msg_type,
        content: item.body?.content,
      });
    } catch (error) {
      this.logger.debug("Feishu reply 父消息查询异常", {
        parentMessageId,
        error: String(error),
      });
      return undefined;
    }
  }

  /**
   * 下载入站附件。
   */
  async downloadIncomingAttachments(params: {
    messageId: string;
    attachments: FeishuIncomingAttachmentDescriptor[];
  }): Promise<FeishuDownloadedAttachment[]> {
    if (!this.client || params.attachments.length === 0) return [];

    const dir = path.join(getCacheDirPath(this.rootPath), "feishu");
    await fs.ensureDir(dir);

    const out: FeishuDownloadedAttachment[] = [];
    for (const attachment of params.attachments) {
      try {
        const resource = await this.client.im.v1.messageResource.get({
          path: {
            message_id: params.messageId,
            file_key: attachment.resourceKey,
          },
          params: {
            type: attachment.resourceType,
          },
        });

        const fileName = buildFeishuInboundCacheFileName({
          attachment,
          messageId: params.messageId,
          headers: resource.headers,
        });
        const outPath = path.join(dir, fileName);
        await resource.writeFile(outPath);
        out.push({
          type: attachment.type,
          path: outPath,
          ...(attachment.description ? { desc: attachment.description } : {}),
        });
      } catch (error) {
        this.logger.warn("Failed to download incoming Feishu attachment", {
          messageId: params.messageId,
          resourceKey: attachment.resourceKey,
          resourceType: attachment.resourceType,
          error: String(error),
        });
      }
    }

    return out;
  }

  /**
   * 发送附件。
   */
  async sendAttachment(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    attachment: ParsedFeishuAttachmentCommand,
  ): Promise<void> {
    const localPath = await this.resolveAttachmentLocalPath(attachment.pathOrUrl);
    if (attachment.type === "photo") {
      const imageKey = await this.uploadImageToFeishu(localPath);
      await this.sendPlatformMessage(chatId, chatType, messageId, "image", {
        image_key: imageKey,
      });
    } else {
      const fileKey = await this.uploadFileToFeishu(localPath);
      await this.sendPlatformMessage(chatId, chatType, messageId, "file", {
        file_key: fileKey,
      });
    }

    const caption = String(attachment.caption || "").trim();
    if (caption) {
      await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
        text: caption,
      });
    }
  }

  /**
   * 发送平台消息。
   */
  async sendPlatformMessage(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    msgType: FeishuMessagePayloadType,
    content: Record<string, unknown> | string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Feishu client is not initialized");
    }
    const serializedContent =
      typeof content === "string" ? content : JSON.stringify(content);
    try {
      if (chatType !== "p2p" && messageId) {
        await this.client.im.v1.message.reply({
          path: {
            message_id: messageId,
          },
          data: {
            content: serializedContent,
            msg_type: msgType,
          },
        });
        return;
      }

      await this.client.im.v1.message.create({
        params: {
          receive_id_type: "chat_id",
        },
        data: {
          receive_id: chatId,
          content: serializedContent,
          msg_type: msgType,
        },
      });
    } catch (error) {
      this.logger.error("Failed to send Feishu message", {
        error: String(error),
        msgType,
        chatType,
      });
      throw error instanceof Error
        ? error
        : new Error(`Failed to send Feishu message: ${String(error)}`);
    }
  }

  /**
   * 获取 tenant_access_token。
   */
  private async getAppAccessToken(): Promise<string | undefined> {
    const now = Date.now();
    if (this.appAccessToken && this.appAccessTokenExpiresAtMs > now + 10_000) {
      return this.appAccessToken;
    }

    const domain = this.getNormalizedDomain();
    try {
      const response = await fetch(
        `${domain}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: this.appId,
            app_secret: this.appSecret,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            code?: number;
            tenant_access_token?: string;
            expire?: number;
            msg?: string;
          }
        | null;
      const token =
        typeof payload?.tenant_access_token === "string"
          ? payload.tenant_access_token.trim()
          : "";
      if (!response.ok || payload?.code !== 0 || !token) {
        this.logger.debug("Feishu tenant_access_token 获取失败", {
          httpStatus: response.status,
          code: payload?.code,
          msg: payload?.msg,
        });
        return undefined;
      }

      const expireSeconds =
        typeof payload?.expire === "number" && Number.isFinite(payload.expire)
          ? payload.expire
          : 7200;
      this.appAccessToken = token;
      this.appAccessTokenExpiresAtMs = Date.now() + Math.max(60, expireSeconds) * 1000;
      return token;
    } catch {
      return undefined;
    }
  }

  /**
   * 通过 chat members 列表兜底解析发送者姓名。
   */
  private async resolveSenderNameFromChatMembers(params: {
    chatId?: string;
    senderId: string;
    idType: "open_id" | "user_id" | "union_id";
  }): Promise<string | undefined> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return undefined;

    const token = await this.getAppAccessToken();
    if (!token) return undefined;

    const domain = this.getNormalizedDomain();
    try {
      const response = await fetch(
        `${domain}/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?member_id_type=${encodeURIComponent(params.idType)}&page_size=100`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            code?: number;
            msg?: string;
            data?: {
              items?: Array<{
                member_id_type?: string;
                member_id?: string;
                name?: string;
                tenant_key?: string;
              }>;
            };
          }
        | null;
      if (!response.ok) {
        this.warnLookupOnce(
          `feishu-member-http:${chatId}:${params.idType}:${response.status}:${String(payload?.code ?? "")}`,
          "Feishu 群成员查询失败",
          {
            chatId,
            senderId: params.senderId,
            idType: params.idType,
            httpStatus: response.status,
            code: payload?.code ?? null,
            msg: payload?.msg ?? null,
          },
        );
        return undefined;
      }
      if (payload?.code !== 0) {
        this.warnLookupOnce(
          `feishu-member-code:${chatId}:${params.idType}:${String(payload?.code ?? "")}`,
          "Feishu 群成员查询返回错误",
          {
            chatId,
            senderId: params.senderId,
            idType: params.idType,
            httpStatus: response.status,
            code: payload?.code ?? null,
            msg: payload?.msg ?? null,
          },
        );
        return undefined;
      }

      const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
      const matched = items.find(
        (item) => String(item?.member_id || "").trim() === params.senderId,
      );
      const name = String(matched?.name || "").trim();
      return name || undefined;
    } catch (error) {
      this.warnLookupOnce(
        `feishu-member-exception:${chatId}:${params.idType}:${error instanceof Error ? error.name : "unknown"}`,
        "Feishu 群成员查询异常",
        {
          chatId,
          senderId: params.senderId,
          idType: params.idType,
          error: String(error),
        },
      );
      return undefined;
    }
  }

  /**
   * 发送查找类告警，并做 once 去重。
   */
  private warnLookupOnce(
    warningKey: string,
    message: string,
    details: JsonObject,
  ): void {
    const normalizedKey = String(warningKey || "").trim();
    if (normalizedKey) {
      if (this.lookupWarnings.has(normalizedKey)) return;
      this.lookupWarnings.add(normalizedKey);
    }
    this.logger.warn(message, details);
  }

  /**
   * 解析附件本地路径。
   */
  private async resolveAttachmentLocalPath(pathOrUrl: string): Promise<string> {
    const raw = String(pathOrUrl || "").trim();
    if (!raw) {
      throw new Error("Attachment path is empty");
    }
    if (/^https?:\/\//i.test(raw)) {
      throw new Error("Feishu attachment currently only supports local file path");
    }

    const absPath = path.isAbsolute(raw) ? raw : path.resolve(this.rootPath, raw);
    const exists = await fs.pathExists(absPath);
    if (!exists) {
      throw new Error(`Attachment file not found: ${raw}`);
    }
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      throw new Error(`Attachment path is not a file: ${raw}`);
    }
    return absPath;
  }

  /**
   * 上传本地文件。
   */
  private async uploadFileToFeishu(localPath: string): Promise<string> {
    const token = await this.getAppAccessToken();
    if (!token) {
      throw new Error("Failed to get Feishu tenant_access_token");
    }

    const domain = this.getNormalizedDomain();
    const fileName = path.basename(localPath) || "attachment.bin";
    const fileBuffer = await fs.readFile(localPath);
    const form = new FormData();
    form.set("file_type", "stream");
    form.set("file_name", fileName);
    form.set("file", new Blob([fileBuffer]), fileName);

    const response = await fetch(`${domain}/open-apis/im/v1/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          code?: number;
          msg?: string;
          data?: {
            file_key?: string;
          };
        }
      | null;
    const fileKey = String(payload?.data?.file_key || "").trim();
    if (!response.ok || payload?.code !== 0 || !fileKey) {
      throw new Error(
        `Feishu file upload failed: HTTP ${response.status}, code=${String(payload?.code ?? "")}, msg=${String(payload?.msg ?? "")}`,
      );
    }

    return fileKey;
  }

  /**
   * 上传本地图片。
   */
  private async uploadImageToFeishu(localPath: string): Promise<string> {
    if (!this.client) {
      throw new Error("Feishu client is not initialized");
    }

    const fileBuffer = await fs.readFile(localPath);
    const payload = await this.client.im.v1.image.create({
      data: {
        image_type: "message",
        image: fileBuffer,
      },
    });
    const imageKey = String(payload?.image_key || "").trim();
    if (!imageKey) {
      throw new Error(`Feishu image upload failed: ${localPath}`);
    }
    return imageKey;
  }

  /**
   * 归一化 domain。
   */
  private getNormalizedDomain(): string {
    return (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
  }
}
