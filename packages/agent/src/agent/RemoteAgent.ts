/**
 * RemoteAgent：统一远程 SDK 客户端。
 *
 * 关键点（中文）
 * - 对外只暴露一个 `url` 入口，不向用户暴露 transport 细节。
 * - 当前内部支持 `http/https` 与 `rpc` 两种访问方式。
 * - `RemoteAgent` 只负责远程访问与 turn handle 合成，不重复实现第二套会话编排器。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionForkInput,
  AgentSessionSetInput,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
  RemoteAgentOptions,
  RemoteAgentSession,
} from "@/types/agent/AgentTypes.js";
import type {
  AgentSessionEvent,
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  AgentSessionTurnHandle,
  AgentSessionTurnResult,
} from "@/types/sdk/AgentSessionTurn.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { RpcClient, parse_rpc_url } from "@/rpc/Client.js";

type Deferred<T> = {
  /**
   * 当前延迟 Promise。
   */
  promise: Promise<T>;
  /**
   * 兑现 Promise。
   */
  resolve: (value: T) => void;
};

type RemoteTurnLifecycle = {
  /**
   * 当前 turnId。
   */
  turnId: string;
  /**
   * 当前 turn 的最终结果快照。
   */
  result: AgentSessionTurnResult | null;
  /**
   * 当前 turn 完成 Promise 控制器。
   */
  deferred_finished: Deferred<AgentSessionTurnResult>;
};

type TransportSubscription = {
  /**
   * 关闭当前订阅。
   */
  close(): Promise<void>;
};

type RemoteSessionTransport = {
  /**
   * 读取 session 信息。
   */
  get_info(session_id: string): Promise<AgentSessionInfo>;
  /**
   * 发送 prompt。
   */
  prompt(
    session_id: string,
    input: AgentSessionPromptInput,
  ): Promise<{ id: string }>;
  /**
   * 订阅 session 事件。
   */
  subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<TransportSubscription>;
  /**
   * 读取 history。
   */
  history(
    session_id: string,
    input?: AgentSessionHistoryInput,
  ): Promise<AgentSessionHistoryPage>;
  /**
   * 读取 system snapshot。
   */
  system(session_id: string): Promise<AgentSessionSystemSnapshot>;
  /**
   * 分叉 session。
   */
  fork(
    session_id: string,
    input?: AgentSessionForkInput | string,
  ): Promise<AgentSessionInfo>;
};

type RemoteAgentTransport = RemoteSessionTransport & {
  /**
   * 新建 session。
   */
  create_session(input?: AgentCreateSessionInput): Promise<AgentSessionInfo>;
  /**
   * 列出 sessions。
   */
  list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage>;
  /**
   * 关闭 transport 持有的长期连接。
   */
  close?(): Promise<void>;
};

type SdkEventsReadyFrame = {
  /**
   * SDK HTTP events 连接内部 ready 标记。
   */
  type: "sdk-events-ready";
};

/**
 * 远程 Session 客户端。
 */
class RemoteSession implements RemoteAgentSession {
  readonly id: string;

  private readonly transport: RemoteSessionTransport;
  private readonly event_hub = new SessionEventHub();
  private readonly turns_by_id = new Map<string, RemoteTurnLifecycle>();
  private readonly completed_turn_ids: string[] = [];
  private event_pump_connect_promise: Promise<void> | null = null;
  private event_pump_running = false;
  private event_subscriber_count = 0;
  private event_subscription: TransportSubscription | null = null;

  constructor(transport: RemoteSessionTransport, session_id: string) {
    this.transport = transport;
    this.id = session_id;
  }

  /**
   * 远程 session 当前不支持直接注入本地模型实例。
   */
  async set(_input: AgentSessionSetInput): Promise<void> {
    throw new Error(
      "Remote session.set({ model }) is not supported in v1. Configure the model on the server-side local Agent session instead.",
    );
  }

