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
import type { JsonValue } from "@/types/common/Json.js";
import type {
  PluginActionResult,
  PluginAvailability,
  PluginCommandResult,
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateSnapshot,
  PluginView,
} from "@/plugin/types/Plugin.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { ControlSessionExecuteAttachmentInput } from "@/runtime/server/http/control/types/ControlSessionExecute.js";

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
    }
  | {
      id: string;
      method: "internal.status.get";
    }
  | {
      id: string;
      method: "internal.sessions.execute";
      params: {
        sessionId: string;
        instructions: string;
        attachments?: ControlSessionExecuteAttachmentInput[];
      };
    }
  | {
      id: string;
      method: "internal.sessions.clear_messages";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.sessions.clear_chat_history";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.sessions.resolve_system_prompt";
      params: {
        sessionId: string;
      };
    }
  | {
      id: string;
      method: "internal.plugins.catalog";
    }
  | {
      id: string;
      method: "internal.plugins.list";
    }
  | {
      id: string;
      method: "internal.plugins.control";
      params: {
        pluginName: string;
        action: PluginStateControlAction;
      };
    }
  | {
      id: string;
      method: "internal.plugins.command";
      params: {
        pluginName: string;
        command: string;
        payload?: JsonValue;
        schedule?: JsonValue;
      };
    }
  | {
      id: string;
      method: "internal.plugins.availability";
      params: {
        pluginName: string;
      };
    }
  | {
      id: string;
      method: "internal.plugins.action";
      params: {
        pluginName: string;
        actionName: string;
        payload?: JsonValue;
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
 * RPC system prompt 分段条目。
 */
export interface RpcSystemPromptSectionItem {
  /** 消息序号。 */
  index: number;
  /** system message 文本内容。 */
  content: string;
}

/**
 * RPC system prompt 分段。
 */
export interface RpcSystemPromptSection {
  /** 分段稳定 key。 */
  key: string;
  /** 分段展示标题。 */
  title: string;
  /** 分段内消息条目。 */
  items: RpcSystemPromptSectionItem[];
}

/**
 * RPC system prompt 响应。
 */
export interface RpcSystemPromptPayload {
  /** 请求是否成功。 */
  success?: boolean;
  /** 当前 session id。 */
  sessionId: string;
  /** system message 总数。 */
  totalMessages: number;
  /** system message 总字符数。 */
  totalChars: number;
  /** system message 分段。 */
  sections: RpcSystemPromptSection[];
}

/**
 * RPC session execute 响应。
 */
export interface RpcSessionExecuteResult {
  /** 执行是否成功。 */
  success: boolean;
  /** 失败错误信息。 */
  error?: string;
  /** assistant 原始消息。 */
  assistantMessage?: unknown;
  /** 用户可见文本。 */
  userVisible: string;
  /** 是否进入队列。 */
  queued: boolean;
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
   * 读取 Agent 内部状态。
   */
  async get_internal_status(): Promise<{ status: string }> {
    return await this.request<{ status: string }>({
      method: "internal.status.get",
    });
  }

  /**
   * 在 Agent runtime 内执行一轮 session 指令。
   */
  async execute_internal_session(params: {
    session_id: string;
    instructions: string;
    attachments?: ControlSessionExecuteAttachmentInput[];
  }): Promise<{ sessionId: string; result: RpcSessionExecuteResult }> {
    return await this.request<{
      sessionId: string;
      result: RpcSessionExecuteResult;
    }>({
      method: "internal.sessions.execute",
      params: {
        sessionId: params.session_id,
        instructions: params.instructions,
        ...(params.attachments !== undefined ? { attachments: params.attachments } : {}),
      },
    });
  }

  /**
   * 清空 Agent runtime 内指定 session 的消息。
   */
  async clear_internal_session_messages(
    session_id: string,
  ): Promise<{ sessionId: string; cleared: boolean }> {
    return await this.request<{ sessionId: string; cleared: boolean }>({
      method: "internal.sessions.clear_messages",
      params: {
        sessionId: session_id,
      },
    });
  }

  /**
   * 清空 Agent runtime 内指定 session 的 chat history。
   */
  async clear_internal_chat_history(
    session_id: string,
  ): Promise<{ sessionId: string; cleared: boolean }> {
    return await this.request<{ sessionId: string; cleared: boolean }>({
      method: "internal.sessions.clear_chat_history",
      params: {
        sessionId: session_id,
      },
    });
  }

  /**
   * 解析 Agent runtime 内指定 session 的 system prompt。
   */
  async resolve_internal_system_prompt(
    session_id: string,
  ): Promise<RpcSystemPromptPayload> {
    return await this.request<RpcSystemPromptPayload>({
      method: "internal.sessions.resolve_system_prompt",
      params: {
        sessionId: session_id,
      },
    });
  }

  /**
   * 列出 Agent runtime 注册的 plugin catalog。
   */
  async list_internal_plugin_catalog(): Promise<PluginView[]> {
    const data = await this.request<{ plugins: PluginView[] }>({
      method: "internal.plugins.catalog",
    });
    return Array.isArray(data.plugins) ? data.plugins : [];
  }

  /**
   * 列出 Agent runtime 内 plugin 状态。
   */
  async list_internal_plugin_states(): Promise<PluginStateSnapshot[]> {
    const data = await this.request<{ plugins: PluginStateSnapshot[] }>({
      method: "internal.plugins.list",
    });
    return Array.isArray(data.plugins) ? data.plugins : [];
  }

  /**
   * 控制 Agent runtime 内 plugin 生命周期。
   */
  async control_internal_plugin(params: {
    plugin_name: string;
    action: PluginStateControlAction;
  }): Promise<PluginStateControlResult> {
    return await this.request<PluginStateControlResult>({
      method: "internal.plugins.control",
      params: {
        pluginName: params.plugin_name,
        action: params.action,
      },
    });
  }

  /**
   * 执行 Agent runtime 内 plugin command。
   */
  async run_internal_plugin_command(params: {
    plugin_name: string;
    command: string;
    payload?: JsonValue;
    schedule?: JsonValue;
  }): Promise<PluginCommandResult & { plugin?: PluginStateSnapshot }> {
    return await this.request<PluginCommandResult & { plugin?: PluginStateSnapshot }>({
      method: "internal.plugins.command",
      params: {
        pluginName: params.plugin_name,
        command: params.command,
        ...(params.payload !== undefined ? { payload: params.payload } : {}),
        ...(params.schedule !== undefined ? { schedule: params.schedule } : {}),
      },
    });
  }

  /**
   * 检查 Agent runtime 内 plugin 可用性。
   */
  async get_internal_plugin_availability(
    plugin_name: string,
  ): Promise<PluginAvailability> {
    const data = await this.request<{
      availability: PluginAvailability;
    }>({
      method: "internal.plugins.availability",
      params: {
        pluginName: plugin_name,
      },
    });
    return data.availability;
  }

  /**
   * 执行 Agent runtime 内 plugin action。
   */
  async run_internal_plugin_action(params: {
    plugin_name: string;
    action_name: string;
    payload?: JsonValue;
  }): Promise<PluginActionResult<JsonValue> & {
    pluginName?: string;
    actionName?: string;
  }> {
    return await this.request<PluginActionResult<JsonValue> & {
      pluginName?: string;
      actionName?: string;
    }>({
      method: "internal.plugins.action",
      params: {
        pluginName: params.plugin_name,
        actionName: params.action_name,
        ...(params.payload !== undefined ? { payload: params.payload } : {}),
      },
    });
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
