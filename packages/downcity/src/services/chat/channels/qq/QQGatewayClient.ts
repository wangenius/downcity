/**
 * QQGatewayClient：QQ 网关连接与发送客户端。
 *
 * 关键点（中文）
 * - 这里专门负责 QQ 鉴权、Gateway WebSocket、心跳、自愈重连、消息回发。
 * - QQBot 不再直接维护底层 ws/token 细节，只保留渠道编排职责。
 * - 这样可以把“平台连接状态”和“业务消息流”从概念上拆开。
 */

import WebSocket, { type RawData } from "ws";
import type { Logger } from "@utils/logger/Logger.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ChatChannelTestResult } from "@services/chat/types/ChannelStatus.js";
import type {
  EventType as QqEventType,
  QQEventCaptureConfig,
  QQGatewayPayload,
  QQSendMessageBody,
  QqDispatchHandler,
  QqGatewayRuntimeStatus,
} from "@/types/QqChannel.js";
import { EventType, OpCode } from "@/types/QqChannel.js";
import { captureQqWsPayload } from "./QQEventCapture.js";
import {
  isRetryableQqSendFailure,
  resolveQqApiErrorText,
  waitBeforeQqSendRetry,
} from "./QQSendSupport.js";

/**
 * QQGatewayClient 构造参数。
 */
export interface QQGatewayClientOptions {
  /**
   * 项目根目录。
   */
  rootPath: string;
  /**
   * 日志器。
   */
  logger: Logger;
  /**
   * QQ AppId。
   */
  appId: string;
  /**
   * QQ AppSecret。
   */
  appSecret: string;
  /**
   * 是否使用沙箱环境。
   */
  useSandbox: boolean;
  /**
   * QQ 原始事件捕获配置。
   */
  captureConfig: QQEventCaptureConfig;
  /**
   * Dispatch 事件回调。
   */
  onDispatch: (params: QqDispatchHandler) => Promise<void>;
}

/**
 * QQ 网关客户端。
 */
export class QQGatewayClient {
  private readonly rootPath: string;
  private readonly logger: Logger;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly useSandbox: boolean;
  private readonly captureConfig: QQEventCaptureConfig;
  private readonly onDispatch: (params: QqDispatchHandler) => Promise<void>;

  private ws: WebSocket | null = null;
  private isRunning = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private wsContextId = "";
  private lastSeq = 0;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private heartbeatIntervalMs = 30000;
  private lastHeartbeatSentAtMs = 0;
  private lastHeartbeatAckAtMs = 0;
  private pendingHeartbeatSinceMs = 0;
  private wsReadyAtMs = 0;
  private readonly sendRequestTimeoutMs = 15000;
  private readonly sendMaxAttempts = 3;
  private accessToken = "";
  private accessTokenExpires = 0;

  private readonly AUTH_API_BASE = "https://bots.qq.com";
  private readonly API_BASE = "https://api.sgroup.qq.com";
  private readonly SANDBOX_API_BASE = "https://sandbox.api.sgroup.qq.com";

  constructor(options: QQGatewayClientOptions) {
    this.rootPath = options.rootPath;
    this.logger = options.logger;
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.useSandbox = options.useSandbox;
    this.captureConfig = options.captureConfig;
    this.onDispatch = options.onDispatch;
  }

  /**
   * 获取当前鉴权字符串。
   */
  async getAuthToken(): Promise<string> {
    const accessToken = await this.getAccessToken();
    return `QQBot ${accessToken}`;
  }

