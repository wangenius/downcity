import WebSocket, { type RawData } from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BaseChatChannel } from "@services/chat/channels/BaseChatChannel.js";
import { QqInboundDedupeStore } from "./QQInboundDedupe.js";
import {
  buildQqVoiceTranscriptionInstruction,
  extractQqIncomingAttachments,
} from "./VoiceInput.js";
import type {
  ChannelChatKeyParams,
  ChannelSendTextParams,
} from "@services/chat/channels/BaseChatChannel.js";
import type { QqIncomingAttachment, QqRawInboundAttachment } from "@services/chat/types/QqVoice.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
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
  groupAccess?: "initiator_or_admin" | "anyone";
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
  username?: string;
};

type QQReadyData = {
  context_id?: string;
  user?: QQReadyUser;
};

type QQAuthor = {
  member_openid?: string;
  user_openid?: string;
  id?: string;
  user_id?: string;
  uid?: string;
  nickname?: string;
  username?: string;
  name?: string;
  user?: {
    username?: string;
    nickname?: string;
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
  channel_id?: string;
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
  private wsContextId: string = "";
  private lastSeq: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

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
  private readonly groupAccess: "initiator_or_admin" | "anyone";
  private readonly groupInitiatorByChatKey: Map<string, string> = new Map();
  private readonly followupWindowMs: number = 10 * 60 * 1000;
  private readonly followupExpiryByChatKey: Map<string, number> = new Map();
  private readonly followupExpiryByActorAndChatKey: Map<string, number> =
    new Map();
  private readonly botOutboundMessageIds: Map<string, number> = new Map();
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

  constructor(
    context: ServiceRuntime,
    appId: string,
    appSecret: string,
    useSandbox: boolean = false,
    groupAccess: QQConfig["groupAccess"] | undefined = undefined,
  ) {
    super({ channel: "qq", context });
    this.appId = appId;
    this.appSecret = appSecret;
    this.useSandbox = useSandbox;
    this.groupAccess =
      groupAccess === "initiator_or_admin" ? "initiator_or_admin" : "anyone";
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
   * 读取 QQ runtime 快照。
   *
   * 关键点（中文）
   * - `connected` 以 WebSocket readyState=OPEN 为准。
   * - `wsContextId` 仅作为诊断信息，不再阻断连接态判断。
   */
  getRuntimeStatus(): {
    running: boolean;
    linkState: "connected" | "disconnected" | "unknown";
    statusText: string;
    detail: Record<string, string | number | boolean | null>;
  } {
    const readyState = typeof this.ws?.readyState === "number" ? this.ws.readyState : null;
    const isOpen = readyState === WebSocket.OPEN;
    const running = this.isRunning;
    const hasContext = Boolean(String(this.wsContextId || "").trim());
    const linkState = running && isOpen ? "connected" : running ? "unknown" : "disconnected";
    return {
      running,
      linkState,
      statusText:
        linkState === "connected"
          ? hasContext
            ? "ws_online"
            : "ws_open_wait_ready"
          : linkState === "unknown"
            ? "connecting"
            : "stopped",
      detail: {
        wsReadyState: readyState,
        wsContextId: this.wsContextId || null,
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
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
   * - `Hello` 到达后 resolve，表示握手链路可继续
   * - close 时按退避策略重连，并重置 token 缓存
   */
  private async connectWebSocket(gatewayUrl: string): Promise<void> {
    this.logger.info(`正在连接 WebSocket: ${gatewayUrl}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(gatewayUrl);
      this.ws = ws;

      ws.on("open", () => {
        this.logger.info("WebSocket 连接已建立");
        this.reconnectAttempts = 0;
      });

      ws.on("message", async (data: RawData) => {
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

          // 首次连接成功后 resolve
          if (payload.op === OpCode.Hello) {
            resolve();
          }
        } catch (error) {
          this.logger.error("处理 WebSocket 消息失败", {
            error: String(error),
          });
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        this.logger.warn(`WebSocket 连接关闭: ${code} - ${reason}`);
        this.stopHeartbeat();

        // 尝试重连
        if (
          this.isRunning &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.reconnectAttempts++;
          const delay = 5000 * this.reconnectAttempts;
          this.logger.info(
            `尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay / 1000}秒后...`,
          );
          setTimeout(async () => {
            try {
              // 清除缓存的 token，强制重新获取
              this.accessToken = "";
              this.accessTokenExpires = 0;
              // 重新获取 Gateway
              const newGatewayUrl = await this.getGatewayUrl();
              await this.connectWebSocket(newGatewayUrl);
            } catch (error) {
              this.logger.error("重连失败", { error: String(error) });
            }
          }, delay);
        }
      });

      ws.on("error", (error: Error) => {
        this.logger.error("WebSocket 错误", { error: String(error) });
        reject(error);
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
        this.logger.debug("收到心跳响应");
        break;

      case OpCode.Reconnect:
        this.logger.warn("服务端要求重连");
        this.ws?.close();
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
          $browser: "shipmyagent",
          $device: "shipmyagent",
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
    // 语音/音频事件（用于 voice extension 转写链路）
    const AUDIO_ACTION = 1 << 29;

    // 返回需要订阅的 intents
    return GROUP_AND_C2C_EVENT | AUDIO_ACTION;
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      const ws = this.ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const heartbeatPayload = {
          op: OpCode.Heartbeat,
          d: this.lastSeq || null,
        };
        ws.send(JSON.stringify(heartbeatPayload));
        this.logger.debug("发送心跳");
      }
    }, intervalMs);
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
        this.logger.info(`QQ Bot 已就绪，WS Context ID: ${this.wsContextId}`);
        const readyUser =
          data.user &&
          typeof data.user === "object" &&
          !Array.isArray(data.user)
            ? (data.user as QQReadyUser)
            : undefined;
        this.logger.info(`用户: ${readyUser?.username || "N/A"}`);
        // best-effort：记录 bot 自己的 userId，供入站过滤使用
        this.botUserId =
          typeof readyUser?.id === "string"
            ? readyUser.id.trim()
            : typeof readyUser?.user_id === "string"
              ? readyUser.user_id.trim()
              : "";
        break;

      case EventType.RESUMED:
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
        // 群聊普通消息（非空内容默认可触发，权限门禁仍生效）
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
    const groupId =
      typeof data.group_openid === "string" ? data.group_openid.trim() : "";
    if (!groupId || !messageId) return;

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

    const actor = this.extractAuthorIdentity(data.author);
    const chatId = String(actor.userId || "").trim();
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
   * - 群聊与私聊复用同一条主逻辑，只在群聊路径增加权限与 follow-up 判定。
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

    const actor = params.actor || this.extractAuthorIdentity(params.data.author);
    const chatType = params.chatType;
    const isGroup = chatType === "group";
    const chatKey = this.getChatKey({ chatId, chatType });
    const rawContent = String(params.data.content || "");
    const incomingAttachments = this.extractIncomingAttachments(params.data);
    const hasIncomingAttachment = incomingAttachments.length > 0;
    const cleanedText = isGroup
      ? this.stripBotMention(rawContent)
      : this.extractTextContent(rawContent);
    const isMentioned = isGroup
      ? eventType === EventType.GROUP_AT_MESSAGE_CREATE ||
        this.isBotMentionedInMessage(rawContent, params.data)
      : false;
    const isReplyToBot = isGroup ? this.isReplyToBot(params.data) : false;
    const inWindow = isGroup
      ? this.isWithinFollowupWindow(chatKey, actor.userId)
      : false;
    const explicit = isGroup ? isMentioned || isReplyToBot : true;
    const isAddressed = isGroup ? explicit || inWindow : true;

    const enqueueAudit = async (opts: { reason: string; kind?: string }): Promise<void> => {
      await this.enqueueAuditMessage({
        chatId,
        chatKey,
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
          eventType,
          reason: opts.reason,
          ...(opts.kind ? { kind: opts.kind } : {}),
          ...(isGroup ? { isMentioned, isReplyToBot, inWindow } : {}),
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

      if (isGroup) {
        if (!actor.userId) {
          await enqueueAudit({ reason: "missing_actor" });
          return;
        }
        const cmdName = (cleanedText.trim().split(/\s+/)[0] || "")
          .split("@")[0]
          ?.toLowerCase();
        const allowAny = cmdName === "/help" || cmdName === "/start";
        if (
          !allowAny &&
          !this.isAllowedGroupActor({
            chatKey,
            actorId: actor.userId,
            author: params.data.author,
          })
        ) {
          await enqueueAudit({ reason: "permission_denied" });
          await this.sendMessage(
            chatId,
            chatType,
            messageId,
            "⛔️ 仅发起人或群管理员可以使用该命令。",
          );
          return;
        }
        this.touchFollowupWindow(chatKey, actor.userId);
      }

      await this.handleCommand(chatId, chatType, messageId, cleanedText);
      return;
    }

    if (isGroup) {
      if (!actor.userId) {
        await enqueueAudit({ reason: "missing_actor" });
        return;
      }

      const allowed = this.isAllowedGroupActor({
        chatKey,
        actorId: actor.userId,
        author: params.data.author,
      });
      if (!allowed) {
        await enqueueAudit({ reason: "permission_denied" });
        // 关键点（中文）：未显式点名 bot 时静默拒绝，避免群里刷屏。
        if (isAddressed) {
          await this.sendMessage(
            chatId,
            chatType,
            messageId,
            "⛔️ 仅发起人或群管理员可以与我对话。",
          );
        }
        return;
      }
    }

    if (!cleanedText && !hasIncomingAttachment) {
      // 关键点（中文）：显式 @bot / 回复bot 的空消息也可激活 follow-up 窗口。
      if (isGroup && actor.userId && explicit) {
        this.touchFollowupWindow(chatKey, actor.userId);
      }
      await enqueueAudit({ reason: "empty_after_clean" });
      return;
    }

    if (isGroup && actor.userId) {
      this.touchFollowupWindow(chatKey, actor.userId);
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

    await this.executeAndReply(chatId, chatType, messageId, instructions, actor);
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
    const actor = this.extractAuthorIdentity(author);

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
      );
    }
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
  private extractAuthorIdentity(author: QQAuthor | undefined): {
    userId?: string;
    username?: string;
  } {
    const userIdCandidates = [
      author?.member_openid,
      author?.user_openid,
      author?.id,
      author?.user_id,
      author?.uid,
    ];
    const usernameCandidates = [
      author?.nickname,
      author?.username,
      author?.name,
      author?.user?.username,
      author?.user?.nickname,
    ];

    const userId = userIdCandidates
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean);
    const username = usernameCandidates
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .find(Boolean);

    return {
      ...(userId ? { userId } : {}),
      ...(username ? { username } : userId ? { username: userId } : {}),
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
    const hasVoiceAttachment = params.attachments.some(
      (item) => item.kind === "voice" || item.kind === "audio",
    );
    if (!hasVoiceAttachment) return text;

    const transcript = await buildQqVoiceTranscriptionInstruction({
      context: this.context,
      logger: this.logger,
      rootPath: this.rootPath,
      chatId: params.chatId,
      messageId: params.messageId,
      chatKey: params.chatKey,
      attachments: params.attachments,
      resolveAuthToken: async () => this.getAuthToken(),
    });

    return [transcript || undefined, text || undefined].filter(Boolean).join("\n\n");
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
   * 判断消息是否 @ 机器人（best-effort）。
   */
  private isBotMentionedInMessage(content: string, data: QQMessageData): boolean {
    const botUserId = String(this.botUserId || "").trim();
    const mentionCandidates = Array.isArray(data.mentions) ? data.mentions : [];

    const mentionUserIds = mentionCandidates
      .flatMap((m) => [
        m?.id,
        m?.user_id,
        m?.member_openid,
        m?.user_openid,
      ])
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    if (botUserId && mentionUserIds.includes(botUserId)) return true;

    // 兜底：从富文本标签中提取 @id，再与 botUserId 比较。
    // 示例：<@123> / <@!123>
    if (botUserId) {
      const ids = Array.from(
        content.matchAll(/<@!?([^>\s]+)>/g),
        (m) => String(m[1] || "").trim(),
      ).filter(Boolean);
      if (ids.includes(botUserId)) return true;
    }

    return false;
  }

  private getFollowupKey(chatKey: string, actorId: string): string {
    return `${chatKey}|${actorId}`;
  }

  private isWithinFollowupWindow(chatKey: string, actorId?: string): boolean {
    const now = Date.now();

    // 会话级窗口：同一群内更容易续聊，不要求同一 actor。
    const chatExp = this.followupExpiryByChatKey.get(chatKey);
    if (typeof chatExp === "number") {
      if (now <= chatExp) return true;
      this.followupExpiryByChatKey.delete(chatKey);
    }

    const actor = String(actorId || "").trim();
    if (!actor) return false;
    const key = this.getFollowupKey(chatKey, actor);
    const exp = this.followupExpiryByActorAndChatKey.get(key);
    if (!exp) return false;
    if (now > exp) {
      this.followupExpiryByActorAndChatKey.delete(key);
      return false;
    }
    return true;
  }

  private touchFollowupWindow(chatKey: string, actorId?: string): void {
    const expiry = Date.now() + this.followupWindowMs;
    this.followupExpiryByChatKey.set(chatKey, expiry);

    const actor = String(actorId || "").trim();
    if (!actor) return;
    const key = this.getFollowupKey(chatKey, actor);
    this.followupExpiryByActorAndChatKey.set(key, expiry);
  }

  /**
   * 记录机器人出站消息 ID，用于识别“回复机器人”场景。
   */
  private trackBotOutboundMessageId(messageId: string | undefined): void {
    const id = String(messageId || "").trim();
    if (!id) return;
    this.botOutboundMessageIds.set(id, Date.now() + 30 * 60 * 1000);

    // 关键点（中文）：顺手做过期清理，防止 map 无界增长。
    if (this.botOutboundMessageIds.size <= 5000) return;
    const now = Date.now();
    for (const [k, exp] of this.botOutboundMessageIds.entries()) {
      if (exp <= now) this.botOutboundMessageIds.delete(k);
      if (this.botOutboundMessageIds.size <= 3000) break;
    }
  }

  /**
   * 判断当前消息是否“回复机器人消息”（best-effort）。
   */
  private isReplyToBot(data: QQMessageData): boolean {
    const replyAuthor = this.extractAuthorIdentity(data.reply_to_message?.author);
    if (
      replyAuthor.userId &&
      this.botUserId &&
      replyAuthor.userId === this.botUserId
    ) {
      return true;
    }

    const referenceCandidates = [
      data.reply_to_message?.id,
      data.message_reference?.message_id,
      data.message_reference?.msg_id,
      data.message_reference?.id,
      data.reference?.message_id,
      data.reference?.msg_id,
      data.reference?.id,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    if (referenceCandidates.length === 0) return false;

    const now = Date.now();
    for (const refId of referenceCandidates) {
      const exp = this.botOutboundMessageIds.get(refId);
      if (!exp) continue;
      if (exp > now) return true;
      this.botOutboundMessageIds.delete(refId);
    }
    return false;
  }

  /**
   * QQ 群聊管理员判定（best-effort）。
   *
   * 关键点（中文）
   * - QQ 事件字段在不同能力集/事件类型下差异较大，无法保证一定带角色字段。
   * - 这里仅做“有字段则识别”的最小策略；识别失败时回退为非管理员。
   */
  private isLikelyGroupAdmin(author: QQAuthor | undefined): boolean {
    const roleCandidates = [
      author?.member_role,
      author?.role,
      author?.permissions,
      author?.permission,
    ]
      .map((v) =>
        String(v || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (roleCandidates.length === 0) return false;

    return roleCandidates.some((role) =>
      ["admin", "administrator", "owner", "creator"].some((kw) =>
        role.includes(kw),
      ),
    );
  }

  /**
   * QQ 群聊访问门禁（对齐 Telegram 默认策略）。
   *
   * 规则（中文）
   * - `anyone`：任何成员都可触发。
   * - `initiator_or_admin`：首个触发用户是发起人；后续仅发起人或管理员可触发。
   */
  private isAllowedGroupActor(params: {
    chatKey: string;
    actorId?: string;
    author?: QQAuthor;
  }): boolean {
    if (this.groupAccess === "anyone") return true;

    const actorId = String(params.actorId || "").trim();
    if (!actorId) return false;

    if (this.isLikelyGroupAdmin(params.author)) return true;

    const existing = this.groupInitiatorByChatKey.get(params.chatKey);
    if (!existing) {
      // 关键点（中文）：首次触发该群聊 lane 的用户自动成为发起人。
      this.groupInitiatorByChatKey.set(params.chatKey, actorId);
      return true;
    }
    return existing === actorId;
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
        responseText = `🤖 ShipMyAgent Bot

可用命令:
- /help 或 /帮助 - 查看帮助信息
- /status 或 /状态 - 查看 Agent 状态
- /tasks 或 /任务 - 查看任务列表
- /clear 或 /清除 - 清除当前对话历史
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
        this.clearChat(this.getChatKey({ chatId, chatType }));
        responseText = "✅ 对话历史已清除";
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
  ): Promise<void> {
    try {
      await this.enqueueMessage({
        chatId,
        text: instructions,
        chatType,
        messageId,
        ...(actor?.userId ? { userId: actor.userId } : {}),
        ...(actor?.username ? { username: actor.username } : {}),
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
      // 实时获取最新的 authToken
      const authToken = await this.getAuthToken();

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

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authToken,
        },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      if (!response.ok) {
        this.logger.error(`发送消息失败: ${response.status} - ${responseText}`);
        throw new Error(
          `QQ send failed: HTTP ${response.status}: ${responseText}`,
        );
      }

      try {
        const parsed = JSON.parse(responseText) as {
          id?: string;
          message_id?: string;
          msg_id?: string;
          data?: {
            id?: string;
            message_id?: string;
            msg_id?: string;
          };
        };
        const outboundMessageId =
          (typeof parsed.id === "string" && parsed.id.trim()) ||
          (typeof parsed.message_id === "string" && parsed.message_id.trim()) ||
          (typeof parsed.msg_id === "string" && parsed.msg_id.trim()) ||
          (typeof parsed.data?.id === "string" && parsed.data.id.trim()) ||
          (typeof parsed.data?.message_id === "string" &&
            parsed.data.message_id.trim()) ||
          (typeof parsed.data?.msg_id === "string" &&
            parsed.data.msg_id.trim()) ||
          "";
        this.trackBotOutboundMessageId(outboundMessageId);
      } catch {
        // ignore parse failure
      }

      // 成功也保留一点响应内容，便于排查“返回成功但用户侧不可见”的边界情况
      this.logger.debug(
        `消息发送成功: ${response.status}${responseText ? ` - ${responseText}` : ""}`,
      );
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

    // 清理心跳定时器
    this.stopHeartbeat();

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
    config.groupAccess,
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
