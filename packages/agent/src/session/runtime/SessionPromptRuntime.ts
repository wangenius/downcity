/**
 * SessionPromptRuntime：Session actor 模式下的最小 prompt 调度器。
 *
 * 关键点（中文）
 * - `prompt()` 是唯一输入入口，内部决定并入当前 turn 还是排到下一 turn。
 * - 不把调度逻辑塞进 Executor；Executor 继续只负责单次执行。
 * - 这里不暴露历史或消息模型，只编排 prompt 队列与 turn 生命周期。
 */

import { nanoid } from "nanoid";
import type { SessionUserMessageV1 } from "@/executor/types/SessionRecords.js";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionMutation } from "@/types/session/SessionMutation.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { SessionQueueCommand } from "@/types/session/SessionQueueCommand.js";
import type {
  AgentSessionTurnHandle,
  AgentSessionTurnResult,
} from "@/types/sdk/AgentSessionTurn.js";

const TURN_STOPPED_MESSAGE = "Turn stopped";
const QUEUED_PROMPT_CANCELLED_MESSAGE =
  "Prompt cancelled because session was stopped";

type SessionQueuePrompt = {
  /** 当前队列项固定为 prompt。 */
  type: "prompt";

  /**
   * 当前排队中的 prompt 输入。
   */
  input: AgentSessionPromptInput;

  /**
   * 当前 prompt 对应的 turn handle Promise 控制器。
   */
  deferredHandle: Deferred<AgentSessionTurnHandle>;
};

/**
 * Session queue 的统一有序输入。
 */
type SessionQueueInput = SessionQueuePrompt | SessionQueueCommand;

/**
 * Promise 延迟控制器。
 */
interface Deferred<T> {
  /**
   * 延迟 Promise。
   */
  promise: Promise<T>;

  /**
   * 兑现 Promise。
   */
  resolve: (value: T) => void;
}

/**
 * 当前活跃 turn 的运行态。
 */
interface ActiveTurnState {
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

  /**
   * 当前 turn 的取消控制器。
   */
  abortController: AbortController;
}

/**
 * SessionPromptRuntime 构造参数。
 */
export interface SessionPromptRuntimeOptions {
  /**
   * 当前 session 标识。
   */
  sessionId: string;

  /**
   * 广播 session 事件。
   */
  publish: (mutation: SessionMutation) => void;

  /**
   * 构造并持久化一条 user 消息。
   */
  createAndPersistUserMessage: (
    input: AgentSessionPromptInput,
    turn_id: string,
    input_type: "prompt" | "steer",
  ) => Promise<SessionUserMessageV1>;

  /** 持久化一条用户可见的 turn 错误 Message。 */
  appendErrorMessage: (input: {
    /** 错误所属 turn。 */
    turn_id: string;
    /** 用户可见错误文本。 */
    message: string;
  }) => Promise<void>;

  /**
   * 执行单轮 turn。
   */
  executeTurn: (input: {
    turnId: string;
    promptInput: AgentSessionPromptInput;
    onStepMerge: () => Promise<SessionUserMessageV1[]>;
    abortSignal: AbortSignal;
  }) => Promise<{
    text: string;
    success: boolean;
    assistantMessage?: SessionMessageRecordV1 | null;
    error?: string;
  }>;

  /**
   * 请求底层执行器停止当前 run。
   */
  stopTurn: () => boolean;
}

/**
 * SessionPromptRuntime：最小 prompt 队列调度器。
 */
export class SessionPromptRuntime {
  private readonly sessionId: string;
  private readonly publish: SessionPromptRuntimeOptions["publish"];
  private readonly createAndPersistUserMessage: SessionPromptRuntimeOptions["createAndPersistUserMessage"];
  private readonly appendErrorMessage: SessionPromptRuntimeOptions["appendErrorMessage"];
  private readonly executeTurn: SessionPromptRuntimeOptions["executeTurn"];
  private readonly stopTurn: SessionPromptRuntimeOptions["stopTurn"];
  private readonly queue: SessionQueueInput[] = [];
  private processingPromise: Promise<void> | null = null;
  private activeTurn: ActiveTurnState | null = null;

  constructor(options: SessionPromptRuntimeOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.publish = options.publish;
    this.createAndPersistUserMessage = options.createAndPersistUserMessage;
    this.appendErrorMessage = options.appendErrorMessage;
    this.executeTurn = options.executeTurn;
    this.stopTurn = options.stopTurn;
    if (!this.sessionId) {
      throw new Error("SessionPromptRuntime requires a non-empty sessionId");
    }
  }

