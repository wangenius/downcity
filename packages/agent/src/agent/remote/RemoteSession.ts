/**
 * RemoteSession：远程 session actor 客户端。
 *
 * 关键点（中文）
 * - 这里只负责 session 级 API、turn lifecycle 与事件泵。
 * - 具体 HTTP / RPC 细节由 RemoteSessionTransport 提供。
 */

import type {
  AgentSession,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSystemSnapshot,
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
import type {
  RemoteSessionTransport,
  TransportSubscription,
} from "@/agent/remote/RemoteTransport.js";

type Deferred<T> = {
  /** 当前延迟 Promise。 */
  promise: Promise<T>;
  /** 兑现 Promise。 */
  resolve: (value: T) => void;
};

type RemoteTurnLifecycle = {
  /** 当前 turnId。 */
  turnId: string;
  /** 当前 turn 的最终结果快照。 */
  result: AgentSessionTurnResult | null;
  /** 当前 turn 完成 Promise 控制器。 */
  deferred_finished: Deferred<AgentSessionTurnResult>;
};

/**
 * 远程 Session 客户端。
 */
export class RemoteSession implements AgentSession {
  readonly id: string;
  readonly agentId: string;
  readonly config: AgentSessionConfigSnapshot;

  private readonly transport: RemoteSessionTransport;
  private readonly event_hub = new SessionEventHub();
  private readonly turns_by_id = new Map<string, RemoteTurnLifecycle>();
  private readonly completed_turn_ids: string[] = [];
  private event_pump_connect_promise: Promise<void> | null = null;
  private event_pump_running = false;
  private event_subscriber_count = 0;
  private event_subscription: TransportSubscription | null = null;

  constructor(transport: RemoteSessionTransport, info: AgentSessionInfo) {
    this.transport = transport;
    this.id = info.sessionId;
    this.agentId = info.agentId;
    // 远程 session 不暴露服务端模型实例，config 返回空快照。
    this.config = {} as AgentSessionConfigSnapshot;
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
  async fork(input?: AgentSessionForkInput | string): Promise<AgentSession> {
    const info = await this.transport.fork(this.id, input);
    return new RemoteSession(this.transport, info);
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
