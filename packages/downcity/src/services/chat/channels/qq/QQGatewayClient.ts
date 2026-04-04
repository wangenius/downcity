/**
 * QQGatewayClient：QQ 网关连接与发送客户端。
 *
 * 关键点（中文）
 * - 这里专门负责 QQ Gateway WebSocket、心跳、自愈重连与状态持有。
 * - 鉴权 / HTTP 探活 / 发送重试已经拆到旁路模块，当前文件只保留运行时编排。
 * - QQBot 不再直接维护底层 ws / token 细节，只保留渠道编排职责。
 */

import WebSocket, { type RawData } from "ws";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type {
  QQEventCaptureConfig,
  QQGatewayPayload,
  QqDispatchHandler,
  QqGatewayRuntimeStatus,
} from "@/shared/types/QqChannel.js";
import { EventType, OpCode } from "@/shared/types/QqChannel.js";
import { captureQqWsPayload } from "./QQEventCapture.js";
import {
  fetchQqAccessToken,
  fetchQqGatewayUrl,
  testQqGatewayConnection,
} from "./QQGatewayAuth.js";
import {
  buildQqGatewayRuntimeStatus,
  getQqHeartbeatAckTimeoutMs,
  hasQqHealthyHeartbeat,
  hasQqHeartbeatTimeout,
  parseQqGatewayPayload,
  resolveQqGatewayApiBase,
  resolveQqGatewayWsUrl,
} from "./QQGatewaySupport.js";
import { sendQqMessageWithRetry } from "./QQGatewaySend.js";

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
    const result = await fetchQqAccessToken({
      logger: this.logger,
      authApiBase: this.AUTH_API_BASE,
      appId: this.appId,
      appSecret: this.appSecret,
      cachedAccessToken: this.accessToken,
      cachedAccessTokenExpiresAtMs: this.accessTokenExpires,
    });
    this.accessToken = result.accessToken;
    this.accessTokenExpires = result.accessTokenExpiresAtMs;
    return `QQBot ${result.accessToken}`;
  }

  /**
   * 获取网关状态快照。
   */
  getRuntimeStatus(): QqGatewayRuntimeStatus {
    const readyState = typeof this.ws?.readyState === "number" ? this.ws.readyState : null;
    return buildQqGatewayRuntimeStatus({
      isRunning: this.isRunning,
      wsReadyState: readyState,
      wsContextId: this.wsContextId,
      wsReadyAtMs: this.wsReadyAtMs,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      lastHeartbeatSentAtMs: this.lastHeartbeatSentAtMs,
      lastHeartbeatAckAtMs: this.lastHeartbeatAckAtMs,
      pendingHeartbeatSinceMs: this.pendingHeartbeatSinceMs,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      reconnectScheduled: Boolean(this.reconnectTimer),
      useSandbox: this.useSandbox,
      appId: this.appId,
    });
  }

  /**
   * 执行 QQ 连通性测试。
   */
  async testConnection() {
    return testQqGatewayConnection({
      appId: this.appId,
      appSecret: this.appSecret,
      useSandbox: this.useSandbox,
      apiBase: this.getApiBase(),
      getAuthToken: () => this.getAuthToken(),
      getRuntimeStatus: () => this.getRuntimeStatus(),
      requestReconnect: (reason, delayMs) => {
        this.requestReconnect(reason, delayMs);
      },
    });
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
      await sendQqMessageWithRetry({
        logger: this.logger,
        apiBase: this.getApiBase(),
        chatId,
        chatType,
        messageId,
        text,
        msgSeq,
        maxAttempts: this.sendMaxAttempts,
        requestTimeoutMs: this.sendRequestTimeoutMs,
        getAuthToken: () => this.getAuthToken(),
        clearAccessTokenCache: () => this.clearAccessTokenCache(),
        closeSocketForRecovery: (reason) => this.closeSocketForRecovery(reason),
        scheduleReconnect: (reason, delayMs) => this.scheduleReconnect(reason, delayMs),
      });
    } catch (error) {
      this.logger.error("发送 QQ 消息失败", { error: String(error) });
      throw error;
    }
  }

  /**
   * 获取 API 基础地址。
   */
  private getApiBase(): string {
    return resolveQqGatewayApiBase(this.useSandbox);
  }

  /**
   * 获取默认 WebSocket Gateway。
   */
  private getWsGateway(): string {
    return resolveQqGatewayWsUrl(this.useSandbox);
  }

  /**
   * 获取 Gateway 地址。
   */
  private async getGatewayUrl(): Promise<string> {
    return fetchQqGatewayUrl({
      logger: this.logger,
      apiBase: this.getApiBase(),
      authToken: await this.getAuthToken(),
      fallbackWsGateway: this.getWsGateway(),
    });
  }

  /**
   * 计算心跳 ACK 超时阈值。
   */
  private getHeartbeatAckTimeoutMs(): number {
    return getQqHeartbeatAckTimeoutMs(this.heartbeatIntervalMs);
  }

  /**
   * 是否发生心跳 ACK 超时。
   */
  private hasHeartbeatTimeout(nowMs: number = Date.now()): boolean {
    return hasQqHeartbeatTimeout(
      {
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        pendingHeartbeatSinceMs: this.pendingHeartbeatSinceMs,
        wsReadyAtMs: this.wsReadyAtMs,
      },
      nowMs,
    );
  }

  /**
   * 心跳是否健康。
   */
  private hasHealthyHeartbeat(nowMs: number = Date.now()): boolean {
    return hasQqHealthyHeartbeat(
      {
        heartbeatIntervalMs: this.heartbeatIntervalMs,
        pendingHeartbeatSinceMs: this.pendingHeartbeatSinceMs,
        wsReadyAtMs: this.wsReadyAtMs,
      },
      nowMs,
    );
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
    return parseQqGatewayPayload(rawData);
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
}
