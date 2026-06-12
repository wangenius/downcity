/**
 * RemoteAgent HTTP transport。
 *
 * 关键点（中文）
 * - 只适配 Town Agent HTTP gateway 的 SDK routes。
 * - 不处理 RemoteSession 的 turn lifecycle，避免 transport 与 actor 逻辑混在一起。
 */

import type {
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSummaryPage,
  AgentSessionSystemSnapshot,
  RemoteAgentPluginActionInput,
  RemoteAgentPluginActionResult,
} from "@/types/agent/AgentTypes.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  RemoteAgentTransport,
  TransportSubscription,
} from "@/agent/remote/RemoteTransport.js";

type SdkEventsReadyFrame = {
  /** SDK HTTP events 连接内部 ready 标记。 */
  type: "sdk-events-ready";
};

/**
 * Town HTTP gateway transport。
 */
export class HttpRemoteAgentTransport implements RemoteAgentTransport {
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

  async run_plugin_action(
    input: RemoteAgentPluginActionInput,
  ): Promise<RemoteAgentPluginActionResult> {
    const payload = await read_http_action_json<RemoteAgentPluginActionResult>(
      `${this.base_url}/api/plugins/action`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          pluginName: input.plugin,
          actionName: input.action,
          ...(input.payload !== undefined ? { payload: input.payload } : {}),
        }),
      },
    );
    if (typeof payload.success !== "boolean") {
      throw new Error("Remote plugin action returned an invalid response");
    }
    return payload;
  }
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

async function read_http_action_json<T extends { success?: boolean }>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok && typeof payload.success !== "boolean") {
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

function is_sdk_events_ready_frame(value: unknown): value is SdkEventsReadyFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "sdk-events-ready"
  );
}
