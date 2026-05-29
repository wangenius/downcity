/**
 * Agent 本机 RPC Client。
 *
 * 职责说明（中文）
 * - 为 `RemoteAgent(rpc://...)` 提供最小客户端实现。
 * - 复用逐行 JSON（NDJSON）协议，与本机 RPC Server 对接。
 * - 当前只承载 Session actor 所需方法。
 */

import net from "node:net";
import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";

type RpcClientRequest =
  | {
      id: string;
      method: "sdk.sessions.list";
      params?: AgentListSessionsInput;
    }
  | {
      id: string;
      method: "sdk.sessions.create";
      params?: AgentCreateSessionInput;
    }
  | {
      id: string;
      method: "sdk.sessions.get";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.prompt";
      params: {
        sessionId: string;
        input: AgentSessionPromptInput;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.history";
      params: {
        sessionId: string;
        input?: AgentSessionHistoryInput;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.system";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.fork";
      params: {
        sessionId: string;
        messageId?: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.subscribe";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "sdk.sessions.unsubscribe";
      params: {
        subscriptionId: string;
      };
    };

type RpcResponseFrame = {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

type RpcReadyFrame = {
  type: "ready";
  subscriptionId: string;
};

type RpcEventFrame = {
  type: "event";
  subscriptionId: string;
  event: AgentSessionEvent;
};

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
};

type RpcSubscription = {
  on_ready: () => void;
  on_event: (event: AgentSessionEvent) => void;
};

/**
 * RPC endpoint。
 */
export interface RpcClientEndpoint {
  /** RPC host。 */
  host: string;
  /** RPC port。 */
  port: number;
}

/**
 * RPC Session 订阅句柄。
 */
export interface RpcSessionSubscription {
  /** 当前订阅 id。 */
  subscription_id: string;
  /** 取消订阅。 */
  unsubscribe(): Promise<void>;
}

/**
 * RPC Client。
 */
export class RpcClient {
  private readonly endpoint: RpcClientEndpoint;
  private socket: net.Socket | null = null;
  private connect_promise: Promise<void> | null = null;
  private buffered = "";
  private readonly pending_requests = new Map<string, PendingRequest>();
  private readonly subscriptions = new Map<string, RpcSubscription>();
  private request_sequence = 0;

  constructor(endpoint: RpcClientEndpoint) {
    this.endpoint = endpoint;
  }

  /**
   * 列出远程 session。
   */
  async list_sessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    const data = await this.request<{ page: AgentSessionSummaryPage }>({
      method: "sdk.sessions.list",
      params: input,
    });
    return data.page;
  }

  /**
   * 创建远程 session。
   */
  async create_session(
    input?: AgentCreateSessionInput,
  ): Promise<AgentSessionInfo> {
    const data = await this.request<{ session: AgentSessionInfo }>({
      method: "sdk.sessions.create",
      params: input,
    });
    return data.session;
  }

  /**
   * 获取远程 session 信息。
   */
  async get_session(session_id: string): Promise<AgentSessionInfo> {
    const data = await this.request<{ session: AgentSessionInfo }>({
      method: "sdk.sessions.get",
      params: {
        sessionId: session_id,
      },
    });
    return data.session;
  }

  /**
   * 发送 prompt。
   */
  async prompt_session(params: {
    session_id: string;
    input: AgentSessionPromptInput;
  }): Promise<{ id: string }> {
    const data = await this.request<{ turn: { id: string } }>({
      method: "sdk.sessions.prompt",
      params: {
        sessionId: params.session_id,
        input: params.input,
      },
    });
    return data.turn;
  }

  /**
   * 读取 history。
   */
  async get_session_history(params: {
    session_id: string;
    input?: AgentSessionHistoryInput;
  }): Promise<AgentSessionHistoryPage> {
    const data = await this.request<{ history: AgentSessionHistoryPage }>({
      method: "sdk.sessions.history",
      params: {
        sessionId: params.session_id,
        input: params.input,
      },
    });
    return data.history;
  }

  /**
   * 读取 system snapshot。
   */
  async get_session_system(session_id: string): Promise<AgentSessionSystemSnapshot> {
    const data = await this.request<{ system: AgentSessionSystemSnapshot }>({
      method: "sdk.sessions.system",
      params: {
        sessionId: session_id,
      },
    });
    return data.system;
  }

  /**
   * 分叉 session。
   */
  async fork_session(params: {
    session_id: string;
    message_id?: string;
  }): Promise<AgentSessionInfo> {
    const data = await this.request<{ session: AgentSessionInfo }>({
      method: "sdk.sessions.fork",
      params: {
        sessionId: params.session_id,
        ...(params.message_id ? { messageId: params.message_id } : {}),
      },
    });
    return data.session;
  }

  /**
   * 订阅 session 事件。
   */
  async subscribe_session(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<RpcSessionSubscription> {
    const data = await this.request<{ subscriptionId: string }>({
      method: "sdk.sessions.subscribe",
      params: {
        sessionId: params.session_id,
      },
    });
    const subscription_id = String(data.subscriptionId || "").trim();
    if (!subscription_id) {
      throw new Error("RPC subscription did not return subscriptionId");
    }
    this.subscriptions.set(subscription_id, {
      on_ready: params.on_ready,
      on_event: params.on_event,
    });
    params.on_ready();
    return {
      subscription_id,
      unsubscribe: async () => {
        this.subscriptions.delete(subscription_id);
        await this.request({
          method: "sdk.sessions.unsubscribe",
          params: {
            subscriptionId: subscription_id,
          },
        });
      },
    };
  }

  /**
   * 关闭底层连接。
   */
  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.connect_promise = null;
    this.buffered = "";
    for (const pending of this.pending_requests.values()) {
      pending.reject(new Error("RPC client closed"));
    }
    this.pending_requests.clear();
    this.fail_all_subscriptions("RPC client closed");
    if (!socket) return;
    await new Promise<void>((resolve) => {
      socket.end(() => resolve());
    });
  }

  private async request<TData = unknown>(input: {
    method: RpcClientRequest["method"];
    params?: unknown;
  }): Promise<TData> {
    await this.ensure_connected();
    const socket = this.socket;
    if (!socket) {
      throw new Error("RPC socket is not connected");
    }
    const id = `rpc_${Date.now()}_${this.request_sequence += 1}`;
    const request = (
      input.params === undefined
        ? {
            id,
            method: input.method,
          }
        : {
            id,
            method: input.method,
            params: input.params as never,
          }
    ) as RpcClientRequest;
    const result = await new Promise<TData>((resolve, reject) => {
      this.pending_requests.set(id, { resolve, reject });
      socket.write(`${JSON.stringify(request)}\n`, (error) => {
        if (!error) return;
        this.pending_requests.delete(id);
        reject(error);
      });
    });
    return result;
  }

  private async ensure_connected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connect_promise) {
      await this.connect_promise;
      return;
    }

    this.connect_promise = new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: this.endpoint.host,
        port: this.endpoint.port,
      });

      socket.setEncoding("utf8");

      socket.on("connect", () => {
        this.socket = socket;
        resolve();
      });

      socket.on("data", (chunk: string) => {
        this.consume_data(chunk);
      });

      socket.on("error", (error) => {
        if (!this.socket) {
          reject(error);
          return;
        }
        this.fail_all_pending(error);
        this.fail_all_subscriptions(
          error instanceof Error ? error.message : String(error),
        );
      });

      socket.on("close", () => {
        this.socket = null;
        this.connect_promise = null;
        this.fail_all_pending(new Error("RPC socket closed"));
        this.fail_all_subscriptions("RPC socket closed");
      });
    });

    try {
      await this.connect_promise;
    } catch (error) {
      this.connect_promise = null;
      throw error;
    }
  }

  private consume_data(chunk: string): void {
    this.buffered += chunk;
    let newline_index = this.buffered.indexOf("\n");
    while (newline_index >= 0) {
      const line = this.buffered.slice(0, newline_index).trim();
      this.buffered = this.buffered.slice(newline_index + 1);
      if (line) {
        this.consume_line(line);
      }
      newline_index = this.buffered.indexOf("\n");
    }
  }

  private consume_line(line: string): void {
    const payload = JSON.parse(line) as RpcResponseFrame | RpcReadyFrame | RpcEventFrame;
    if ("type" in payload && payload.type === "ready") {
      const subscription = this.subscriptions.get(payload.subscriptionId);
      subscription?.on_ready();
      return;
    }
    if ("type" in payload && payload.type === "event") {
      const subscription = this.subscriptions.get(payload.subscriptionId);
      subscription?.on_event(payload.event);
      return;
    }
    const pending = this.pending_requests.get(payload.id);
    if (!pending) return;
    this.pending_requests.delete(payload.id);
    if (payload.success) {
      pending.resolve(payload.data);
      return;
    }
    pending.reject(new Error(String(payload.error || "RPC request failed")));
  }

  private fail_all_pending(error: unknown): void {
    for (const pending of this.pending_requests.values()) {
      pending.reject(error);
    }
    this.pending_requests.clear();
  }

  private fail_all_subscriptions(message: string): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.on_event({
        type: "error",
        message,
      });
    }
    this.subscriptions.clear();
  }
}

/**
 * 解析 rpc url。
 */
export function parse_rpc_url(url_input: string): RpcClientEndpoint {
  const url = new URL(url_input);
  if (url.protocol !== "rpc:") {
    throw new Error(`Unsupported RPC protocol: ${url.protocol}`);
  }
  const host = String(url.hostname || "").trim();
  const port = Number.parseInt(String(url.port || ""), 10);
  if (!host) {
    throw new Error("RPC url requires a host");
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("RPC url requires a valid port");
  }
  return {
    host,
    port,
  };
}
