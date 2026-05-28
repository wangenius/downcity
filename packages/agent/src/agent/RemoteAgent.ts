/**
 * RemoteAgent：远程 SDK 客户端。
 *
 * 关键点（中文）
 * - 面向已通过 `agent.start({ http: { ... } })` 暴露出来的远程/本地 HTTP 服务。
 * - 与本地 `Session` 保持同一套 Session actor 使用面：`prompt()` + `subscribe()`。
 * - `RemoteAgent` 只负责 transport 与本地 turn handle 合成，不重复实现第二套会话编排器。
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
  RemoteAgentSession,
  RemoteAgentOptions,
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
  deferredFinished: Deferred<AgentSessionTurnResult>;
};

type EventConnectionReady = {
  /**
   * 当前 ready promise 是否已经完成。
   */
  settled: boolean;
  /**
   * 标记事件连接已经在服务端完成订阅。
   */
  resolve: () => void;
  /**
   * 标记事件连接在 ready 前失败。
   */
  reject: (error: unknown) => void;
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
  private readonly baseUrl: string;
  private readonly eventHub = new SessionEventHub();
  private readonly turnsById = new Map<string, RemoteTurnLifecycle>();
  private readonly completedTurnIds: string[] = [];
  private eventPumpConnectPromise: Promise<void> | null = null;
  private eventPumpAbortController: AbortController | null = null;
  private eventPumpRunning = false;
  private eventSubscriberCount = 0;

  constructor(baseUrl: string, sessionId: string) {
    this.baseUrl = baseUrl;
    this.id = sessionId;
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
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session info failed"));
    }
    return payload.session;
  }

  /**
   * 向当前远程 session 追加一条新的 prompt。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("remote session.prompt requires a non-empty query");
    }

    await this.ensureEventPump();

    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
        }),
      },
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      turn?: {
        id?: string;
      };
    };
    if (!response.ok || !payload.success || !payload.turn?.id) {
      throw new Error(String(payload.error || "Remote session prompt failed"));
    }

    const lifecycle = this.ensureTurnLifecycle(payload.turn.id);
    return createTurnHandle(lifecycle);
  }

  /**
   * 订阅当前远程 session 的 future 事件。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    this.eventSubscriberCount += 1;
    void this.ensureEventPump().catch((error) => {
      this.eventHub.publish({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const unsubscribe = this.eventHub.subscribe(subscriber);
    return () => {
      unsubscribe();
      this.eventSubscriberCount = Math.max(0, this.eventSubscriberCount - 1);
      this.maybeStopEventPump();
    };
  }

  /**
   * 读取远程消息历史。
   */
  async history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage> {
    const query = new URLSearchParams();
    if (input?.limit !== undefined) query.set("limit", String(input.limit));
    if (input?.cursor) query.set("cursor", input.cursor);
    if (input?.order) query.set("order", input.order);
    if (input?.view) query.set("view", input.view);
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/history${
        query.size > 0 ? `?${query.toString()}` : ""
      }`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      history?: AgentSessionHistoryPage;
    };
    if (
      !response.ok ||
      !payload.success ||
      !payload.history ||
      !Array.isArray(payload.history.items)
    ) {
      throw new Error(String(payload.error || "Remote session history failed"));
    }
    return payload.history;
  }

  /**
   * 读取远程 session 当前生效的 system prompt 快照。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/system`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      system?: AgentSessionSystemSnapshot;
    };
    if (
      !response.ok ||
      !payload.success ||
      !payload.system ||
      !Array.isArray(payload.system.blocks)
    ) {
      throw new Error(String(payload.error || "Remote session system failed"));
    }
    return payload.system;
  }

  /**
   * 分叉远程 session。
   */
  async fork(input?: AgentSessionForkInput | string): Promise<RemoteAgentSession> {
    const messageId =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/fork`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(messageId ? { messageId } : {}),
        }),
      },
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session fork failed"));
    }
    return new RemoteSession(this.baseUrl, payload.session.sessionId);
  }

  private async ensureEventPump(): Promise<void> {
    if (this.eventPumpConnectPromise) {
      await this.eventPumpConnectPromise;
      return;
    }
    if (this.eventPumpRunning) return;

    this.eventPumpConnectPromise = (async () => {
      const abortController = new AbortController();
      this.eventPumpAbortController = abortController;
      const response = await fetch(
        `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(this.id)}/events`,
        {
          signal: abortController.signal,
        },
      );
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        throw new Error(
          text || `Remote session events failed (${response.status})`,
        );
      }
      this.eventPumpRunning = true;
      const ready = createEventConnectionReady();
      void this.consumeEventConnection(response.body, abortController, ready)
        .finally(() => {
          const wasAborted = abortController.signal.aborted;
          this.eventPumpRunning = false;
          if (this.eventPumpAbortController === abortController) {
            this.eventPumpAbortController = null;
          }
          if (!wasAborted) {
            this.failPendingTurns("Remote session events connection closed");
            this.eventHub.publish({
              type: "error",
              message: "Remote session events connection closed",
            });
          }
        });
      await ready.promise;
    })();

    try {
      await this.eventPumpConnectPromise;
    } catch (error) {
      this.eventPumpAbortController = null;
      throw error;
    } finally {
      this.eventPumpConnectPromise = null;
    }
  }

  private async consumeEventConnection(
    body: ReadableStream<Uint8Array>,
    abortController: AbortController,
    ready: EventConnectionReady,
  ): Promise<void> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffered = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let newlineIndex = buffered.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = buffered.slice(0, newlineIndex).trim();
          buffered = buffered.slice(newlineIndex + 1);
          if (line) {
            this.handleEventLine(JSON.parse(line) as unknown, ready);
          }
          newlineIndex = buffered.indexOf("\n");
        }
      }
      const tail = buffered.trim();
      if (tail) {
        this.handleEventLine(JSON.parse(tail) as unknown, ready);
      }
      rejectEventConnectionReady(
        ready,
        "Remote session events connection closed before ready",
      );
    } catch (error) {
      if (!abortController.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        rejectEventConnectionReady(ready, message);
        this.failPendingTurns(message);
        this.eventHub.publish({
          type: "error",
          message,
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

  private handleEventLine(
    value: unknown,
    ready: EventConnectionReady,
  ): void {
    if (isSdkEventsReadyFrame(value)) {
      resolveEventConnectionReady(ready);
      return;
    }
    this.handleEvent(value as AgentSessionEvent);
  }

  private handleEvent(event: AgentSessionEvent): void {
    const turnId = extractTurnId(event);
    if (turnId) {
      this.ensureTurnLifecycle(turnId);
    }

    if (event.type === "turn-finish") {
      const lifecycle = this.ensureTurnLifecycle(event.turnId);
      const result: AgentSessionTurnResult = {
        turnId: event.turnId,
        text: event.text,
        success: event.success,
        ...(event.error ? { error: event.error } : {}),
      };
      lifecycle.result = result;
      lifecycle.deferredFinished.resolve(result);
      this.rememberCompletedTurn(event.turnId);
      this.maybeStopEventPump();
    }

    this.eventHub.publish(event);
  }

  private ensureTurnLifecycle(turnId: string): RemoteTurnLifecycle {
    const cached = this.turnsById.get(turnId);
    if (cached) return cached;
    const created: RemoteTurnLifecycle = {
      turnId,
      result: null,
      deferredFinished: createDeferred<AgentSessionTurnResult>(),
    };
    this.turnsById.set(turnId, created);
    return created;
  }

  private failPendingTurns(message: string): void {
    for (const lifecycle of this.turnsById.values()) {
      if (lifecycle.result) continue;
      const result: AgentSessionTurnResult = {
        turnId: lifecycle.turnId,
        text: "",
        success: false,
        error: message,
      };
      lifecycle.result = result;
      lifecycle.deferredFinished.resolve(result);
      this.rememberCompletedTurn(lifecycle.turnId);
    }
    this.maybeStopEventPump();
  }

  private rememberCompletedTurn(turnId: string): void {
    this.completedTurnIds.push(turnId);
    while (this.completedTurnIds.length > 200) {
      const oldestTurnId = this.completedTurnIds.shift();
      if (oldestTurnId) {
        this.turnsById.delete(oldestTurnId);
      }
    }
  }

  private maybeStopEventPump(): void {
    if (this.eventSubscriberCount > 0) return;
    if ([...this.turnsById.values()].some((item) => item.result === null)) return;
    if (!this.eventPumpAbortController) return;
    this.eventPumpAbortController.abort();
    this.eventPumpAbortController = null;
  }
}

/**
 * RemoteAgent：远程 Agent 客户端。
 */
export class RemoteAgent {
  private readonly baseUrl: string;

  constructor(options: RemoteAgentOptions) {
    const baseUrl = String(options.baseUrl || "").trim().replace(/\/+$/, "");
    if (!baseUrl) {
      throw new Error("RemoteAgent requires a non-empty baseUrl");
    }
    this.baseUrl = baseUrl;
  }

  /**
   * 新建一个远程 session。
   */
  async createSession(
    input?: AgentCreateSessionInput,
  ): Promise<RemoteAgentSession> {
    const response = await fetch(`${this.baseUrl}/api/sdk/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(input?.sessionId ? { sessionId: input.sessionId } : {}),
      }),
    });
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session create failed"));
    }
    return new RemoteSession(this.baseUrl, payload.session.sessionId);
  }

  /**
   * 获取一个已存在的远程 session。
   */
  async getSession(sessionId: string): Promise<RemoteAgentSession> {
    const resolvedSessionId = String(sessionId || "").trim();
    if (!resolvedSessionId) {
      throw new Error("getSession requires a non-empty sessionId");
    }
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions/${encodeURIComponent(resolvedSessionId)}`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      session?: AgentSessionInfo;
    };
    if (!response.ok || !payload.success || !payload.session?.sessionId) {
      throw new Error(String(payload.error || "Remote session get failed"));
    }
    return new RemoteSession(this.baseUrl, payload.session.sessionId);
  }

  /**
   * 列出远程 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    const query = new URLSearchParams();
    if (input?.limit !== undefined) query.set("limit", String(input.limit));
    if (input?.cursor) query.set("cursor", input.cursor);
    if (input?.query) query.set("query", input.query);
    const response = await fetch(
      `${this.baseUrl}/api/sdk/sessions${query.size > 0 ? `?${query.toString()}` : ""}`,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      page?: AgentSessionSummaryPage;
    };
    if (!response.ok || !payload.success || !payload.page) {
      throw new Error(String(payload.error || "Remote sessions list failed"));
    }
    return payload.page;
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve,
  };
}

function createEventConnectionReady(): EventConnectionReady & {
  /**
   * 等待事件连接 ready 的 Promise。
   */
  promise: Promise<void>;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return {
    promise,
    settled: false,
    resolve,
    reject,
  };
}

function resolveEventConnectionReady(ready: EventConnectionReady): void {
  if (ready.settled) return;
  ready.settled = true;
  ready.resolve();
}

function rejectEventConnectionReady(
  ready: EventConnectionReady,
  error: unknown,
): void {
  if (ready.settled) return;
  ready.settled = true;
  ready.reject(error);
}

function isSdkEventsReadyFrame(value: unknown): value is SdkEventsReadyFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { type?: unknown }).type === "sdk-events-ready"
  );
}

function createTurnHandle(
  lifecycle: RemoteTurnLifecycle,
): AgentSessionTurnHandle {
  return {
    id: lifecycle.turnId,
    get result() {
      return lifecycle.result;
    },
    finished: lifecycle.deferredFinished.promise,
  };
}

function extractTurnId(event: AgentSessionEvent): string | null {
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
