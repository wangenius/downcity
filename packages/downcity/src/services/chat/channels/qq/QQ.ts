import WebSocket, { type RawData } from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import { QqInboundDedupeStore } from "./QQInboundDedupe.js";
import {
  extractQqIncomingAttachments,
  resolveQqAttachmentLocalPath,
} from "./VoiceInput.js";
import {
  augmentChatInboundInput,
  buildChatInboundText,
} from "@services/chat/runtime/InboundAugment.js";
import type {
  ChannelChatKeyParams,
  ChannelSendTextParams,
} from "@services/chat/channels/BaseChatChannel.js";
import type { QqIncomingAttachment, QqRawInboundAttachment } from "@services/chat/types/QqVoice.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";

/**
 * QQ official bot adapter (WebSocket gateway).
 *
 * Responsibilities:
 * - Maintain WS connection + heartbeats + reconnection
 * - Translate inbound group/private messages into AgentRuntime runs
 * - Deliver outbound tool-strict replies via dispatcher + `chat_send`
 * - Persist inbound/outbound logs via UIMessage history through BaseChatChannel
 */

interface QQConfig {
  appId: string;
  appSecret: string;
  enabled: boolean;
  sandbox?: boolean; // 是否使用沙箱环境
}

type QQGatewayPayload = {
  op: number;
  d?: JsonObject;
  s?: number;
  t?: string;
};

type QQReadyUser = {
  id?: string;
  user_id?: string;
  openid?: string;
  user_openid?: string;
  username?: string;
  nickname?: string;
  name?: string;
  bot_name?: string;
  user?: {
    username?: string;
    nickname?: string;
    name?: string;
  };
};

type QQReadyData = {
  context_id?: string;
  user?: QQReadyUser;
};

type QQAuthor = {
  member_openid?: string;
  user_openid?: string;
  openid?: string;
  union_openid?: string;
  id?: string;
  user_id?: string;
  tiny_id?: string;
  member_tinyid?: string;
  user_tinyid?: string;
  uid?: string;
  nickname?: string;
  username?: string;
  name?: string;
  user?: {
    id?: string;
    user_id?: string;
    openid?: string;
    user_openid?: string;
    username?: string;
    nickname?: string;
    name?: string;
  };
  member_role?: string;
  role?: string;
  permissions?: string;
  permission?: string;
};

type QQMentionUser = {
  id?: string;
  user_id?: string;
  member_openid?: string;
  user_openid?: string;
};

type QQMessageReference = {
  message_id?: string;
  msg_id?: string;
  id?: string;
};

type QQReplyToMessage = {
  id?: string;
  author?: QQAuthor;
};

type QQMessageData = {
  id?: string;
  group_openid?: string;
  group_id?: string;
  group_code?: string;
  group_uin?: string;
  channel_id?: string;
  guild_id?: string;
  user_openid?: string;
  openid?: string;
  author_id?: string;
  content?: string;
  author?: QQAuthor;
  mentions?: QQMentionUser[];
  message_reference?: QQMessageReference;
  reference?: QQMessageReference;
  reply_to_message?: QQReplyToMessage;
  attachments?: QqRawInboundAttachment[] | string;
  files?: QqRawInboundAttachment[] | string;
  file_info?: QqRawInboundAttachment | QqRawInboundAttachment[] | string;
  file_infos?: QqRawInboundAttachment[] | string;
  media?: QqRawInboundAttachment | QqRawInboundAttachment[] | string;
  medias?: QqRawInboundAttachment[] | string;
  audio?: QqRawInboundAttachment | string;
  voice?: QqRawInboundAttachment | string;
};

type QQSendMessageBody = {
  content: string;
  msg_type: number;
  msg_id: string;
  msg_seq: number;
};

// QQ 官方机器人 WebSocket 操作码
enum OpCode {
  Dispatch = 0, // 服务端推送消息
  Heartbeat = 1, // 客户端发送心跳
  Identify = 2, // 客户端发送鉴权
  Resume = 6, // 客户端恢复连接
  Reconnect = 7, // 服务端通知重连
  InvalidContext = 9, // 无效的 context
  Hello = 10, // 服务端发送 hello
  HeartbeatAck = 11, // 服务端回复心跳
}

// 事件类型
const EventType = {
  READY: "READY",
  RESUMED: "RESUMED",
  // 群聊 @机器人 消息
  GROUP_AT_MESSAGE_CREATE: "GROUP_AT_MESSAGE_CREATE",
  // 群聊普通消息（若能力开通会下发）
  GROUP_MESSAGE_CREATE: "GROUP_MESSAGE_CREATE",
  // C2C 私聊消息
  C2C_MESSAGE_CREATE: "C2C_MESSAGE_CREATE",
  // 频道消息（可选支持）
  AT_MESSAGE_CREATE: "AT_MESSAGE_CREATE",
};

/**
 * QQ 平台适配器。
 *
 * 关键职责（中文）
 * - 维护 OAuth token + Gateway 连接生命周期
 * - 处理 WS 事件并映射为统一会话入站
 * - 按平台约束发送文本（群聊/C2C/频道）
 */
export class QQBot extends BaseChatChannel {
  private appId: string;
  private appSecret: string;
  private ws: WebSocket | null = null;
  private isRunning: boolean = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private wsContextId: string = "";
  private lastSeq: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private heartbeatIntervalMs: number = 30000;
  private lastHeartbeatSentAtMs: number = 0;
  private lastHeartbeatAckAtMs: number = 0;
  private pendingHeartbeatSinceMs: number = 0;
  private wsReadyAtMs: number = 0;
  private readonly sendRequestTimeoutMs: number = 15000;
  private readonly sendMaxAttempts: number = 3;

  // 缓存的 access_token 和过期时间
  private accessToken: string = "";
  private accessTokenExpires: number = 0;

  // API 基础地址
  // 鉴权 API 使用 bots.qq.com
  // 其他 API 使用 api.sgroup.qq.com
  private readonly AUTH_API_BASE = "https://bots.qq.com";
  private readonly API_BASE = "https://api.sgroup.qq.com";
  private readonly SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";

  // 是否使用沙箱环境
  private useSandbox: boolean = false;
  private msgSeqByMessageKey: Map<string, number> = new Map();
  private readonly qqEventCapture: QQEventCaptureConfig;
  private readonly inboundDedupeStore: QqInboundDedupeStore;
  /**
   * 机器人自身的 userId（从 READY 事件里捕获）。
   *
   * 关键点（中文）
   * - 部分平台/事件流可能会把机器人自己发出的消息也作为入站事件推回来。
   * - 如果不做过滤，可能出现“自己回复自己”导致的无限循环刷屏。
   */
  private botUserId: string = "";
  /**
   * 机器人展示名（从 READY 事件里捕获）。
   *
   * 关键点（中文）
   * - Console UI 优先展示该字段，避免退化为 appId。
   */
  private botDisplayName: string = "";

  constructor(
    context: ServiceRuntime,
    appId: string,
    appSecret: string,
    useSandbox: boolean = false,
  ) {
    super({ channel: "qq", context });
    this.appId = appId;
    this.appSecret = appSecret;
    this.useSandbox = useSandbox;
    this.qqEventCapture = getQqEventCaptureConfig(this.rootPath);
    this.inboundDedupeStore = new QqInboundDedupeStore({
      rootPath: this.rootPath,
      logger: this.logger,
    });
  }

  protected getChatKey(params: ChannelChatKeyParams): string {
    const chatType =
      typeof params.chatType === "string" && params.chatType
        ? params.chatType
        : "unknown";
    return `qq-${chatType}-${params.chatId}`;
  }

  protected async sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const chatType = typeof params.chatType === "string" ? params.chatType : "";
    const messageId =
      typeof params.messageId === "string" ? params.messageId : "";
    if (!chatType || !messageId) {
      throw new Error("QQ requires chatType + messageId to send a reply");
    }