  /**
   * 读取当前远程 session 详情。
   */
  async getInfo(): Promise<AgentSessionInfo> {
    return await this.transport.get_info(this.id);
  }

  /**
   * 向当前远程 session 追加一条新的 prompt。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("remote session.prompt requires a non-empty query");
    }

    await this.ensure_event_pump();
    const turn = await this.transport.prompt(this.id, input);
    const lifecycle = this.ensure_turn_lifecycle(turn.id);
    return create_turn_handle(lifecycle);
  }

  /**
   * 订阅当前远程 session 的 future 事件。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    this.event_subscriber_count += 1;
    void this.ensure_event_pump().catch((error) => {
      this.event_hub.publish({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const unsubscribe = this.event_hub.subscribe(subscriber);
    return () => {
      unsubscribe();
      this.event_subscriber_count = Math.max(0, this.event_subscriber_count - 1);
      void this.maybe_stop_event_pump();
    };
  }

  /**
   * 读取远程消息历史。
   */
  async history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage> {
    return await this.transport.history(this.id, input);
  }

  /**
   * 读取远程 session 当前生效的 system prompt 快照。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    return await this.transport.system(this.id);
  }

  /**
   * 分叉远程 session。
   */
  async fork(input?: AgentSessionForkInput | string): Promise<RemoteAgentSession> {
    const info = await this.transport.fork(this.id, input);
    return new RemoteSession(this.transport, info.sessionId);
  }

  private async ensure_event_pump(): Promise<void> {
    if (this.event_pump_connect_promise) {
      await this.event_pump_connect_promise;
      return;
    }
    if (this.event_pump_running) return;

    this.event_pump_connect_promise = (async () => {
      let resolved_ready = false;
      this.event_subscription = await this.transport.subscribe({
        session_id: this.id,
        on_ready: () => {
          resolved_ready = true;
        },
        on_event: (event) => {
          this.handle_event(event);
        },
      });
      this.event_pump_running = true;
      if (!resolved_ready) {
        throw new Error("Remote session events connection closed before ready");
      }
    })();

    try {
      await this.event_pump_connect_promise;
    } finally {
      this.event_pump_connect_promise = null;
    }
  }

  private handle_event(event: AgentSessionEvent): void {
    if (event.type === "error") {
      this.fail_pending_turns(event.message);
    }
    const turn_id = extract_turn_id(event);
    if (turn_id) {
      this.ensure_turn_lifecycle(turn_id);
    }

    if (event.type === "turn-finish") {
      const lifecycle = this.ensure_turn_lifecycle(event.turnId);
      const result: AgentSessionTurnResult = {
        turnId: event.turnId,
        text: event.text,
        success: event.success,
        ...(event.error ? { error: event.error } : {}),
      };
      lifecycle.result = result;
      lifecycle.deferred_finished.resolve(result);
      this.remember_completed_turn(event.turnId);
      void this.maybe_stop_event_pump();
    }

    this.event_hub.publish(event);
  }

  private ensure_turn_lifecycle(turn_id: string): RemoteTurnLifecycle {
    const cached = this.turns_by_id.get(turn_id);
    if (cached) return cached;
    const created: RemoteTurnLifecycle = {
      turnId: turn_id,
      result: null,
      deferred_finished: create_deferred<AgentSessionTurnResult>(),
    };
    this.turns_by_id.set(turn_id, created);
    return created;
  }

  private fail_pending_turns(message: string): void {
    for (const lifecycle of this.turns_by_id.values()) {
      if (lifecycle.result) continue;
      const result: AgentSessionTurnResult = {
        turnId: lifecycle.turnId,
        text: "",
        success: false,
        error: message,
      };
      lifecycle.result = result;
      lifecycle.deferred_finished.resolve(result);
      this.remember_completed_turn(lifecycle.turnId);
    }
  }

  private remember_completed_turn(turn_id: string): void {
    this.completed_turn_ids.push(turn_id);
    while (this.completed_turn_ids.length > 200) {
      const oldest_turn_id = this.completed_turn_ids.shift();
      if (oldest_turn_id) {
        this.turns_by_id.delete(oldest_turn_id);
      }
    }
  }

