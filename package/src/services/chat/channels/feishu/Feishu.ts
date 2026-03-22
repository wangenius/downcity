import * as Lark from "@larksuiteoapi/node-sdk";
import fs from "fs-extra";
import path from "path";
import { getCacheDirPath } from "@/console/env/Paths.js";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import type {
  ChannelChatKeyParams,
  ChannelSendTextParams,
} from "@services/chat/channels/BaseChatChannel.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import type { ParsedFeishuAttachmentCommand } from "@services/chat/types/FeishuAttachment.js";
import type { FeishuIncomingAttachmentDescriptor } from "@services/chat/types/FeishuInboundAttachment.js";
import { parseFeishuAttachments } from "./Shared.js";
import {
  buildFeishuInboundCacheFileName,
  parseFeishuInboundMessage,
} from "./InboundAttachment.js";

/**
 * Feishu (Lark) chat channel.
 *
 * Responsibilities:
 * - Receive Feishu message events and translate them into AgentRuntime inputs
 * - Relay tool-strict replies back to Feishu via dispatcher + `chat_send` tool
 * - Persist chat logs through UIMessage history via BaseChatChannel helpers
 */

/**
 * 飞书适配器配置。
 *
 * 说明（中文）
 * - 仅保留运行所需字段，群聊策略统一“任何消息可触发”
 */
interface FeishuConfig {
  appId: string;
  appSecret: string;
  enabled: boolean;
  domain?: string;
}

type FeishuMessageEvent = {
  sender?: {
    sender_id?: {
      user_id?: string;
      open_id?: string;
      union_id?: string;
      chat_id?: string;
    };
  };
  message?: {
    chat_id: string;
    content: string;
    message_type: string;
    chat_type: string;
    message_id: string;
  };
};

type FeishuMessagePayloadType = "text" | "file";

export class FeishuBot extends BaseChatChannel {
  private appId: string;
  private appSecret: string;
  private domain?: string;
  private client: Lark.Client | null = null;
  private wsClient: Lark.WSClient | null = null;
  private isRunning: boolean = false;
  private processingMessages: Set<string> = new Set(); // 用于并发投递中的瞬时去重
  private processedMessages: Set<string> = new Set(); // 用于消息去重
  private messageCleanupInterval: NodeJS.Timeout | null = null;
  private dedupeDir: string;
  private knownChats: Map<
    string,
    { chatId: string; chatType: string; chatTitle?: string }
  > =
    new Map();
  private chatTitleByChatId: Map<string, string> = new Map();
  private senderNameBySenderKey: Map<string, string> = new Map();
  private lookupWarnings: Set<string> = new Set();
  private appAccessToken: string = "";
  private appAccessTokenExpiresAtMs: number = 0;

  constructor(
    context: ServiceRuntime,
    appId: string,
    appSecret: string,
    domain: string | undefined,
  ) {
    super({ channel: "feishu", context });
    this.appId = appId;
    this.appSecret = appSecret;
    this.domain = domain;
    this.dedupeDir = path.join(
      getCacheDirPath(this.rootPath),
      "feishu",
      "dedupe",
    );
  }

  private buildChatKey(chatId: string): string {
    return `feishu-chat-${chatId}`;
  }

  protected getChatKey(params: ChannelChatKeyParams): string {
    return this.buildChatKey(params.chatId);
  }

  protected async sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const chatType =
      typeof params.chatType === "string" ? params.chatType : "p2p";
    const messageId =
      typeof params.messageId === "string" ? params.messageId : undefined;
    const text = String(params.text ?? "");
    const shouldReplyToMessage = params.replyToMessage === true;

    // 关键点（中文）
    // - 飞书群聊里只有显式 reply 时才挂到目标消息。
    // - 普通发送即使带着历史 messageId，也必须走 create，避免引用错位。
    if (shouldReplyToMessage && messageId && chatType !== "p2p") {
      await this.sendMessage(params.chatId, chatType, messageId, text);
    } else {
      await this.sendChatMessage(params.chatId, chatType, text);
    }
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