  /**
   * 获取网关运行态快照。
   */
  getRuntimeStatus(): QqGatewayRuntimeStatus {
    const now = Date.now();
    const readyState = typeof this.ws?.readyState === "number" ? this.ws.readyState : null;
    const isOpen = readyState === WebSocket.OPEN;
    const hasContext = Boolean(String(this.wsContextId || "").trim());
    const heartbeatHealthy = this.hasHealthyHeartbeat(now);
    const heartbeatTimedOut = this.hasHeartbeatTimeout(now);
    const linkState =
      !this.isRunning
        ? "disconnected"
        : isOpen && hasContext && heartbeatHealthy
          ? "connected"
          : "unknown";

    const statusText = !this.isRunning
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
      running: this.isRunning,
      linkState,
      statusText,
      detail: {
        appId: this.appId || null,
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
          if (runtime.statusText === "heartbeat_timeout") {
            this.requestReconnect("test_detected_heartbeat_timeout", 0);
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
   * 启动 QQ 网关。
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn("QQ Gateway 已在运行中，跳过重复启动");
      return;
    }

    this.isRunning = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.resetWsLivenessState();
    const gatewayUrl = await this.getGatewayUrl();
    await this.connectWebSocket(gatewayUrl);
  }

  /**
   * 停止 QQ 网关。
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.resetWsLivenessState();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * 请求一次重连。
   */
  requestReconnect(reason: string, delayMs?: number): void {
    this.scheduleReconnect(reason, delayMs);
  }

  /**
   * 发送 QQ 消息。
   */
  async sendMessage(
    chatId: string,
    chatType: string,
    messageId: string,
    text: string,
    msgSeq: number = 1,
  ): Promise<void> {
    try {
      const apiBase = this.getApiBase();
      let url = "";
      const body: QQSendMessageBody = {
        content: text,
        msg_type: 0,
        msg_id: messageId,
        msg_seq: msgSeq,
      };

      switch (chatType) {
        case "group":
          url = `${apiBase}/v2/groups/${chatId}/messages`;
          break;
        case "c2c":
          url = `${apiBase}/v2/users/${chatId}/messages`;
          break;
        case "channel":
          url = `${apiBase}/channels/${chatId}/messages`;
          break;
        default:
          throw new Error(`未知的聊天类型: ${chatType}`);
      }

      this.logger.debug(`发送消息到: ${url}`);

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= this.sendMaxAttempts; attempt++) {
        try {
          const { status, responseText } = await this.postMessageOnce({
            url,
            body,
          });
          this.logger.debug(
            `消息发送成功: ${status}${responseText ? ` - ${responseText}` : ""}`,
          );
          return;
        } catch (error) {
          lastError = error;
          const errorText = String(error);
          const shouldRetry =
            attempt < this.sendMaxAttempts &&
            isRetryableQqSendFailure(errorText);
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
          this.clearAccessTokenCache();
          this.closeSocketForRecovery("send_failed_retry");
          this.scheduleReconnect("send_failed_retry", 0);
          await waitBeforeQqSendRetry(attempt);
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } catch (error) {
      this.logger.error("发送 QQ 消息失败", { error: String(error) });
      throw error;
    }
  }

  /**
   * 获取 API 基础地址。
   */
  private getApiBase(): string {
    return this.useSandbox ? this.SANDBOX_API_BASE : this.API_BASE;
  }

  /**
   * 获取默认 WebSocket Gateway。
   */
  private getWsGateway(): string {
    return this.useSandbox
      ? "wss://sandbox.api.sgroup.qq.com/websocket"
      : "wss://api.sgroup.qq.com/websocket";
  }

  /**
   * 获取并缓存 Access Token。
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpires - 60000) {
      return this.accessToken;
    }

    try {
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
      if (data.code && data.code !== 0) {
        throw new Error(`API 错误 ${data.code}: ${data.message}`);
      }
      if (!data.access_token) {
        throw new Error(`响应中没有 access_token: ${responseText}`);
      }

      this.accessToken = data.access_token;
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
   * 获取 Gateway 地址。
   */
  private async getGatewayUrl(): Promise<string> {
    const apiBase = this.getApiBase();
    const authToken = await this.getAuthToken();

    try {
      this.logger.info(`正在获取 Gateway 地址... (API: ${apiBase})`);
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
      const fallbackUrl = this.getWsGateway();
      this.logger.warn(`使用默认 Gateway 地址: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }

  /**
   * 计算心跳 ACK 超时阈值。
   */
  private getHeartbeatAckTimeoutMs(): number {
    return Math.max(this.heartbeatIntervalMs * 3, 45000);
  }

  /**
   * 是否发生心跳 ACK 超时。
   */
  private hasHeartbeatTimeout(nowMs: number = Date.now()): boolean {
    if (!this.pendingHeartbeatSinceMs) return false;
    return nowMs - this.pendingHeartbeatSinceMs > this.getHeartbeatAckTimeoutMs();
  }

  /**
   * 心跳是否健康。
   */
  private hasHealthyHeartbeat(nowMs: number = Date.now()): boolean {
    if (!this.wsReadyAtMs) return false;
    if (!this.pendingHeartbeatSinceMs) return true;
    return !this.hasHeartbeatTimeout(nowMs);
  }

  /**
   * 重置网关活性状态。
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
   * 清理 token 缓存。
   */
  private clearAccessTokenCache(): void {
    this.accessToken = "";
    this.accessTokenExpires = 0;
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
   * 计划一次重连。
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
        this.clearAccessTokenCache();
        const newGatewayUrl = await this.getGatewayUrl();
        await this.connectWebSocket(newGatewayUrl);
      } catch (error) {
        this.logger.error("QQ 重连失败", { error: String(error), reason });
        this.scheduleReconnect("reconnect_failed");
      }
    }, delay);
  }

  /**
   * 主动关闭当前 socket，交给 close 回调统一进入重连流程。
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
   * 建立 WebSocket 连接。
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
          await captureQqWsPayload({
            config: this.captureConfig,
            logger: this.logger,
            payload,
          });
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
   * 解析原始 Gateway 载荷。
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
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const obj = parsed as JsonObject;
      const op = typeof obj.op === "number" ? obj.op : Number(obj.op);
      if (!Number.isFinite(op)) return null;
      return {
        op,
        ...(obj.d && typeof obj.d === "object" && !Array.isArray(obj.d)
          ? { d: obj.d as JsonObject }
          : {}),
        ...(typeof obj.s === "number" ? { s: obj.s } : {}),
        ...(typeof obj.t === "string" ? { t: obj.t } : {}),
      };
    } catch {
      return null;
    }
  }

  /**
   * 处理网关消息。
   */
  private async handleWebSocketMessage(payload: QQGatewayPayload): Promise<void> {
    const { op, d, s, t } = payload;
    if (s) {
      this.lastSeq = s;
    }

    switch (op) {
      case OpCode.Hello: {
        const heartbeatIntervalMs =
          typeof d?.heartbeat_interval === "number" ? d.heartbeat_interval : 30000;
        this.startHeartbeat(heartbeatIntervalMs);
        await this.sendIdentify();
        break;
      }
      case OpCode.Dispatch: {
        const eventType = String(t || "");
        if (eventType === EventType.READY) {
          this.wsContextId = typeof d?.context_id === "string" ? d.context_id : "";
          this.wsReadyAtMs = Date.now();
        } else if (eventType === EventType.RESUMED) {
          this.wsReadyAtMs = Date.now();
        }
        await this.onDispatch({
          eventType,
          data: d || {},
        });
        break;
      }
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
        this.clearAccessTokenCache();
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
   * 发送鉴权请求。
   */
  private async sendIdentify(): Promise<void> {
    const authToken = await this.getAuthToken();
    const intents = this.getIntents();
    this.logger.info(`发送鉴权请求 (Identify)，intents: ${intents}`);

    const identifyPayload = {
      op: OpCode.Identify,
      d: {
        token: authToken,
        intents,
        shard: [0, 1],
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
   * 获取订阅事件位掩码。
   */
  private getIntents(): number {
    const GROUP_AND_C2C_EVENT = 1 << 25;
    const AUDIO_ACTION = 1 << 29;
    return GROUP_AND_C2C_EVENT | AUDIO_ACTION;
  }

  /**
   * 启动心跳。
   */
  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatIntervalMs =
      Number.isFinite(intervalMs) && intervalMs > 0 ? Math.trunc(intervalMs) : 30000;
    this.pendingHeartbeatSinceMs = 0;
    this.lastHeartbeatSentAtMs = 0;
    this.sendHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  /**
   * 发送单次心跳。
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
   * 停止心跳。
   */
  private stopHeartbeat(): void {
    if (!this.heartbeatInterval) return;
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  /**
   * 执行一次消息投递请求。
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

    const apiError = resolveQqApiErrorText(responseText);
    if (apiError) {
      throw new Error(`QQ send failed: ${apiError}`);
    }
    return { status: response.status, responseText };
  }
}
