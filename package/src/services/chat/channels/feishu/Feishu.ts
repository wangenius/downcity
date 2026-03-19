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

type FeishuTextContentPayload = {
  text?: string;
};

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

function sanitizeChatText(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(
    /(^|\n)Tool Result:[\s\S]*?(?=\n{2,}|$)/g,
    "\n[工具输出已省略：我已在后台读取并提炼关键信息]\n",
  );
  if (out.length > 6000) {
    out =
      out.slice(0, 5800) + "\n\n…[truncated]（如需完整输出请回复“发完整输出”）";
  }
  return out;
}

export class FeishuBot extends BaseChatChannel {
  private appId: string;
  private appSecret: string;
  private domain?: string;
  private client: Lark.Client | null = null;
  private wsClient: Lark.WSClient | null = null;
  private isRunning: boolean = false;
  private processedMessages: Set<string> = new Set(); // 用于消息去重
  private messageCleanupInterval: NodeJS.Timeout | null = null;
  private dedupeDir: string;
  private knownChats: Map<string, { chatId: string; chatType: string }> =
    new Map();

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
    const text = sanitizeChatText(String(params.text ?? ""));

    if (messageId && chatType !== "p2p") {
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

  private extractSenderId(data: FeishuMessageEvent): string | undefined {
    const sid =
      data?.sender?.sender_id?.user_id ||
      data?.sender?.sender_id?.open_id ||
      data?.sender?.sender_id?.union_id ||
      data?.sender?.sender_id?.chat_id;
    return sid ? String(sid) : undefined;
  }

  private parseTextContent(content: string): { text: string } {
    const parsed = JSON.parse(content) as FeishuTextContentPayload;
    const text = typeof parsed?.text === "string" ? parsed.text : "";
    return { text };
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
      const actorId = this.extractSenderId(data);

      // Message deduplication: check if this message has been processed
      if (this.processedMessages.has(message_id)) {
        this.logger.debug(`Message already processed, skipping: ${message_id}`);
        return;
      }

      // Persistent dedupe (best-effort)
      const persisted = await this.loadDedupeSet(threadId);
      if (persisted.has(message_id)) {
        this.logger.debug(
          `Message already processed (persisted), skipping: ${message_id}`,
        );
        return;
      }

      // Mark message as processed
      this.processedMessages.add(message_id);
      persisted.add(message_id);
      await this.persistDedupeSet(threadId, persisted);

      // Parse user message
      let userMessage = "";

      try {
        if (message_type === "text") {
          const parsed = this.parseTextContent(content);
          userMessage = parsed.text;
        } else {
          await this.sendErrorMessage(
            chat_id,
            chat_type,
            message_id,
            "Non-text messages not supported, please send text message",
          );
          return;
        }
      } catch (error) {
        await this.sendErrorMessage(
          chat_id,
          chat_type,
          message_id,
          "Failed to parse message, please send text message",
        );
        return;
      }

      this.logger.info(`Received Feishu message: ${userMessage}`);

      // Record this chat as a known notification target
      this.knownChats.set(threadId, { chatId: chat_id, chatType: chat_type });

      // Check if it's a command
      await this.runInChat(threadId, async () => {
        if (userMessage.startsWith("/")) {
          await this.handleCommand(chat_id, chat_type, message_id, userMessage);
        } else {
          if (this.isGroupChat(chat_type)) {
            userMessage = this.stripAtMentions(userMessage);
            if (!userMessage) return;
          }
          // Regular message, call Agent to execute
          await this.executeAndReply(
            chat_id,
            chat_type,
            message_id,
            userMessage,
            actorId,
          );
        }
      });
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
  ): Promise<void> {
    try {
      const { chatKey } = await this.enqueueMessage({
        chatId,
        text: instructions,
        chatType,
        messageId,
        userId: actorId,
      });

      this.knownChats.set(chatKey, { chatId, chatType });
    } catch (error) {
      await this.sendErrorMessage(
        chatId,
        chatType,
        messageId,
        `Execution error: ${String(error)}`,
      );
    }
  }

  private async sendMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    text: string,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn("Feishu client is not initialized");
      return;
    }
    try {
      if (chatType === "p2p") {
        // Private chat message, send directly
        await this.client.im.v1.message.create({
          params: {
            receive_id_type: "chat_id",
          },
          data: {
            receive_id: chatId,
            content: JSON.stringify({ text }),
            msg_type: "text",
          },
        });
      } else {
        // Group chat message, reply to original message
        await this.client.im.v1.message.reply({
          path: {
            message_id: messageId,
          },
          data: {
            content: JSON.stringify({ text }),
            msg_type: "text",
          },
        });
      }
    } catch (error) {
      this.logger.error("Failed to send Feishu message", {
        error: String(error),
      });
    }
  }

  private async sendChatMessage(
    chatId: string,
    chatType: string,
    text: string,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn("Feishu client is not initialized");
      return;
    }
    try {
      // Send directly to chat without needing to reply to a message
      await this.client.im.v1.message.create({
        params: {
          receive_id_type: "chat_id",
        },
        data: {
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: "text",
        },
      });
    } catch (error) {
      this.logger.error("Failed to send Feishu chat message", {
        error: String(error),
      });
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