  private async maybe_stop_event_pump(): Promise<void> {
    if (this.event_subscriber_count > 0) return;
    if ([...this.turns_by_id.values()].some((item) => item.result === null)) return;
    const current = this.event_subscription;
    this.event_subscription = null;
    this.event_pump_running = false;
    if (!current) return;
    await current.close().catch((error) => {
      this.fail_pending_turns(
        error instanceof Error ? error.message : String(error),
      );
    });
  }
}

/**
 * RemoteAgent：远程 Agent 客户端。
 */
export class RemoteAgent {
  private readonly transport: RemoteAgentTransport;

  constructor(options: RemoteAgentOptions) {
    const url = String(options.url || "").trim();
    if (!url) {
      throw new Error("RemoteAgent requires a non-empty url");
    }
    this.transport = create_remote_agent_transport(url, options.token);
  }

  /**
   * 新建一个远程 session。
   */
  async createSession(
    input?: AgentCreateSessionInput,
  ): Promise<RemoteAgentSession> {
    const info = await this.transport.create_session(input);
    return new RemoteSession(this.transport, info.sessionId);
  }

  /**
   * 获取一个已存在的远程 session。
   */
  async getSession(sessionId: string): Promise<RemoteAgentSession> {
    const resolved_session_id = String(sessionId || "").trim();
    if (!resolved_session_id) {
      throw new Error("getSession requires a non-empty sessionId");
    }
    const info = await this.transport.get_info(resolved_session_id);
    return new RemoteSession(this.transport, info.sessionId);
  }

  /**
   * 列出远程 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await this.transport.list_sessions(input);
  }

  /**
   * 关闭远程 transport。
   *
   * 关键点（中文）
   * - `rpc://` 会关闭底层长连接。
   * - `http://` / `https://` 没有常驻连接，调用时是安全 no-op。
   */
  async close(): Promise<void> {
    await this.transport.close?.();
  }
}

class HttpRemoteAgentTransport implements RemoteAgentTransport {
  private readonly base_url: string;
  private readonly token: string;

  constructor(url: string, token?: string) {
    this.base_url = url.replace(/\/+$/, "");
    this.token = String(token || "").trim();
  }

  private headers(input?: Record<string, string>): Headers {
    const headers = new Headers(input);
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    return headers;
  }