    const key = `${chatType}:${params.chatId}:${messageId}`;
    const nextSeq = (this.msgSeqByMessageKey.get(key) ?? 0) + 1;
    this.msgSeqByMessageKey.set(key, nextSeq);
    await this.sendMessage(
      params.chatId,
      chatType,
      messageId,
      String(params.text ?? ""),
      nextSeq,
    );
  }

  /**
   * 获取当前使用的 API 基础地址
   */
  private getApiBase(): string {
    return this.useSandbox ? this.SANDBOX_API_BASE : this.API_BASE;
  }

  /**
   * 获取 WebSocket Gateway 地址
   */
  private getWsGateway(): string {
    return this.useSandbox
      ? "wss://sandbox.api.sgroup.qq.com/websocket"
      : "wss://api.sgroup.qq.com/websocket";
  }

  /**
   * 获取鉴权 Token (支持新版 API v2)
   * 新版 API 需要先获取 access_token
   * 注意：鉴权 API 使用 bots.qq.com 域名
   */
  /**
   * 获取并缓存 Access Token。
   *
   * 说明（中文）
   * - 使用过期时间戳做本地缓存，避免每次请求都换 token
   * - 异常直接上抛，由上层启动/重连流程统一处理
   */
  private async getAccessToken(): Promise<string> {
    // 如果缓存的 token 还有效（提前 60 秒刷新）
    if (this.accessToken && Date.now() < this.accessTokenExpires - 60000) {
      return this.accessToken;
    }

    try {
      // 鉴权 API 使用 bots.qq.com 域名
      const authApiBase = this.AUTH_API_BASE;
      this.logger.info(`正在获取 Access Token... (API: ${authApiBase})`);

      const requestBody = {
        appId: this.appId,
        clientSecret: this.appSecret,
      };
      this.logger.debug(`请求体: ${JSON.stringify(requestBody)}`);

      const response = await fetch(`${authApiBase}/app/getAppAccessToken`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      this.logger.info(`Access Token 响应状态: ${response.status}`);
      this.logger.debug(`Access Token 响应内容: ${responseText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText) as {
        access_token?: string;
        expires_in?: number;
        code?: number;
        message?: string;
      };

      // 检查是否有错误
      if (data.code && data.code !== 0) {
        throw new Error(`API 错误 ${data.code}: ${data.message}`);
      }

      if (!data.access_token) {
        throw new Error(`响应中没有 access_token: ${responseText}`);
      }

      this.accessToken = data.access_token;
      // expires_in 是秒数，转换为毫秒时间戳
      this.accessTokenExpires = Date.now() + (data.expires_in || 7200) * 1000;

      this.logger.info(
        `Access Token 获取成功，有效期: ${data.expires_in || 7200} 秒`,
      );
      return this.accessToken;
    } catch (error) {
      this.logger.error(`获取 Access Token 失败: ${String(error)}`);
      throw error;
    }
  }

  /**
   * 获取 WebSocket Gateway 地址
   * 调用 GET /gateway 接口获取
   */
  private async getGatewayUrl(): Promise<string> {
    // 关键点（中文）：鉴权失败属于“不可恢复配置错误”，必须直接上抛，
    // 不能回退到默认 gateway；否则会出现反复 WS 重连与误导性日志。
    const apiBase = this.getApiBase();
    const authToken = await this.getAuthToken();

    try {
      this.logger.info(`正在获取 Gateway 地址... (API: ${apiBase})`);

      // 使用 GET /gateway 接口获取 gateway 地址
      const response = await fetch(`${apiBase}/gateway`, {
        method: "GET",
        headers: {
          Authorization: authToken,
        },
      });

      const responseText = await response.text();
      this.logger.info(`Gateway 响应状态: ${response.status}`);
      this.logger.debug(`Gateway 响应内容: ${responseText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${responseText}`);
      }

      const data = JSON.parse(responseText) as {
        url?: string;
        code?: number;
        message?: string;
      };

      // 检查是否有错误
      if (data.code && data.code !== 0) {
        throw new Error(`API 错误 ${data.code}: ${data.message}`);
      }

      if (!data.url) {
        throw new Error(`响应中没有 gateway url: ${responseText}`);
      }

      this.logger.info(`Gateway 地址: ${data.url}`);
      return data.url;
    } catch (error) {
      this.logger.error(`获取 Gateway 地址失败: ${String(error)}`);
      // 如果获取失败，回退到默认地址
      const fallbackUrl = this.getWsGateway();
      this.logger.warn(`使用默认 Gateway 地址: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }

  /**
   * 获取鉴权字符串
   * 只使用新版 API v2: "QQBot {access_token}"
   * Token 已弃用
   */
  private async getAuthToken(): Promise<string> {
    const accessToken = await this.getAccessToken();
    return `QQBot ${accessToken}`;
  }

  /**
   * 计算心跳 ACK 超时阈值（毫秒）。
   *
   * 关键点（中文）
   * - 至少给 45s 容忍，避免短时抖动误判。
   * - 同时按网关 heartbeat 间隔的 3 倍动态放宽。
   */
  private getHeartbeatAckTimeoutMs(): number {
    return Math.max(this.heartbeatIntervalMs * 3, 45000);
  }

  /**
   * 当前 WS 链路是否发生“心跳未确认超时”。
   */
  private hasHeartbeatTimeout(nowMs: number = Date.now()): boolean {
    if (!this.pendingHeartbeatSinceMs) return false;
    return nowMs - this.pendingHeartbeatSinceMs > this.getHeartbeatAckTimeoutMs();
  }

  /**
   * 心跳是否处于健康状态。
   *
   * 关键点（中文）
   * - READY 前不认为健康，避免把“仅 TCP 连接成功”误判成业务可用。
   */
  private hasHealthyHeartbeat(nowMs: number = Date.now()): boolean {
    if (!this.wsReadyAtMs) return false;
    if (!this.pendingHeartbeatSinceMs) return true;
    return !this.hasHeartbeatTimeout(nowMs);
  }

  /**
   * 重置 WS 活性指标。
   */
  private resetWsLivenessState(): void {
    this.wsContextId = "";
    this.lastSeq = 0;
    this.wsReadyAtMs = 0;
    this.lastHeartbeatSentAtMs = 0;
    this.lastHeartbeatAckAtMs = 0;
    this.pendingHeartbeatSinceMs = 0;
  }

  /**
   * 清理重连定时器。
   */
  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  /**
   * 计划一次重连（支持立即重连）。
   *
   * 关键点（中文）
   * - 防抖：默认同一时刻只保留一个重连任务。
   * - immediate 场景（如发送失败）可覆盖已有延迟重连。
   */
  private scheduleReconnect(reason: string, delayMs?: number): void {
    if (!this.isRunning) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("QQ 重连次数已达上限，停止自动重连", {
        reason,
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
      });
      return;
    }

    const delay =
      typeof delayMs === "number" && Number.isFinite(delayMs)
        ? Math.max(0, Math.trunc(delayMs))
        : 5000 * (this.reconnectAttempts + 1);

    if (this.reconnectTimer) {
      if (delay > 0) return;
      this.clearReconnectTimer();
    }

    this.reconnectAttempts += 1;
    const attempt = this.reconnectAttempts;
    this.logger.info(
      `QQ 准备重连（原因: ${reason}，第 ${attempt}/${this.maxReconnectAttempts} 次），${delay / 1000} 秒后执行`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isRunning) return;
      try {
        // 关键点（中文）：重连前清空 token 缓存，避免沿用过期凭据。
        this.accessToken = "";
        this.accessTokenExpires = 0;
        const newGatewayUrl = await this.getGatewayUrl();
        await this.connectWebSocket(newGatewayUrl);
      } catch (error) {
        this.logger.error("QQ 重连失败", { error: String(error), reason });
        this.scheduleReconnect("reconnect_failed");
      }
    }, delay);
  }

  /**
   * 关闭当前 WS，交由 close 回调统一走重连流程。
   */
  private closeSocketForRecovery(reason: string): void {
    const ws = this.ws;
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) {
      return;
    }
    this.logger.warn(`触发 QQ 链路自愈关闭: ${reason}`);
    try {
      ws.close();
    } catch (error) {
      this.logger.debug("关闭 QQ WebSocket 失败（忽略）", {
        error: String(error),
        reason,
      });
    }
  }

  /**
   * 读取 QQ runtime 快照。
   *
   * 关键点（中文）
   * - `connected` 必须同时满足：WS 打开 + READY 完成 + 心跳 ACK 健康。
   * - 避免“socket 还开着但链路已僵死”的假在线状态。
   */
  getRuntimeStatus(): {
    running: boolean;
    linkState: "connected" | "disconnected" | "unknown";
    statusText: string;
    detail: Record<string, string | number | boolean | null>;
  } {
    const now = Date.now();
    const readyState = typeof this.ws?.readyState === "number" ? this.ws.readyState : null;
    const isOpen = readyState === WebSocket.OPEN;
    const running = this.isRunning;
    const hasContext = Boolean(String(this.wsContextId || "").trim());
    const heartbeatHealthy = this.hasHealthyHeartbeat(now);
    const heartbeatTimedOut = this.hasHeartbeatTimeout(now);
    const linkState =
      !running
        ? "disconnected"
        : isOpen && hasContext && heartbeatHealthy
          ? "connected"
          : "unknown";

    const statusText = !running
      ? "stopped"
      : !isOpen
        ? "connecting"
        : !hasContext
          ? "ws_open_wait_ready"
          : heartbeatTimedOut
            ? "heartbeat_timeout"
            : heartbeatHealthy
              ? "ws_online"
              : "ws_open_wait_heartbeat";

    return {
      running,
      linkState,
      statusText,
      detail: {
        appId: this.appId || null,
        botName: this.botDisplayName || null,
        botUserId: this.botUserId || null,
        wsReadyState: readyState,
        wsContextId: this.wsContextId || null,
        wsReadyAtMs: this.wsReadyAtMs || null,
        heartbeatHealthy,
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        heartbeatAckTimeoutMs: this.getHeartbeatAckTimeoutMs(),
        lastHeartbeatSentAtMs: this.lastHeartbeatSentAtMs || null,
        lastHeartbeatAckAtMs: this.lastHeartbeatAckAtMs || null,
        pendingHeartbeatSinceMs: this.pendingHeartbeatSinceMs || null,
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
        reconnectScheduled: Boolean(this.reconnectTimer),
        sandbox: this.useSandbox,
      },
    };
  }

  /**
   * 执行 QQ 连通性测试。
   *
   * 关键点（中文）
   * - 测试会同时验证 access_token 获取与 `/gateway` API 可达。
   */
  async testConnection(): Promise<ChatChannelTestResult> {
    const startedAt = Date.now();
    if (!this.appId || !this.appSecret) {
      return {
        channel: "qq",
        success: false,
        testedAtMs: startedAt,
        message: "App credentials are missing",
      };
    }

    try {
      const authToken = await this.getAuthToken();
      const apiBase = this.getApiBase();
      const response = await fetch(`${apiBase}/gateway`, {
        method: "GET",
        headers: {
          Authorization: authToken,
        },
      });
      const raw = await response.text();
      const now = Date.now();
      let code: number | undefined;
      try {
        const parsed = JSON.parse(raw) as { code?: number };
        code = typeof parsed.code === "number" ? parsed.code : undefined;
      } catch {
        // ignore parse error
      }

      if (response.ok && (code === 0 || code === undefined)) {
        const runtime = this.getRuntimeStatus();
        if (runtime.linkState !== "connected") {
          // 关键点（中文）：命中心跳超时时立刻触发一次自愈重连。
          if (runtime.statusText === "heartbeat_timeout") {
            this.scheduleReconnect("test_detected_heartbeat_timeout", 0);
          }
          return {
            channel: "qq",
            success: false,
            testedAtMs: now,
            latencyMs: now - startedAt,
            message: `QQ Open API reachable, but WS is not ready (${runtime.statusText})`,
            detail: {
              httpStatus: response.status,
              code: code ?? null,
              sandbox: this.useSandbox,
              linkState: runtime.linkState,
              statusText: runtime.statusText,
              botName: this.botDisplayName || null,
            },
          };
        }
        return {
          channel: "qq",
          success: true,
          testedAtMs: now,
          latencyMs: now - startedAt,
          message: "Connected to QQ Open API",
          detail: {
            httpStatus: response.status,
            code: code ?? null,
            sandbox: this.useSandbox,
            linkState: runtime.linkState,
            statusText: runtime.statusText,
            botName: this.botDisplayName || null,
          },
        };
      }
      return {
        channel: "qq",
        success: false,
        testedAtMs: now,
        latencyMs: now - startedAt,
        message: `QQ API check failed: HTTP ${response.status}`,
        detail: {
          httpStatus: response.status,
          code: code ?? null,
          sandbox: this.useSandbox,
        },
      };
    } catch (error) {
      const now = Date.now();
      return {
        channel: "qq",
        success: false,
        testedAtMs: now,
        latencyMs: now - startedAt,
        message: `QQ API check failed: ${String(error)}`,
        detail: {
          sandbox: this.useSandbox,
        },
      };
    }
  }

  /**
   * 启动机器人
   */
  async start(): Promise<void> {
    if (!this.appId || !this.appSecret) {
      this.logger.warn(
        "QQ 机器人配置不完整（需要 appId 和 appSecret），跳过启动",
      );
      return;
    }

    // 防止重复启动
    if (this.isRunning) {
      this.logger.warn("QQ Bot 已在运行中，跳过重复启动");
      return;
    }

    this.isRunning = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.resetWsLivenessState();
    this.logger.info("🤖 正在启动 QQ 机器人...");
    this.logger.info(`   AppID: ${this.appId}`);
    this.logger.info(`   沙箱模式: ${this.useSandbox ? "是" : "否"}`);

    try {
      // 关键点（中文）：先加载本地去重快照，避免重启后重复消费历史消息。
      await this.inboundDedupeStore.load();

      // 获取 Gateway 地址
      const gatewayUrl = await this.getGatewayUrl();

      // 连接 WebSocket（不再需要传递 authToken）
      await this.connectWebSocket(gatewayUrl);
    } catch (error) {
      this.logger.error("启动 QQ Bot 失败", { error: String(error) });
      this.isRunning = false;
    }
  }

  /**
   * 连接 WebSocket
   */
  /**
   * 建立 Gateway WebSocket 连接并接管事件循环。
   *
   * 说明（中文）
   * - `open` 到达后 resolve，避免启动阶段被早期 close 卡死
   * - close 时按退避策略重连，并重置 token 缓存
   */
  private async connectWebSocket(gatewayUrl: string): Promise<void> {
    this.logger.info(`正在连接 WebSocket: ${gatewayUrl}`);
    const previousWs = this.ws;
    if (
      previousWs &&
      (previousWs.readyState === WebSocket.OPEN ||
        previousWs.readyState === WebSocket.CONNECTING)
    ) {
      try {
        previousWs.close();
      } catch {
        // ignore close failure
      }
    }
    this.stopHeartbeat();
    this.resetWsLivenessState();

    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const ws = new WebSocket(gatewayUrl);
      this.ws = ws;

      ws.on("open", () => {
        if (this.ws !== ws) return;
        this.logger.info("WebSocket 连接已建立");
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.resetWsLivenessState();
        resolveOnce();
      });

      ws.on("message", async (data: RawData) => {
        if (this.ws !== ws) return;
        try {
          const payload = this.parseGatewayPayload(data);
          if (!payload) {
            this.logger.warn("收到无法解析的 QQ WebSocket 消息，已忽略");
            return;
          }
          this.logger.debug(
            `收到 WebSocket 消息: op=${payload.op}, t=${payload.t || "N/A"}`,
          );
          await this.captureIncomingWsPayload(payload);
          await this.handleWebSocketMessage(payload);
        } catch (error) {
          this.logger.error("处理 WebSocket 消息失败", {
            error: String(error),
          });
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        if (this.ws !== ws) return;
        const reasonText = Buffer.isBuffer(reason)
          ? reason.toString("utf-8")
          : String(reason || "");
        this.logger.warn(`WebSocket 连接关闭: ${code} - ${reasonText}`);
        this.ws = null;
        this.stopHeartbeat();
        this.resetWsLivenessState();
        this.scheduleReconnect(`ws_closed:${code}`);
        rejectOnce(
          new Error(`QQ websocket closed before ready: ${code} ${reasonText}`),
        );
      });

      ws.on("error", (error: Error) => {
        if (this.ws !== ws) return;
        this.logger.error("WebSocket 错误", { error: String(error) });
        rejectOnce(error);
      });
    });
  }

  /**
   * 处理 WebSocket 消息
   */
  private parseGatewayPayload(rawData: RawData): QQGatewayPayload | null {
    try {
      const text = Buffer.isBuffer(rawData)
        ? rawData.toString("utf-8")
        : Array.isArray(rawData)
          ? Buffer.concat(rawData).toString("utf-8")
          : typeof rawData === "string"
            ? rawData
            : Buffer.from(rawData).toString("utf-8");
      const parsed = JSON.parse(text) as JsonValue;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return null;
      const obj = parsed as JsonObject;
      const op = typeof obj.op === "number" ? obj.op : Number(obj.op);
      if (!Number.isFinite(op)) return null;
      const payload: QQGatewayPayload = {
        op,
        ...(obj.d && typeof obj.d === "object" && !Array.isArray(obj.d)
          ? { d: obj.d as JsonObject }
          : {}),
        ...(typeof obj.s === "number" ? { s: obj.s } : {}),
        ...(typeof obj.t === "string" ? { t: obj.t } : {}),
      };
      return payload;
    } catch {
      return null;
    }
  }

  private async handleWebSocketMessage(
    payload: QQGatewayPayload,
  ): Promise<void> {
    const { op, d, s, t } = payload;

    // 更新序列号
    if (s) {
      this.lastSeq = s;
    }

    switch (op) {
      case OpCode.Hello:
        // 收到 Hello，发送鉴权
        const heartbeatIntervalMs =
          typeof d?.heartbeat_interval === "number"
            ? d.heartbeat_interval
            : 30000;
        this.startHeartbeat(heartbeatIntervalMs);
        await this.sendIdentify();
        break;

      case OpCode.Dispatch:
        // 处理事件分发
        await this.handleDispatch(String(t || ""), d || {});
        break;

      case OpCode.HeartbeatAck:
        this.lastHeartbeatAckAtMs = Date.now();
        this.pendingHeartbeatSinceMs = 0;
        this.logger.debug("收到心跳响应");
        break;

      case OpCode.Reconnect:
        this.logger.warn("服务端要求重连");
        this.closeSocketForRecovery("server_reconnect_opcode");
        break;

      case OpCode.InvalidContext:
        this.logger.error("无效的 Context，需要重新鉴权");
        // 清除缓存的 token，强制重新获取
        this.accessToken = "";
        this.accessTokenExpires = 0;
        // 等待一段时间后重新鉴权
        setTimeout(async () => {
          try {
            await this.sendIdentify();
          } catch (error) {
            this.logger.error("重新鉴权失败", { error: String(error) });
          }
        }, 2000);
        break;
    }
  }

  /**
   * Persist raw WS payloads to disk for debugging.
   *
   * Why:
   * - QQ events often omit human-friendly usernames/nicknames unless you enable
   *   extra permissions or call additional profile APIs. Capturing the raw
   *   gateway payload helps verify what fields are actually present.
   *
   * How:
   * - Enable via env:
   *   - `SHIP_QQ_CAPTURE_EVENTS=dispatch|all`
   *   - `SHIP_QQ_CAPTURE_DIR=/abs/or/relative/path` (optional)
   * - Files are written as JSON snapshots with a timestamp-based filename.
   */
  private async captureIncomingWsPayload(
    payload: QQGatewayPayload,
  ): Promise<void> {
    if (!this.qqEventCapture.enabled) return;

    const op = payload.op;
    if (this.qqEventCapture.mode === "dispatch" && op !== OpCode.Dispatch) {
      return;
    }

    try {
      const safeTag = sanitizeFileTag(`${String(payload.t ?? "N/A")}`);
      const safeOp = sanitizeFileTag(`${String(op ?? "unknown")}`);
      const safeSeq = sanitizeFileTag(`${String(payload.s ?? "")}`);
      const filename = `${Date.now()}_${safeOp}_${safeTag}${safeSeq ? `_${safeSeq}` : ""}.json`;

      await mkdir(this.qqEventCapture.dir, { recursive: true });
      await writeFile(
        join(this.qqEventCapture.dir, filename),
        JSON.stringify(
          {
            receivedAt: new Date().toISOString(),
            payload,
          },
          null,
          2,
        ),
        "utf-8",
      );
    } catch (error) {
      this.logger.debug("QQ event capture failed (ignored)", {
        error: String(error),
      });
    }
  }

  /**
   * 发送鉴权 (Identify)
   * 根据文档，token 字段直接传 "QQBot {access_token}" 格式
   */
  private async sendIdentify(): Promise<void> {
    // 实时获取最新的 authToken
    const authToken = await this.getAuthToken();

    const intents = this.getIntents();
    this.logger.info(`发送鉴权请求 (Identify)，intents: ${intents}`);

    // 根据官方文档，Identify payload 格式
    const identifyPayload = {
      op: OpCode.Identify,
      d: {
        token: authToken, // "QQBot {access_token}" 格式
        intents: intents,
        shard: [0, 1], // [当前分片, 总分片数]
        properties: {
          $os: "linux",
          $browser: "downcity",
          $device: "downcity",
        },
      },
    };

    this.logger.debug(`Identify payload: ${JSON.stringify(identifyPayload)}`);
    this.ws?.send(JSON.stringify(identifyPayload));
    this.logger.info("已发送鉴权请求");
  }

  /**
   * 获取订阅的事件类型
   * 参考: https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html
   */
  private getIntents(): number {
    // Intents 是一个位掩码，用于订阅不同类型的事件
    //
    // 群聊和 C2C 相关:
    // - GROUP_AND_C2C_EVENT (1 << 25) = 33554432 - 群聊和C2C消息事件
    //
    // 频道相关 (如果需要):
    // - GUILDS (1 << 0) = 1 - 频道事件
    // - GUILD_MEMBERS (1 << 1) = 2 - 频道成员事件
    // - GUILD_MESSAGES (1 << 9) = 512 - 私域消息（需要申请）
    // - GUILD_MESSAGE_REACTIONS (1 << 10) = 1024 - 消息表态
    // - DIRECT_MESSAGE (1 << 12) = 4096 - 私信事件
    // - INTERACTION (1 << 26) = 67108864 - 互动事件
    // - MESSAGE_AUDIT (1 << 27) = 134217728 - 消息审核
    // - AUDIO_ACTION (1 << 29) = 536870912 - 音频事件
    // - PUBLIC_GUILD_MESSAGES (1 << 30) = 1073741824 - 公域消息

    // 群聊和 C2C 消息
    const GROUP_AND_C2C_EVENT = 1 << 25;
    // 语音/音频事件（用于 voice plugin 转写链路）
    const AUDIO_ACTION = 1 << 29;

    // 返回需要订阅的 intents
    return GROUP_AND_C2C_EVENT | AUDIO_ACTION;
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatIntervalMs =
      Number.isFinite(intervalMs) && intervalMs > 0 ? Math.trunc(intervalMs) : 30000;
    this.pendingHeartbeatSinceMs = 0;
    this.lastHeartbeatSentAtMs = 0;

    // 关键点（中文）：握手后立即发送一次心跳，尽快建立活性基线。
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * 发送一次心跳，并检测 ACK 超时。
   *
   * 关键点（中文）
   * - 一旦超过阈值未收到 ACK，主动断开 WS 触发重连，避免“假连接”。
   */
  private sendHeartbeat(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (this.hasHeartbeatTimeout(now)) {
      this.logger.warn("QQ 心跳 ACK 超时，准备重连", {
        pendingHeartbeatSinceMs: this.pendingHeartbeatSinceMs,
        heartbeatAckTimeoutMs: this.getHeartbeatAckTimeoutMs(),
      });
      this.closeSocketForRecovery("heartbeat_ack_timeout");
      return;
    }

    const heartbeatPayload = {
      op: OpCode.Heartbeat,
      d: this.lastSeq || null,
    };
    try {
      ws.send(JSON.stringify(heartbeatPayload));
      this.lastHeartbeatSentAtMs = now;
      if (!this.pendingHeartbeatSinceMs) {
        this.pendingHeartbeatSinceMs = now;
      }
      this.logger.debug("发送心跳");
    } catch (error) {
      this.logger.warn("发送 QQ 心跳失败，准备重连", {
        error: String(error),
      });
      this.closeSocketForRecovery("heartbeat_send_failed");
    }
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 处理事件分发
   */
  /**
   * 处理 Dispatch 事件总入口。
   *
   * 说明（中文）
   * - 只在此处分发到各类消息处理器，保持事件路由单一出口
   * - 未识别事件仅 debug 记录，不阻断连接
   */
  private async handleDispatch(
    eventType: string,
    data: JsonObject,
  ): Promise<void> {
    this.logger.info(`收到事件: ${eventType}`);

    switch (eventType) {
      case EventType.READY:
        this.wsContextId =
          typeof data.context_id === "string" ? data.context_id : "";
        this.wsReadyAtMs = Date.now();
        this.logger.info(`QQ Bot 已就绪，WS Context ID: ${this.wsContextId}`);
        const readyUser =
          data.user &&
          typeof data.user === "object" &&
          !Array.isArray(data.user)
            ? (data.user as QQReadyUser)
            : undefined;
        this.botDisplayName = [
          readyUser?.username,
          readyUser?.nickname,
          readyUser?.name,
          readyUser?.bot_name,
          readyUser?.user?.username,
          readyUser?.user?.nickname,
          readyUser?.user?.name,
        ]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find(Boolean) || "";
        this.logger.info(`用户: ${this.botDisplayName || "N/A"}`);
        // best-effort：记录 bot 自己的 userId，供入站过滤使用
        this.botUserId =
          typeof readyUser?.id === "string"
            ? readyUser.id.trim()
            : typeof readyUser?.user_id === "string"
              ? readyUser.user_id.trim()
              : typeof readyUser?.user_openid === "string"
                ? readyUser.user_openid.trim()
                : typeof readyUser?.openid === "string"
                  ? readyUser.openid.trim()
              : "";
        break;

      case EventType.RESUMED:
        this.wsReadyAtMs = Date.now();
        this.logger.info("连接已恢复");
        break;

      case EventType.GROUP_AT_MESSAGE_CREATE:
        // 群聊 @机器人 消息
        await this.handleGroupMessage({
          eventType: EventType.GROUP_AT_MESSAGE_CREATE,
          data: data as QQMessageData,
        });
        break;

      case EventType.GROUP_MESSAGE_CREATE:
        // 群聊普通消息（非空内容默认可触发）
        await this.handleGroupMessage({
          eventType: EventType.GROUP_MESSAGE_CREATE,
          data: data as QQMessageData,
        });
        break;

      case EventType.C2C_MESSAGE_CREATE:
        // C2C 私聊消息
        await this.handleC2CMessage(data as QQMessageData);
        break;

      case EventType.AT_MESSAGE_CREATE:
        // 频道消息（可选）
        await this.handleChannelMessage(data as QQMessageData);
        break;

      default:
        this.logger.debug(`未处理的事件类型: ${eventType}`);
    }
  }

  /**
   * 处理群聊消息
   */
  private async handleGroupMessage(params: {
    eventType: string;
    data: QQMessageData;
  }): Promise<void> {
    const eventType = String(params.eventType || "").trim();
    const data = params.data;
    const messageId =
      typeof data.id === "string" ? data.id.trim() : String(data.id || "").trim();
    if (!messageId) return;
    const groupId = [
      data.group_openid,
      data.group_id,
      data.group_code,
      data.group_uin,
      data.channel_id,
      data.guild_id,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean) || "";
    if (!groupId) {
      this.logger.warn("QQ 群消息缺少 groupId，已忽略", {
        eventType: eventType || EventType.GROUP_MESSAGE_CREATE,
        messageId,
      });
      return;
    }

    await this.handleInboundMessage({
      eventType: eventType || EventType.GROUP_MESSAGE_CREATE,
      chatId: groupId,
      chatType: "group",
      data,
    });
  }

  /**
   * 处理 C2C 私聊消息
   */
  private async handleC2CMessage(data: QQMessageData): Promise<void> {
    const messageId =
      typeof data.id === "string" ? data.id.trim() : String(data.id || "").trim();
    if (!messageId) return;

    const actor = this.extractAuthorIdentity(data.author, data);
    const chatId = [
      actor.userId,
      data.user_openid,
      data.openid,
      data.author_id,
      data.author?.user_openid,
      data.author?.member_openid,
      data.author?.openid,
      data.author?.id,
      data.author?.user_id,
      data.author?.user?.user_openid,
      data.author?.user?.openid,
      data.author?.user?.id,
      data.author?.user?.user_id,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean) || "";
    if (!chatId) {
      this.logger.warn("QQ C2C 消息缺少 userId，已忽略", {
        eventType: EventType.C2C_MESSAGE_CREATE,
        messageId,
      });
      return;
    }

    await this.handleInboundMessage({
      eventType: EventType.C2C_MESSAGE_CREATE,
      chatId,
      chatType: "c2c",
      data,
      actor,
    });
  }

  /**
   * QQ 入站主流程（对齐 Telegram 处理顺序）。
   *
   * 关键点（中文）
   * - 群聊与私聊复用同一条主逻辑，统一采用“非空消息即触发”。
   * - 保持“审计入队”和“执行触发”解耦，避免历史断层。
   */
  private async handleInboundMessage(params: {
    eventType: string;
    chatId: string;
    chatType: "group" | "c2c";
    data: QQMessageData;
    actor?: { userId?: string; username?: string };
  }): Promise<void> {
    const eventType = String(params.eventType || "").trim();
    const chatId = String(params.chatId || "").trim();
    const messageId =
      typeof params.data.id === "string"
        ? params.data.id.trim()
        : String(params.data.id || "").trim();
    if (!chatId || !messageId) return;

    if (await this.shouldSkipDuplicatedInboundMessage(eventType, messageId)) {
      return;
    }

    const actor = params.actor || this.extractAuthorIdentity(params.data.author, params.data);
    const chatType = params.chatType;
    if (!actor.userId) {
      this.logger.warn("QQ 入站消息缺少发送者 userId，已忽略", {
        eventType,
        chatId,
        chatType,
        messageId,
      });
      return;
    }
    const chatTitle = this.resolveInboundChatTitle({
      chatType,
      data: params.data,
      actorName: actor.username,
    });
    const isGroup = chatType === "group";
    const chatKey = this.getChatKey({ chatId, chatType });
    const rawContent = String(params.data.content || "");
    const incomingAttachments = this.extractIncomingAttachments(params.data);
    const hasIncomingAttachment = incomingAttachments.length > 0;
    const cleanedText = isGroup
      ? this.stripBotMention(rawContent)
      : this.extractTextContent(rawContent);

    await this.observeIncomingAuthorization({
      chatId,
      chatType,
      chatTitle,
      userId: actor.userId,
      username: actor.username,
    });

    const authResult = await this.evaluateIncomingAuthorization({
      chatId,
      chatType,
      chatTitle,
      userId: actor.userId,
      username: actor.username,
    });
    if (authResult.decision !== "allow") {
      if (!isGroup) {
        await this.sendAuthorizationText({
          chatId,
          chatType,
          text: this.buildUnauthorizedBlockedText(),
        });
      }
      return;
    }

    const enqueueAudit = async (opts: { reason: string; kind?: string }): Promise<void> => {
      await this.enqueueAuditMessage({
        chatId,
        messageId,
        userId: actor.userId,
        text: this.buildAuditText({
          rawContent,
          cleanedText,
          hasIncomingAttachment,
        }),
        meta: {
          chatType,
          username: actor.username,
          chatTitle,
          eventType,
          reason: opts.reason,
          ...(opts.kind ? { kind: opts.kind } : {}),
        },
      });
    };

    if (actor.userId && this.botUserId && actor.userId === this.botUserId) {
      if (isGroup) {
        await enqueueAudit({ reason: "bot_originated" });
      }
      this.logger.debug("忽略机器人自身消息", {
        messageId,
        chatId,
        chatType,
        botUserId: this.botUserId,
      });
      return;
    }

    this.logger.info(`收到 ${chatType} 消息 [${chatId}]: ${cleanedText}`);

    // 与 Telegram 对齐：纯空 payload（既无文本也无附件）直接忽略。
    if (!rawContent && !hasIncomingAttachment) {
      if (isGroup) {
        await enqueueAudit({ reason: "empty_payload" });
      }
      return;
    }

    // 命令路径：与 Telegram 对齐，命令消息也入审计流。
    if (cleanedText.startsWith("/")) {
      await enqueueAudit({
        reason: "command_received",
        kind: "command",
      });

      await this.handleCommand(chatId, chatType, messageId, cleanedText);
      return;
    }

    if (!cleanedText && !hasIncomingAttachment) {
      await enqueueAudit({ reason: "empty_after_clean" });
      return;
    }

    const instructions = await this.buildInboundInstructions({
      chatId,
      chatKey,
      messageId,
      userMessage: cleanedText,
      attachments: incomingAttachments,
    });
    if (!instructions) {
      await enqueueAudit({ reason: "empty_after_build" });
      return;
    }

    await this.executeAndReply(
      chatId,
      chatType,
      messageId,
      instructions,
      actor,
      chatTitle,
    );
  }

  /**
   * 处理频道消息（可选）
   */
  private async handleChannelMessage(data: QQMessageData): Promise<void> {
    const { id: messageId, channel_id: channelId, content, author } = data;
    if (!channelId || !messageId) return;
    const chatType = "channel";
    if (
      await this.shouldSkipDuplicatedInboundMessage(
        EventType.AT_MESSAGE_CREATE,
        messageId,
      )
    ) {
      return;
    }

    const userMessage = this.extractTextContent(String(content || ""));
    const incomingAttachments = this.extractIncomingAttachments(data);
    const actor = this.extractAuthorIdentity(author, data);
    const chatTitle = this.resolveInboundChatTitle({
      chatType,
      data,
      actorName: actor.username,
    });

    await this.observeIncomingAuthorization({
      chatId: channelId,
      chatType,
      chatTitle,
      userId: actor.userId,
      username: actor.username,
    });

    const authResult = await this.evaluateIncomingAuthorization({
      chatId: channelId,
      chatType,
      chatTitle,
      userId: actor.userId,
      username: actor.username,
    });
    if (authResult.decision !== "allow") {
      return;
    }

    if (actor.userId && this.botUserId && actor.userId === this.botUserId) {
      this.logger.debug("忽略机器人自身消息（channel）", {
        messageId,
        channelId,
        botUserId: this.botUserId,
      });
      return;
    }

    this.logger.info(`收到频道消息 [${channelId}]: ${userMessage}`);

    if (userMessage.startsWith("/")) {
      await this.handleCommand(channelId, "channel", messageId, userMessage);
    } else {
      const instructions = await this.buildInboundInstructions({
        chatId: channelId,
        chatKey: this.getChatKey({ chatId: channelId, chatType }),
        messageId,
        userMessage,
        attachments: incomingAttachments,
      });
      if (!instructions) return;
      await this.executeAndReply(
        channelId,
        "channel",
        messageId,
        instructions,
        actor,
        chatTitle,
      );
    }
  }

  /**
   * 解析入站会话展示名（群名/频道名/私聊对象名）。
   *
   * 关键点（中文）
   * - QQ 事件字段存在平台差异：这里只做 best-effort 提取。
   * - 失败时返回 undefined，不影响主流程。
   */
  private resolveInboundChatTitle(params: {
    chatType: string;
    data: QQMessageData;
    actorName?: string;
  }): string | undefined {
    const chatType = String(params.chatType || "").trim().toLowerCase();
    const raw = params.data as unknown as JsonObject;
    const groupObj =
      raw.group && typeof raw.group === "object" && !Array.isArray(raw.group)
        ? (raw.group as JsonObject)
        : null;
    const channelObj =
      raw.channel && typeof raw.channel === "object" && !Array.isArray(raw.channel)
        ? (raw.channel as JsonObject)
        : null;
    const guildObj =
      raw.guild && typeof raw.guild === "object" && !Array.isArray(raw.guild)
        ? (raw.guild as JsonObject)
        : null;

    const candidates = [
      chatType === "c2c" ? this.normalizeActorDisplayName(params.actorName) : "",
      raw.group_name,
      raw.groupName,
      raw.group_title,
      raw.groupTitle,
      raw.channel_name,
      raw.channelName,
      raw.guild_name,
      raw.guildName,
      raw.chat_name,
      raw.chatName,
      raw.title,
      raw.name,
      groupObj?.name,
      groupObj?.title,
      channelObj?.name,
      channelObj?.title,
      guildObj?.name,
      guildObj?.title,
    ];
    for (const candidate of candidates) {
      const value = this.normalizeActorDisplayName(candidate);
      if (value) return value;
    }
    return undefined;
  }

  /**
   * 识别“看起来像平台标识符”的字符串（如 openid）。
   *
   * 关键点（中文）
   * - 私聊场景里最常见的是长串十六进制 openid，不应当显示成 chat title。
   * - 规则保持保守：仅过滤明显“长且机器化”的值，避免误伤正常昵称。
   */
  private isLikelyOpaqueIdentifier(input: string): boolean {
    const value = String(input || "").trim();
    if (!value) return false;
    if (/^[0-9A-F]{24,}$/i.test(value)) return true;
    if (/^[0-9]{18,}$/.test(value)) return true;
    return false;
  }

  /**
   * 规范化“可展示昵称”。
   *
   * 关键点（中文）
   * - 过滤空字符串与明显 ID，避免把 `chatTitle` 写成 openid。
   */
  private normalizeActorDisplayName(input: unknown): string | undefined {
    const value = String(input || "").trim();
    if (!value) return undefined;
    if (this.isLikelyOpaqueIdentifier(value)) return undefined;
    return value;
  }

  /**
   * 入站消息去重检查。
   *
   * 关键点（中文）
   * - QQ 网关在重连/重启后可能重放历史消息。
   * - 若不去重，会导致同一 messageId 被重复入队执行，间接触发“无新消息也触发 compact/压缩”。
   */
  private async shouldSkipDuplicatedInboundMessage(
    eventType: string,
    messageId: string | undefined,
  ): Promise<boolean> {
    const id = typeof messageId === "string" ? messageId.trim() : "";
    if (!id) return false;
    const duplicated = await this.inboundDedupeStore.markAndCheckDuplicate({
      eventType,
      messageId: id,
    });
    if (!duplicated) return false;

    this.logger.info("忽略重复入站消息", {
      eventType,
      messageId: id,
    });
    return true;
  }

  /**
   * Extract a best-effort actor identity from QQ webhook payloads.
   *
   * QQ varies fields by event type (group/c2c/channel), so we accept multiple
   * candidates and normalize into `{ userId, username }`.
   *
   * Notes:
   * - For C2C events, `userId` also serves as `chatId` (DM target).
   */
  private extractAuthorIdentity(
    author: QQAuthor | undefined,
    data?: QQMessageData,
  ): {
    userId?: string;
    username?: string;
  } {
    const rawAuthor =
      author && typeof author === "object" && !Array.isArray(author)
        ? (author as unknown as Record<string, unknown>)
        : {};
    const rawAuthorUser =
      rawAuthor.user &&
      typeof rawAuthor.user === "object" &&
      !Array.isArray(rawAuthor.user)
        ? (rawAuthor.user as Record<string, unknown>)
        : {};
    const rawData =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as unknown as Record<string, unknown>)
        : {};
    const rawSender =
      rawData.sender &&
      typeof rawData.sender === "object" &&
      !Array.isArray(rawData.sender)
        ? (rawData.sender as Record<string, unknown>)
        : {};
    const rawMember =
      rawData.member &&
      typeof rawData.member === "object" &&
      !Array.isArray(rawData.member)
        ? (rawData.member as Record<string, unknown>)
        : {};

    const userIdCandidates = [
      author?.member_openid,
      author?.user_openid,
      author?.openid,
      author?.union_openid,
      author?.id,
      author?.user_id,
      author?.tiny_id,
      author?.member_tinyid,
      author?.user_tinyid,
      author?.uid,
      author?.user?.id,
      author?.user?.user_id,
      author?.user?.openid,
      author?.user?.user_openid,
      rawData.user_openid,
      rawData.openid,
      rawData.author_id,
      rawData.user_id,
      rawSender.user_openid,
      rawSender.openid,
      rawSender.id,
      rawSender.user_id,
      rawMember.user_openid,
      rawMember.openid,
      rawMember.id,
      rawMember.user_id,
    ];
    const usernameCandidates = [
      author?.nickname,
      author?.username,
      author?.name,
      author?.user?.username,
      author?.user?.nickname,
      author?.user?.name,
      rawAuthor.nick,
      rawAuthor.display_name,
      rawAuthor.displayName,
      rawAuthor.member_nick,
      rawAuthor.memberNick,
      rawAuthor.card,
      rawAuthor.remark,
      rawAuthorUser.nick,
      rawAuthorUser.display_name,
      rawAuthorUser.displayName,
      rawData.nickname,
      rawData.username,
      rawData.nick,
      rawData.user_name,
      rawData.userName,
      rawData.display_name,
      rawData.displayName,
      rawSender.nickname,
      rawSender.username,
      rawSender.nick,
      rawSender.user_name,
      rawSender.userName,
      rawSender.card,
      rawMember.nickname,
      rawMember.username,
      rawMember.nick,
      rawMember.card,
    ];

    const userId = userIdCandidates
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean);
    const username = usernameCandidates
      .map((v) => this.normalizeActorDisplayName(v))
      .find(Boolean);

    return {
      ...(userId ? { userId } : {}),
      ...(username ? { username } : {}),
    };
  }

  /**
   * 提取纯文本内容
   */
  private extractTextContent(content: string): string {
    if (!content) return "";
    return String(content).replace(/\s+/g, " ").trim();
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * 仅移除消息中的“机器人提及”片段，保留其他文本。
   *
   * 关键点（中文）
   * - 对齐 Telegram：只清理 bot mention，不误删用户正文。
   */
  private stripBotMention(content: string): string {
    const raw = String(content || "");
    if (!raw) return "";

    const botUserId = String(this.botUserId || "").trim();
    if (!botUserId) return raw.trim();

    const escaped = this.escapeRegExp(botUserId);
    return raw
      .replace(new RegExp(`<@!?${escaped}>`, "ig"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * 提取 QQ 入站附件（best-effort）。
   *
   * 关键点（中文）
   * - 字段来源不稳定，统一委托 `VoiceInput` 做宽松归一化。
   * - 这里只做“提取”，不做网络下载，避免阻塞普通文本路径。
   */
  private extractIncomingAttachments(data: QQMessageData): QqIncomingAttachment[] {
    return extractQqIncomingAttachments({
      attachments: data.attachments,
      files: data.files,
      file_info: data.file_info,
      file_infos: data.file_infos,
      media: data.media,
      medias: data.medias,
      audio: data.audio,
      voice: data.voice,
    });
  }

  /**
   * 构造入站执行指令（文本 + QQ 语音转写）。
   *
   * 关键点（中文）
   * - 仅当存在 voice/audio 附件时触发转写，普通文本路径零额外开销。
   * - 转写失败不抛错，保持主链路 best-effort。
   */
  private async buildInboundInstructions(params: {
    chatId: string;
    chatKey: string;
    messageId: string;
    userMessage: string;
    attachments: QqIncomingAttachment[];
  }): Promise<string> {
    const text = String(params.userMessage || "").trim();
    const resolvedAttachments = await Promise.all(
      params.attachments.map(async (attachment) => {
        const base = {
          channel: "qq" as const,
          kind: attachment.kind,
          ...(attachment.fileName ? { fileName: attachment.fileName } : {}),
          ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
          ...(attachment.attachmentId ? { attachmentId: attachment.attachmentId } : {}),
        };
        if (attachment.kind !== "voice" && attachment.kind !== "audio") {
          return {
            ...base,
            ...(attachment.localPath ? { path: attachment.localPath } : {}),
          };
        }
        try {
          const localPath = await resolveQqAttachmentLocalPath({
            rootPath: this.rootPath,
            attachment,
            authToken: await this.getAuthToken(),
          });
          return {
            ...base,
            ...(localPath ? { path: localPath } : {}),
          };
        } catch {
          return base;
        }
      }),
    );

    return buildChatInboundText(
      await augmentChatInboundInput({
        runtime: this.context,
        input: {
          channel: "qq",
          chatId: params.chatId,
          chatKey: params.chatKey,
          messageId: params.messageId,
          rootPath: this.rootPath,
          bodyText: text || undefined,
          attachments: resolvedAttachments,
        },
      }),
    );
  }

  /**
   * 构造入站审计文本（保证非空，便于历史回溯）。
   */
  private buildAuditText(params: {
    rawContent: string;
    cleanedText: string;
    hasIncomingAttachment: boolean;
  }): string {
    const raw = String(params.rawContent || "").trim();
    if (raw) return raw;

    const cleaned = String(params.cleanedText || "").trim();
    if (cleaned) return cleaned;

    if (params.hasIncomingAttachment) return "[attachment] (qq)";
    return "[message] (no_text_or_supported_attachment)";
  }

  /**
   * 处理命令
   */
  private async handleCommand(
    chatId: string,
    chatType: string,
    messageId: string,
    command: string,
  ): Promise<void> {
    this.logger.info(`收到命令: ${command}`);

    let responseText = "";

    switch (command.toLowerCase().split(" ")[0]) {
      case "/help":
      case "/帮助":
        responseText = `🤖 Downcity Bot

可用命令:
- /help 或 /帮助 - 查看帮助信息
- /status 或 /状态 - 查看 Agent 状态
- /tasks 或 /任务 - 查看任务列表
- /clear 或 /清除 - 彻底删除当前对话
- <任意消息> - 执行指令`;
        break;

      case "/status":
      case "/状态":
        responseText = "📊 Agent 状态: 运行中\n任务数: 0\n待审批: 0";
        break;

      case "/tasks":
      case "/任务":
        responseText = "📋 任务列表\n暂无任务";
        break;

      case "/clear":
      case "/清除":
        await this.clearChatByTarget({
          chatId,
          chatType,
        });
        responseText = "✅ 对话已彻底删除";
        break;

      default:
        responseText = `未知命令: ${command}\n输入 /help 查看可用命令`;
    }

    await this.sendMessage(chatId, chatType, messageId, responseText);
  }

  /**
   * 执行指令并回复
   */
  private async executeAndReply(
    chatId: string,
    chatType: string,
    messageId: string,
    instructions: string,
    actor?: { userId?: string; username?: string },
    chatTitle?: string,
  ): Promise<void> {
    try {
      await this.enqueueMessage({
        chatId,
        text: instructions,
        chatType,
        messageId,
        ...(actor?.userId ? { userId: actor.userId } : {}),
        ...(actor?.username ? { username: actor.username } : {}),
        ...(chatTitle ? { chatTitle } : {}),
      });
    } catch (error) {
      await this.sendMessage(
        chatId,
        chatType,
        messageId,
        `❌ 执行错误: ${String(error)}`,
        1,
      );
    }
  }

  /**
   * 发送消息
   */
  private async sleepMs(ms: number): Promise<void> {
    if (!Number.isFinite(ms) || ms <= 0) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.trunc(ms));
    });
  }

  /**
   * 发送重试前的退避等待。
   *
   * 关键点（中文）
   * - 采用指数退避 + 轻微抖动，降低瞬时抖动时的失败放大。
   */
  private async waitBeforeSendRetry(attempt: number): Promise<void> {
    const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.trunc(attempt) : 1;
    const delayMs = Math.min(4000, 600 * 2 ** (safeAttempt - 1));
    const jitterMs = Math.floor(Math.random() * 180);
    await this.sleepMs(delayMs + jitterMs);
  }

  /**
   * 解析 QQ API 业务错误（HTTP 200 但 code 非 0）。
   */
  private resolveQqApiErrorText(responseText: string): string | null {
    if (!responseText) return null;
    try {
      const parsed = JSON.parse(responseText) as JsonValue;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const payload = parsed as JsonObject;
      const codeValue = payload.code ?? payload.errcode ?? payload.retcode;
      const code =
        typeof codeValue === "number"
          ? codeValue
          : typeof codeValue === "string" && codeValue.trim()
            ? Number(codeValue)
            : undefined;
      if (!Number.isFinite(code) || code === 0) return null;
      const messageCandidates = [
        payload.message,
        payload.msg,
        payload.error,
        payload.errmsg,
      ]
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      const detail = messageCandidates[0] || responseText.slice(0, 200);
      return `API code ${code}${detail ? `: ${detail}` : ""}`;
    } catch {
      return null;
    }
  }

  private isRetryableSendFailure(errorText: string): boolean {
    const text = String(errorText || "").toLowerCase();
    if (!text) return false;
    // 关键点（中文）：明显参数/业务约束错误不重试，避免无意义重复请求。
    if (
      text.includes("http 400") ||
      text.includes("http 404") ||
      text.includes("requires chattype + messageid") ||
      text.includes("unknown") && text.includes("chat") && text.includes("type") ||
      text.includes("未知的聊天类型") ||
      text.includes("msg_id") ||
      text.includes("messageid") ||
      text.includes("message id")
    ) {
      return false;
    }
    return (
      text.includes("http 401") ||
      text.includes("http 403") ||
      text.includes("http 408") ||
      text.includes("http 429") ||
      text.includes("http 5") ||
      text.includes("fetch failed") ||
      text.includes("network") ||
      text.includes("socket") ||
      text.includes("econn") ||
      text.includes("etimedout") ||
      text.includes("eai_again") ||
      text.includes("enotfound")
    );
  }

  /**
   * 执行一次 QQ 消息投递请求。
   */
  private async postMessageOnce(params: {
    url: string;
    body: QQSendMessageBody;
  }): Promise<{ status: number; responseText: string }> {
    const authToken = await this.getAuthToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.sendRequestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(params.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
        },
        body: JSON.stringify(params.body),
        signal: controller.signal,
      });
    } catch (error) {
      const errorText = String(error);
      if (errorText.toLowerCase().includes("abort")) {
        throw new Error(`QQ send failed: timeout after ${this.sendRequestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.error(`发送消息失败: ${response.status} - ${responseText}`);
      throw new Error(`QQ send failed: HTTP ${response.status}: ${responseText}`);
    }
    const apiError = this.resolveQqApiErrorText(responseText);
    if (apiError) {
      throw new Error(`QQ send failed: ${apiError}`);
    }
    return { status: response.status, responseText };
  }

  private async sendMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    text: string,
    msgSeq: number = 1,
  ): Promise<void> {
    // 注意：这里必须把失败抛出去，否则 tool 层会误报 success:true，
    //      进而出现 “QQ 有提醒但点开没有消息” 这种难排查的假成功。
    try {
      const apiBase = this.getApiBase();
      let url = "";
      const body: QQSendMessageBody = {
        content: text,
        msg_type: 0, // 文本消息
        msg_id: messageId, // 被动回复需要带上消息ID
        msg_seq: msgSeq, // 消息序号，避免相同消息id回复重复发送
      };

      switch (chatType) {
        case "group":
          // 群聊消息
          url = `${apiBase}/v2/groups/${chatId}/messages`;
          break;
        case "c2c":
          // C2C 私聊消息
          url = `${apiBase}/v2/users/${chatId}/messages`;
          break;
        case "channel":
          // 频道消息
          url = `${apiBase}/channels/${chatId}/messages`;
          break;
        default:
          throw new Error(`未知的聊天类型: ${chatType}`);
      }

      this.logger.debug(`发送消息到: ${url}`);

      // 关键点（中文）：回发失败后做有限重试，并触发链路自愈重连。
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= this.sendMaxAttempts; attempt++) {
        try {
          const { status, responseText } = await this.postMessageOnce({
            url,
            body,
          });

          try {
            void (responseText ? JSON.parse(responseText) : null);
          } catch {
            // ignore parse failure
          }

          // 成功也保留一点响应内容，便于排查“返回成功但用户侧不可见”的边界情况
          this.logger.debug(
            `消息发送成功: ${status}${responseText ? ` - ${responseText}` : ""}`,
          );
          return;
        } catch (error) {
          lastError = error;
          const errorText = String(error);
          const shouldRetry =
            attempt < this.sendMaxAttempts && this.isRetryableSendFailure(errorText);
          if (!shouldRetry) {
            throw error;
          }

          this.logger.warn("QQ 回发失败，准备自动重试", {
            attempt,
            maxAttempts: this.sendMaxAttempts,
            chatType,
            chatId,
            messageId,
            error: errorText,
          });
          this.accessToken = "";
          this.accessTokenExpires = 0;
          this.closeSocketForRecovery("send_failed_retry");
          this.scheduleReconnect("send_failed_retry", 0);
          await this.waitBeforeSendRetry(attempt);
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } catch (error) {
      this.logger.error("发送 QQ 消息失败", { error: String(error) });
      throw error;
    }
  }

  /**
   * 停止机器人
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.clearReconnectTimer();

    // 清理心跳定时器
    this.stopHeartbeat();
    this.resetWsLivenessState();

    // 关闭 WebSocket 连接
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.logger.info("QQ Bot 已停止");
  }
}

/**
 * 创建 QQ 机器人实例
 */
export async function createQQBot(
  config: QQConfig,
  context: ServiceRuntime,
): Promise<QQBot | null> {
  if (!config.enabled || !config.appId || !config.appSecret) {
    return null;
  }

  const bot = new QQBot(
    context,
    config.appId,
    config.appSecret,
    config.sandbox || false,
  );
  return bot;
}

type QQEventCaptureMode = "dispatch" | "all";

interface QQEventCaptureConfig {
  enabled: boolean;
  mode: QQEventCaptureMode;
  dir: string;
}

/**
 * Read QQ raw event capture configuration from environment variables.
 *
 * Env:
 * - `SHIP_QQ_CAPTURE_EVENTS=dispatch|all`
 * - `SHIP_QQ_CAPTURE_DIR=...` (optional; defaults to `${projectRoot}/.ship/.debug/qq-events`)
 */
function getQqEventCaptureConfig(projectRoot: string): QQEventCaptureConfig {
  const raw = String(process.env.SHIP_QQ_CAPTURE_EVENTS ?? "")
    .trim()
    .toLowerCase();
  if (!raw || ["0", "false", "off", "no"].includes(raw)) {
    return {
      enabled: false,
      mode: "dispatch",
      dir: join(projectRoot, ".ship", ".debug", "qq-events"),
    };
  }

  const mode: QQEventCaptureMode =
    raw === "all" ? "all" : raw === "dispatch" ? "dispatch" : "dispatch";

  const dir =
    typeof process.env.SHIP_QQ_CAPTURE_DIR === "string" &&
    process.env.SHIP_QQ_CAPTURE_DIR.trim()
      ? process.env.SHIP_QQ_CAPTURE_DIR.trim()
      : join(projectRoot, ".ship", ".debug", "qq-events");

  return { enabled: true, mode, dir };
}

/**
 * Make a string safe for use in a filename segment.
 */
function sanitizeFileTag(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "N_A";
}