  /**
   * 加载线程级去重集合（本地文件持久化）。
   *
   * 说明（中文）
   * - 用于处理平台重投递/重连导致的重复消息
   * - 失败时降级为空集合，保持主流程可用
   */
  private async loadDedupeSet(threadId: string): Promise<Set<string>> {
    const file = path.join(
      this.dedupeDir,
      `${encodeURIComponent(threadId)}.json`,
    );
    try {
      if (!(await fs.pathExists(file))) return new Set();
      const data = (await fs.readJson(file)) as JsonObject;
      const ids = Array.isArray(data?.ids) ? data.ids : [];
      return new Set(ids.map((x) => String(x)));
    } catch {
      return new Set();
    }
  }

  /**
   * 持久化线程级去重集合。
   *
   * 说明（中文）
   * - 仅保留最近 800 条，限制文件体积
   * - 写入失败不影响主流程（best-effort）
   */
  private async persistDedupeSet(
    threadId: string,
    set: Set<string>,
  ): Promise<void> {
    const file = path.join(
      this.dedupeDir,
      `${encodeURIComponent(threadId)}.json`,
    );
    try {
      await fs.ensureDir(this.dedupeDir);
      const ids = Array.from(set).slice(-800); // cap
      await fs.writeJson(file, { ids }, { spaces: 2 });
    } catch {
      // ignore
    }
  }

  private isGroupChat(chatType: string): boolean {
    return chatType !== "p2p";
  }

  private extractSenderIdentity(data: FeishuMessageEvent): {
    senderId?: string;
    idType?: "open_id" | "user_id" | "union_id";
  } {
    const openId = String(data?.sender?.sender_id?.open_id || "").trim();
    if (openId) {
      return { senderId: openId, idType: "open_id" };
    }

    const userId = String(data?.sender?.sender_id?.user_id || "").trim();
    if (userId) {
      return { senderId: userId, idType: "user_id" };
    }

    const unionId = String(data?.sender?.sender_id?.union_id || "").trim();
    if (unionId) {
      return { senderId: unionId, idType: "union_id" };
    }

    return {};
  }