  async create_session(input?: AgentCreateSessionInput): Promise<AgentSessionInfo> {
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    }>(`${this.base_url}/api/sdk/sessions`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
      }),
    });
    if (!payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session create failed"));
    }
    return payload.session;
  }

  async get_info(session_id: string): Promise<AgentSessionInfo> {
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    }>(`${this.base_url}/api/sdk/sessions/${encodeURIComponent(session_id)}`, {
      headers: this.headers(),
    });
    if (!payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session info failed"));
    }
    return payload.session;
  }

  async prompt(
    session_id: string,
    input: AgentSessionPromptInput,
  ): Promise<{ id: string }> {
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      turn?: {
        id?: string;
      };
    }>(`${this.base_url}/api/sdk/sessions/${encodeURIComponent(session_id)}/prompt`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        query: input.query,
      }),
    });
    const id = String(payload.turn?.id || "").trim();
    if (!payload.success || !id) {
      throw new Error(String(payload.error || "Remote session prompt failed"));
    }
    return { id };
  }

  async subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<TransportSubscription> {
    const abort_controller = new AbortController();
    let resolve_ready!: () => void;
    let reject_ready!: (error: unknown) => void;
    const ready_promise = new Promise<void>((resolve, reject) => {
      resolve_ready = resolve;
      reject_ready = reject;
    });
    const response = await fetch(
      `${this.base_url}/api/sdk/sessions/${encodeURIComponent(params.session_id)}/events`,
      {
        headers: this.headers(),
        signal: abort_controller.signal,
      },
    );
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Remote session events failed (${response.status})`);
    }
    void consume_http_event_stream({
      body: response.body,
      abort_controller,
      on_ready: () => {
        params.on_ready();
        resolve_ready();
      },
      on_ready_error: (error) => {
        reject_ready(error);
      },
      on_event: params.on_event,
    });
    await ready_promise;
    return {
      close: async () => {
        abort_controller.abort();
      },
    };
  }

  async history(
    session_id: string,
    input?: AgentSessionHistoryInput,
  ): Promise<AgentSessionHistoryPage> {
    const query = new URLSearchParams();
    if (input?.limit !== undefined) query.set("limit", String(input.limit));
    if (input?.cursor) query.set("cursor", input.cursor);
    if (input?.order) query.set("order", input.order);
    if (input?.view) query.set("view", input.view);
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      history?: AgentSessionHistoryPage;
    }>(
      `${this.base_url}/api/sdk/sessions/${encodeURIComponent(session_id)}/history${
        query.size > 0 ? `?${query.toString()}` : ""
      }`,
      {
        headers: this.headers(),
      },
    );
    if (!payload.success || !payload.history || !Array.isArray(payload.history.items)) {
      throw new Error(String(payload.error || "Remote session history failed"));
    }
    return payload.history;
  }

  async system(session_id: string): Promise<AgentSessionSystemSnapshot> {
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      system?: AgentSessionSystemSnapshot;
    }>(`${this.base_url}/api/sdk/sessions/${encodeURIComponent(session_id)}/system`, {
      headers: this.headers(),
    });
    if (!payload.success || !payload.system || !Array.isArray(payload.system.blocks)) {
      throw new Error(String(payload.error || "Remote session system failed"));
    }
    return payload.system;
  }

  async fork(
    session_id: string,
    input?: AgentSessionForkInput | string,
  ): Promise<AgentSessionInfo> {
    const message_id =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    }>(`${this.base_url}/api/sdk/sessions/${encodeURIComponent(session_id)}/fork`, {
      method: "POST",
      headers: this.headers({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ...(message_id ? { messageId: message_id } : {}),
      }),
    });
    if (!payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session fork failed"));
    }
    return payload.session;
  }

  async list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage> {
    const query = new URLSearchParams();
    if (input?.limit !== undefined) query.set("limit", String(input.limit));
    if (input?.cursor) query.set("cursor", input.cursor);
    if (input?.query) query.set("query", input.query);
    const payload = await read_http_json<{
      success?: boolean;
      error?: string;
      page?: AgentSessionSummaryPage;
    }>(
      `${this.base_url}/api/sdk/sessions${query.size > 0 ? `?${query.toString()}` : ""}`,
      {
        headers: this.headers(),
      },
    );
    if (!payload.success || !payload.page) {
      throw new Error(String(payload.error || "Remote sessions list failed"));
    }
    return payload.page;
  }
}

class RpcRemoteAgentTransport implements RemoteAgentTransport {
  private readonly client: RpcClient;

  constructor(url: string) {
    this.client = new RpcClient(parse_rpc_url(url));
  }

  async create_session(input?: AgentCreateSessionInput): Promise<AgentSessionInfo> {
    return await this.client.create_session(input);
  }

  async get_info(session_id: string): Promise<AgentSessionInfo> {
    return await this.client.get_session(session_id);
  }

  async prompt(
    session_id: string,
    input: AgentSessionPromptInput,
  ): Promise<{ id: string }> {
    return await this.client.prompt_session({
      session_id,
      input,
    });
  }

  async subscribe(params: {
    session_id: string;
    on_ready: () => void;
    on_event: (event: AgentSessionEvent) => void;
  }): Promise<TransportSubscription> {
    const subscription = await this.client.subscribe_session({
      session_id: params.session_id,
      on_ready: params.on_ready,
      on_event: params.on_event,
    });
    return {
      close: async () => {
        await subscription.unsubscribe();
      },
    };
  }

  async history(
    session_id: string,
    input?: AgentSessionHistoryInput,
  ): Promise<AgentSessionHistoryPage> {
    return await this.client.get_session_history({
      session_id,
      input,
    });
  }

  async system(session_id: string): Promise<AgentSessionSystemSnapshot> {
    return await this.client.get_session_system(session_id);
  }

  async fork(
    session_id: string,
    input?: AgentSessionForkInput | string,
  ): Promise<AgentSessionInfo> {
    const message_id =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    return await this.client.fork_session({
      session_id,
      ...(message_id ? { message_id } : {}),
    });
  }

  async list_sessions(input?: AgentListSessionsInput): Promise<AgentSessionSummaryPage> {
    return await this.client.list_sessions(input);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

function create_remote_agent_transport(
  url: string,
  token?: string,
): RemoteAgentTransport {
  if (/^https?:\/\//i.test(url)) {
    return new HttpRemoteAgentTransport(url, token);
  }
  if (/^rpc:\/\//i.test(url)) {
    return new RpcRemoteAgentTransport(url);
  }
  throw new Error(
    `Unsupported RemoteAgent url protocol: ${url}. Expected http://, https://, or rpc://`,
  );
}