  /**
   * 追加一条新的 prompt。
   */
  prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const deferredHandle = createDeferred<AgentSessionTurnHandle>();
    this.queue.push({
      type: "prompt",
      input,
      deferredHandle,
    });
    this.ensureProcessing();
    return deferredHandle.promise;
  }

  /**
   * 把一次已成功创建的 command 加入统一输入队列。
   */
  enqueue_command(command: SessionQueueCommand): void {
    this.queue.push(command);
  }

  /**
   * 判断是否存在等待并入下一 Session step 的 prompt。
   */
  has_pending_prompt(): boolean {
    return this.queue.some((item) => item.type === "prompt");
  }

  /**
   * 判断是否存在等待在下一 Session step 检查点执行的 command。
   */
  has_pending_command(): boolean {
    return this.queue.some((item) => item.type === "command");
  }

  /**
   * 返回当前 actor prompt 调度器是否仍处于活跃态。
   *
   * 说明（中文）
   * - 只要还有排队 prompt，或处理循环尚未结束，就视为活跃。
   * - Session 会用它阻止内部 direct execution 与 actor 模式并发混用。
   */
  isActive(): boolean {
    return this.processingPromise !== null || this.has_pending_prompt();
  }

  /**
   * 停止当前 turn，并取消尚未被吸收的排队 prompt。
   */
  stop(): AgentSessionStopResult {
    const active_turn = this.activeTurn;
    const cancelled_queued_prompts = this.cancelQueuedPrompts();
    let executor_stop_requested = false;

    if (active_turn) {
      if (!active_turn.abortController.signal.aborted) {
        active_turn.abortController.abort(new Error(TURN_STOPPED_MESSAGE));
      }
      executor_stop_requested = this.stopTurn();
    }

    const stopped = Boolean(
      active_turn ||
        executor_stop_requested ||
        cancelled_queued_prompts > 0,
    );
    return {
      stopped,
      ...(active_turn ? { turnId: active_turn.turnId } : {}),
      cancelledQueuedPrompts: cancelled_queued_prompts,
      reason: stopped ? "stopped" : "idle",
    };
  }

  private ensureProcessing(): void {
    if (this.processingPromise) return;
    this.processingPromise = this.processLoop().finally(() => {
      this.processingPromise = null;
      if (this.has_pending_prompt()) {
        this.ensureProcessing();
      }
    });
  }

  private async processLoop(): Promise<void> {
    while (this.has_pending_prompt()) {
      const prompt_index = this.queue.findIndex((item) => item.type === "prompt");
      if (prompt_index < 0) break;
      const queued_before_prompt = this.queue.splice(0, prompt_index);
      const current = this.queue.shift();
      if (!current || current.type !== "prompt") break;

      const turnId = `turn:${this.sessionId}:${Date.now()}:${nanoid(6)}`;
      const activeTurn = createActiveTurnState(turnId);
      this.activeTurn = activeTurn;
      this.publish({
        mutation_id: nanoid(),
        variant: "turn",
        type: "start",
        session_id: this.sessionId,
        turn_id: turnId,
        status: "running",
        created_at: Date.now(),
      });
      current.deferredHandle.resolve(createTurnHandle(activeTurn));

      try {
        await this.execute_commands(
          queued_before_prompt.filter(
            (item): item is SessionQueueCommand => item.type === "command",
          ),
          activeTurn,
        );
        await this.createAndPersistUserMessage(current.input, turnId, "prompt");
        const result = await this.executeTurn({
          turnId,
          promptInput: current.input,
          onStepMerge: async () => {
            return await this.drain_queued_inputs(activeTurn);
          },
          abortSignal: activeTurn.abortController.signal,
        });
        const stopped = activeTurn.abortController.signal.aborted;
        const finalResult: AgentSessionTurnResult = {
          turnId,
          text: result.text,
          success: stopped ? false : result.success,
          ...(result.assistantMessage
            ? { assistantMessage: result.assistantMessage }
            : {}),
          ...(stopped
            ? { error: TURN_STOPPED_MESSAGE }
            : result.error ? { error: result.error } : {}),
        };
        activeTurn.result = finalResult;
        this.publish({
          mutation_id: nanoid(),
          variant: "turn",
          type: "finish",
          session_id: this.sessionId,
          turn_id: turnId,
          status: stopped ? "stopped" : finalResult.success ? "completed" : "failed",
          created_at: Date.now(),
          text: finalResult.text,
          ...(finalResult.error ? { error: finalResult.error } : {}),
        });
        activeTurn.deferredFinished.resolve(finalResult);
      } catch (error) {
        const message = activeTurn.abortController.signal.aborted
          ? TURN_STOPPED_MESSAGE
          : error instanceof Error ? error.message : String(error);
        const finalResult: AgentSessionTurnResult = {
          turnId,
          text: "",
          success: false,
          assistantMessage: buildPromptRuntimeErrorAssistantMessage({
            sessionId: this.sessionId,
            message,
          }),
          error: message,
        };
        activeTurn.result = finalResult;
        if (message !== TURN_STOPPED_MESSAGE) {
          try {
            await this.appendErrorMessage({
              turn_id: turnId,
              message,
            });
          } catch {
            // Error Message 写入失败不能阻止 turn handle 收口。
          }
        }
        this.publish({
          mutation_id: nanoid(),
          variant: "turn",
          type: "finish",
          session_id: this.sessionId,
          turn_id: turnId,
          status: activeTurn.abortController.signal.aborted ? "stopped" : "failed",
          created_at: Date.now(),
          text: "",
          error: message,
        });
        activeTurn.deferredFinished.resolve(finalResult);
      } finally {
        if (this.activeTurn === activeTurn) {
          this.activeTurn = null;
        }
      }
    }
  }

  private cancelQueuedPrompts(): number {
    const cancelled = this.queue.filter(
      (item): item is SessionQueuePrompt => item.type === "prompt",
    );
    if (cancelled.length <= 0) return 0;
    const retained = this.queue.filter((item) => item.type === "command");
    this.queue.splice(0, this.queue.length, ...retained);
    for (const item of cancelled) {
      const turnId = `turn:${this.sessionId}:cancelled:${Date.now()}:${nanoid(6)}`;
      const cancelledTurn = createActiveTurnState(turnId);
      const finalResult: AgentSessionTurnResult = {
        turnId,
        text: "",
        success: false,
        assistantMessage: buildPromptRuntimeErrorAssistantMessage({
          sessionId: this.sessionId,
          message: QUEUED_PROMPT_CANCELLED_MESSAGE,
        }),
        error: QUEUED_PROMPT_CANCELLED_MESSAGE,
      };
      cancelledTurn.result = finalResult;
      cancelledTurn.deferredFinished.resolve(finalResult);
      this.publish({
        mutation_id: nanoid(),
        variant: "turn",
        type: "start",
        session_id: this.sessionId,
        turn_id: turnId,
        status: "running",
        created_at: Date.now(),
      });
      this.publish({
        mutation_id: nanoid(),
        variant: "turn",
        type: "finish",
        session_id: this.sessionId,
        turn_id: turnId,
        status: "failed",
        created_at: Date.now(),
        text: "",
        error: QUEUED_PROMPT_CANCELLED_MESSAGE,
      });
      item.deferredHandle.resolve(createTurnHandle(cancelledTurn));
    }
    return cancelled.length;
  }

  /**
   * 在下一 Session step 检查点按入队顺序提交配置并持久化 steer。
   */
  private async drain_queued_inputs(
    activeTurn: ActiveTurnState,
  ): Promise<SessionUserMessageV1[]> {
    if (this.queue.length <= 0) return [];
    const drained = this.queue.splice(0, this.queue.length);
    const merged: SessionUserMessageV1[] = [];

    for (let index = 0; index < drained.length; index += 1) {
      const item = drained[index];
      if (item.type === "command") {
        try {
          await item.execute({
            turn_id: activeTurn.turnId,
          });
        } catch {
          // command 自己负责失败观测；单条失败不能吞掉后续 steer 或 command。
        }
        continue;
      }
      try {
        const message = await this.createAndPersistUserMessage(
          item.input,
          activeTurn.turnId,
          "steer",
        );
        item.deferredHandle.resolve(createTurnHandle(activeTurn));
        merged.push(message);
      } catch {
        // 关键点（中文）：若某条消息持久化失败，把未处理部分重新放回队列头部，避免静默丢失。
        const remaining = drained.slice(index);
        this.queue.unshift(...remaining);
        break;
      }
    }

    return merged;
  }

  /**
   * 执行一组已经从统一队列截取的 command。
   */
  private async execute_commands(
    commands: SessionQueueCommand[],
    active_turn: ActiveTurnState,
  ): Promise<void> {
    if (commands.length <= 0) return;
    for (const command of commands) {
      try {
        await command.execute({
          turn_id: active_turn.turnId,
        });
      } catch {
        // command 自己负责失败观测；单条失败不能阻断当前 prompt。
      }
    }
  }
}

function buildPromptRuntimeErrorAssistantMessage(input: {
  sessionId: string;
  message: string;
}): SessionMessageRecordV1 {
  return {
    id: `a:${input.sessionId}:${Date.now()}:${nanoid(6)}`,
    role: "assistant",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: input.sessionId,
      source: "egress",
      kind: "normal",
      extra: {
        note: "session_prompt_runtime_error",
      },
    },
    parts: [{ type: "text", text: input.message }],
  };
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

function createActiveTurnState(turnId: string): ActiveTurnState {
  return {
    turnId,
    result: null,
    deferredFinished: createDeferred<AgentSessionTurnResult>(),
    abortController: new AbortController(),
  };
}

function createTurnHandle(
  activeTurn: ActiveTurnState,
): AgentSessionTurnHandle {
  return {
    id: activeTurn.turnId,
    get result() {
      return activeTurn.result;
    },
    finished: activeTurn.deferredFinished.promise,
  };
}