  /**
   * 飞书查询告警去重。
   *
   * 关键点（中文）
   * - 同一类权限/查询失败只打印一次，避免日志被重复刷屏。
   * - 仍保留关键上下文，方便直接定位缺失权限或返回异常。
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
   * 解析飞书发送者姓名。
   *
   * 关键点（中文）
   * - 消息事件本身不直接给 `name`，需要再查「获取单个用户信息」接口。
   * - 若通讯录接口拿不到姓名，则继续尝试 chat members 接口兜底。
   * - 依赖通讯录 / IM 群成员权限与数据范围，因此这里只做 best-effort。
   */
  private async resolveSenderName(params: {
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

    const domain = (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
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
   * 通过 chat members 列表兜底解析发送者姓名。
   *
   * 关键点（中文）
   * - `im/v1/chats/:chat_id/members` 会返回成员 `name` 字段。
   * - 对 p2p 会话尤其有价值，因为 `chat.get` 常常不返回标题。
   * - 若应用未开通 `im:chat.members:read` 等权限，会在日志中明确提示。
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

    const domain = (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
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
   * 获取 Feishu tenant_access_token（带本地缓存）。
   *
   * 关键点（中文）
   * - `im/v1/chats` 与 `contact/v3/users` 要求使用 tenant/user token。
   * - 失败时返回 undefined，不阻塞主消息流程。
   */
  private async getAppAccessToken(): Promise<string | undefined> {
    const now = Date.now();
    if (
      this.appAccessToken &&
      this.appAccessTokenExpiresAtMs > now + 10_000
    ) {
      return this.appAccessToken;
    }

    const domain = (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
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
   * 解析飞书会话展示名（群名/会话名）。
   *
   * 关键点（中文）
   * - 基于 `chat_id` 查询会话详情，结果缓存到内存。
   * - 解析失败不影响主链路，仅缺失展示名。
   */
  private async resolveChatTitle(chatId: string): Promise<string | undefined> {
    const normalizedChatId = String(chatId || "").trim();
    if (!normalizedChatId) return undefined;

    const cached = this.chatTitleByChatId.get(normalizedChatId);
    if (cached) return cached;

    const token = await this.getAppAccessToken();
    if (!token) return undefined;

    const domain = (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
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
      const titleCandidates = [
        payload?.data?.name,
        payload?.data?.chat_name,
        payload?.data?.chat?.name,
        payload?.data?.chat?.chat_name,
      ];
      const title = titleCandidates
        .map((value) => String(value || "").trim())
        .find(Boolean);
      if (!title) return undefined;
      this.chatTitleByChatId.set(normalizedChatId, title);
      return title;
    } catch {
      return undefined;
    }
  }

  private stripAtMentions(text: string): string {
    if (!text) return text;
    return text
      .replace(/<at\b[^>]*>[^<]*<\/at>/gi, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  /**
   * 读取 Feishu runtime 快照。
   *
   * 关键点（中文）
   * - SDK 未公开 WS readyState，这里按实例存活 + 启动标记推断链路状态。
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
        knownChatCount: this.knownChats.size,
        dedupeCacheSize: this.processedMessages.size,
        hasClient: Boolean(this.client),
        hasWsClient: Boolean(this.wsClient),
      },
    };
  }

  /**
   * 执行 Feishu 连通性测试。
   *
   * 关键点（中文）
   * - 直接调用 app_access_token 接口验证 appId/appSecret 与网络可达性。
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

  async start(): Promise<void> {
    if (!this.appId || !this.appSecret) {
      this.logger.warn(
        "Feishu App ID or App Secret not configured, skipping startup",
      );
      return;
    }

    // Prevent duplicate startup
    if (this.isRunning) {
      this.logger.warn(
        "Feishu Bot is already running, skipping duplicate startup",
      );
      return;
    }

    this.isRunning = true;
    this.logger.info("🤖 Starting Feishu Bot...");

    try {
      // Configure Feishu client
      const baseConfig = {
        appId: this.appId,
        appSecret: this.appSecret,
        domain: this.domain || "https://open.feishu.cn",
      };

      // Create LarkClient and WSClient
      this.client = new Lark.Client(baseConfig);
      this.wsClient = new Lark.WSClient(baseConfig);

      // Register event handlers
      const eventDispatcher = new Lark.EventDispatcher({}).register({
        /**
         * Register message receive event
         * https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive
         */
        "im.message.receive_v1": async (data: FeishuMessageEvent) => {
          await this.handleMessage(data);
        },
      });

      // Start long connection
      this.wsClient.start({ eventDispatcher });
      this.logger.info("Feishu Bot started, using long connection mode");

      // Start message cache cleanup timer (clean every 5 minutes, keep message IDs from last 10 minutes)
      this.messageCleanupInterval = setInterval(
        () => {
          if (this.processedMessages.size > 1000) {
            this.processedMessages.clear();
            this.logger.debug("Cleared message deduplication cache");
          }
        },
        5 * 60 * 1000,
      );
    } catch (error) {
      this.logger.error("Failed to start Feishu Bot", { error: String(error) });
    }
  }

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
        },
      } = data;

      const threadId = this.buildChatKey(chat_id);
      const senderIdentity = this.extractSenderIdentity(data);
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

      // Message deduplication: check if this message has been processed
      if (this.processedMessages.has(normalizedMessageId)) {
        this.logger.debug(
          `Message already processed, skipping: ${normalizedMessageId}`,
        );
        return;
      }

      // Persistent dedupe (best-effort)
      const persisted = await this.loadDedupeSet(threadId);
      if (persisted.has(normalizedMessageId)) {
        this.logger.debug(
          `Message already processed (persisted), skipping: ${normalizedMessageId}`,
        );
        return;
      }

      // 关键点（中文）
      // - 先做“处理中”瞬时去重，避免平台短时间重复投递导致并发重复执行。
      // - 只有在命令执行 / 入队成功后，才真正写入 processed 持久去重。
      // - 这样如果后续链路失败，平台重投时仍有机会重新处理，不会出现“收到了但没反应”。
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
        let incomingAttachments: Array<{
          type: "document" | "photo" | "voice" | "audio" | "video";
          path: string;
          desc?: string;
        }> = [];
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
          incomingAttachments = await this.downloadIncomingAttachments({
            messageId: message_id,
            attachments: parsed.attachments,
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
          (await this.resolveSenderName({
            ...senderIdentity,
            chatId: chat_id,
          })) || undefined;
        const resolvedChatTitle = await this.resolveChatTitle(chat_id);
        const chatTitle =
          resolvedChatTitle ||
          (chat_type === "p2p" ? actorName : undefined);

        await this.observeIncomingAuthorization({
          chatId: chat_id,
          chatType: chat_type,
          chatTitle,
          userId: actorId,
          username: actorName,
        });

        const authResult = this.evaluateIncomingAuthorization({
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

        // Record this chat as a known notification target
        this.knownChats.set(threadId, {
          chatId: chat_id,
          chatType: chat_type,
          ...(chatTitle ? { chatTitle } : {}),
        });

        // Check if it's a command
        await this.runInChat(threadId, async () => {
          if (userMessage.startsWith("/") && incomingAttachments.length === 0) {
            await this.handleCommand(chat_id, chat_type, message_id, userMessage);
          } else {
            const attachmentLines = incomingAttachments.map((attachment) => {
              const rel = path.relative(this.rootPath, attachment.path);
              const desc = attachment.desc ? ` | ${attachment.desc}` : "";
              return `@attach ${attachment.type} ${rel}${desc}`;
            });

            if (this.isGroupChat(chat_type)) {
              userMessage = this.stripAtMentions(userMessage);
            }

            const instructions =
              [
                attachmentLines.length > 0 ? attachmentLines.join("\n") : undefined,
                userMessage ? userMessage.trim() : undefined,
              ]
                .filter(Boolean)
                .join("\n\n")
                .trim() ||
              (attachmentLines.length > 0
                ? `${attachmentLines.join("\n")}\n\n请查看以上附件。`
                : "");

            if (!instructions) return;

            // Regular message, call Agent to execute
            await this.executeAndReply(
              chat_id,
              chat_type,
              message_id,
              instructions,
              actorId,
              actorName,
              chatTitle,
            );
          }
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
        responseText =
          "📊 Agent status: Running\nTasks: 0\nPending approvals: 0";
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

  private async executeAndReply(
    chatId: string,
    chatType: string,
    messageId: string,
    instructions: string,
    actorId?: string,
    actorName?: string,
    chatTitle?: string,
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
   * 下载飞书入站附件并落到 `.ship/.cache/feishu`。
   *
   * 关键点（中文）
   * - 下载失败时仅跳过对应附件，不阻塞整条消息。
   * - 返回结果直接用于拼装 `@attach ...` 指令。
   */
  private async downloadIncomingAttachments(params: {
    messageId: string;
    attachments: FeishuIncomingAttachmentDescriptor[];
  }): Promise<
    Array<{
      type: "document" | "photo" | "voice" | "audio" | "video";
      path: string;
      desc?: string;
    }>
  > {
    if (!this.client || params.attachments.length === 0) return [];

    const dir = path.join(getCacheDirPath(this.rootPath), "feishu");
    await fs.ensureDir(dir);

    const out: Array<{
      type: "document" | "photo" | "voice" | "audio" | "video";
      path: string;
      desc?: string;
    }> = [];

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

  private async sendMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    const parsed = parseFeishuAttachments(text);
    await this.sendParsedMessage(chatId, chatType, messageId, parsed.text, parsed.attachments);
  }

  private async sendChatMessage(
    chatId: string,
    chatType: string,
    text: string,
  ): Promise<void> {
    const parsed = parseFeishuAttachments(text);
    await this.sendParsedMessage(chatId, chatType, undefined, parsed.text, parsed.attachments);
  }

  /**
   * 统一发送“正文 + 附件”。
   *
   * 关键点（中文）
   * - 附件语法来源于 `@attach` 行。
   * - 发送顺序为：正文 -> 附件 -> 附件说明（caption）。
   */
  private async sendParsedMessage(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    text: string,
    attachments: ParsedFeishuAttachmentCommand[],
  ): Promise<void> {
    const normalizedText = String(text || "").trim();
    if (normalizedText) {
      await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
        text: normalizedText,
      });
    }

    for (const attachment of attachments) {
      try {
        await this.sendAttachment(chatId, chatType, messageId, attachment);
      } catch (error) {
        await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
          text: `❌ Failed to send attachment: ${attachment.pathOrUrl}\n${String(error)}`,
        });
      }
    }
  }

  /**
   * 发送飞书文件附件。
   *
   * 关键点（中文）
   * - 当前统一走 `im/v1/files` 上传，再发送 `msg_type=file`。
   * - 路径支持项目相对路径和绝对路径，不支持远程 URL。
   */
  private async sendAttachment(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    attachment: ParsedFeishuAttachmentCommand,
  ): Promise<void> {
    const localPath = await this.resolveAttachmentLocalPath(attachment.pathOrUrl);
    const fileKey = await this.uploadFileToFeishu(localPath);
    await this.sendPlatformMessage(chatId, chatType, messageId, "file", {
      file_key: fileKey,
    });

    const caption = String(attachment.caption || "").trim();
    if (caption) {
      await this.sendPlatformMessage(chatId, chatType, messageId, "text", {
        text: caption,
      });
    }
  }

  /**
   * 解析 `@attach` 提供的本地路径。
   *
   * 关键点（中文）
   * - 远程 URL 暂不支持，避免隐式下载和额外安全风险。
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
   * 上传本地文件到飞书，返回 `file_key`。
   */
  private async uploadFileToFeishu(localPath: string): Promise<string> {
    const token = await this.getAppAccessToken();
    if (!token) {
      throw new Error("Failed to get Feishu tenant_access_token");
    }

    const domain = (this.domain || "https://open.feishu.cn").replace(/\/+$/, "");
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
   * 按 chat 类型发送指定消息体。
   *
   * 关键点（中文）
   * - p2p 或缺少 `messageId` 时走 `message.create`。
   * - 群聊且有 `messageId` 时优先走 `message.reply`。
   */
  private async sendPlatformMessage(
    chatId: string,
    chatType: string,
    messageId: string | undefined,
    msgType: FeishuMessagePayloadType,
    content: Record<string, unknown>,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Feishu client is not initialized");
    }
    try {
      if (chatType !== "p2p" && messageId) {
        await this.client.im.v1.message.reply({
          path: {
            message_id: messageId,
          },
          data: {
            content: JSON.stringify(content),
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
          content: JSON.stringify(content),
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

  private async sendErrorMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    errorText: string,
  ): Promise<void> {
    await this.sendMessage(chatId, chatType, messageId, `❌ ${errorText}`);
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    // Clean up timer
    if (this.messageCleanupInterval) {
      clearInterval(this.messageCleanupInterval);
      this.messageCleanupInterval = null;
    }

    // Clean up message cache
    this.processedMessages.clear();

    if (this.wsClient) {
      // Feishu SDK's WSClient doesn't have explicit stop method, just set status
      this.logger.info("Feishu Bot stopped");
    }
  }
}

export async function createFeishuBot(
  config: FeishuConfig,
  context: ServiceRuntime,
): Promise<FeishuBot | null> {
  if (!config.enabled || !config.appId || !config.appSecret) {
    return null;
  }

  const bot = new FeishuBot(
    context,
    config.appId,
    config.appSecret,
    config.domain,
  );
  return bot;
}