async function read_http_json<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const message = extract_error_message(payload);
    throw new Error(message || `HTTP ${response.status}`);
  }
  return payload;
}

async function consume_http_event_stream(params: {
  body: ReadableStream<Uint8Array>;
  abort_controller: AbortController;
  on_ready: () => void;
  on_ready_error: (error: unknown) => void;
  on_event: (event: AgentSessionEvent) => void;
}): Promise<void> {
  const decoder = new TextDecoder();
  const reader = params.body.getReader();
  let buffered = "";
  let ready_resolved = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline_index = buffered.indexOf("\n");
      while (newline_index >= 0) {
        const line = buffered.slice(0, newline_index).trim();
        buffered = buffered.slice(newline_index + 1);
        if (line) {
          const value = JSON.parse(line) as unknown;
          if (is_sdk_events_ready_frame(value)) {
            ready_resolved = true;
            params.on_ready();
          } else {
            params.on_event(value as AgentSessionEvent);
          }
        }
        newline_index = buffered.indexOf("\n");
      }
    }

    const tail = buffered.trim();
    if (tail) {
      const value = JSON.parse(tail) as unknown;
      if (is_sdk_events_ready_frame(value)) {
        ready_resolved = true;
        params.on_ready();
      } else {
        params.on_event(value as AgentSessionEvent);
      }
    }

    if (!params.abort_controller.signal.aborted) {
      if (!ready_resolved) {
        const error = new Error("Remote session events connection closed before ready");
        params.on_ready_error(error);
        throw error;
      }
      params.on_event({
        type: "error",
        message: "Remote session events connection closed",
      });
    }
  } catch (error) {
    if (!params.abort_controller.signal.aborted) {
      if (!ready_resolved) {
        params.on_ready_error(error);
      }
      params.on_event({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function extract_error_message(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  if ("error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return "";
}

function create_deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((inner_resolve) => {
    resolve = inner_resolve;
  });
  return {
    promise,
    resolve,
  };
}

function is_sdk_events_ready_frame(value: unknown): value is SdkEventsReadyFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "sdk-events-ready"
  );
}

function create_turn_handle(
  lifecycle: RemoteTurnLifecycle,
): AgentSessionTurnHandle {
  return {
    id: lifecycle.turnId,
    get result() {
      return lifecycle.result;
    },
    finished: lifecycle.deferred_finished.promise,
  };
}

function extract_turn_id(event: AgentSessionEvent): string | null {
  switch (event.type) {
    case "turn-start":
    case "text-delta":
    case "reasoning-delta":
    case "tool-call":
    case "tool-result":
    case "assistant-step":
    case "turn-finish":
      return event.turnId;
    default:
      return null;
  }
}
