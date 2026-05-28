/**
 * SessionPromptRuntime：Session actor 模式下的最小 prompt 调度器。
 *
 * 关键点（中文）
 * - `prompt()` 是唯一输入入口，内部决定并入当前 turn 还是排到下一 turn。
 * - 不把调度逻辑塞进 Executor；Executor 继续只负责单次执行。
 * - 这里不暴露历史或消息模型，只编排 prompt 队列与 turn 生命周期。
 */

import { nanoid } from "nanoid";
import type { SessionUserMessageV1 } from "@/executor/types/SessionMessages.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  AgentSessionTurnHandle,
  AgentSessionTurnResult,
} from "@/types/sdk/AgentSessionTurn.js";

type QueuedPrompt = {
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
  publish: (event: AgentSessionEvent) => void;

  /**
   * 构造并持久化一条 user 消息。
   */
  createAndPersistUserMessage: (
    input: AgentSessionPromptInput,
  ) => Promise<SessionUserMessageV1>;

  /**
   * 执行单轮 turn。
   */
  executeTurn: (input: {
    turnId: string;
    promptInput: AgentSessionPromptInput;
    onStepMerge: () => Promise<SessionUserMessageV1[]>;
  }) => Promise<{
    text: string;
    success: boolean;
    assistantMessage: SessionMessageV1;
    error?: string;
  }>;
}

/**
 * SessionPromptRuntime：最小 prompt 队列调度器。
 */
export class SessionPromptRuntime {
  private readonly sessionId: string;
  private readonly publish: SessionPromptRuntimeOptions["publish"];
  private readonly createAndPersistUserMessage: SessionPromptRuntimeOptions["createAndPersistUserMessage"];
  private readonly executeTurn: SessionPromptRuntimeOptions["executeTurn"];
  private readonly queue: QueuedPrompt[] = [];
  private processingPromise: Promise<void> | null = null;

  constructor(options: SessionPromptRuntimeOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.publish = options.publish;
    this.createAndPersistUserMessage = options.createAndPersistUserMessage;
    this.executeTurn = options.executeTurn;
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
      input: {
        query: String(input.query || "").trim(),
      },
      deferredHandle,
    });
    this.ensureProcessing();
    return deferredHandle.promise;
  }

  /**
   * 返回当前 actor prompt 调度器是否仍处于活跃态。
   *
   * 说明（中文）
   * - 只要还有排队 prompt，或处理循环尚未结束，就视为活跃。
   * - Session 会用它阻止内部 direct execution 与 actor 模式并发混用。
   */
  isActive(): boolean {
    return this.processingPromise !== null || this.queue.length > 0;
  }

  private ensureProcessing(): void {
    if (this.processingPromise) return;
    this.processingPromise = this.processLoop().finally(() => {
      this.processingPromise = null;
      if (this.queue.length > 0) {
        this.ensureProcessing();
      }
    });
  }

  private async processLoop(): Promise<void> {
    while (this.queue.length > 0) {
      const current = this.queue.shift();
      if (!current) break;

      const turnId = `turn:${this.sessionId}:${Date.now()}:${nanoid(6)}`;
      const activeTurn = createActiveTurnState(turnId);
      this.publish({
        type: "turn-start",
        turnId,
      });
      current.deferredHandle.resolve(createTurnHandle(activeTurn));

      try {
        await this.createAndPersistUserMessage(current.input);
        const result = await this.executeTurn({
          turnId,
          promptInput: current.input,
          onStepMerge: async () => {
            return await this.drainQueuedPromptsAsMessages(activeTurn);
          },
        });
        const finalResult: AgentSessionTurnResult = {
          turnId,
          text: result.text,
          success: result.success,
          assistantMessage: result.assistantMessage,
          ...(result.error ? { error: result.error } : {}),
        };
        activeTurn.result = finalResult;
        this.publish({
          type: "turn-finish",
          turnId,
          text: finalResult.text,
          success: finalResult.success,
          ...(finalResult.error ? { error: finalResult.error } : {}),
        });
        activeTurn.deferredFinished.resolve(finalResult);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
        this.publish({
          type: "error",
          message,
        });
        this.publish({
          type: "turn-finish",
          turnId,
          text: "",
          success: false,
          error: message,
        });
        activeTurn.deferredFinished.resolve(finalResult);
      }
    }
  }

  private async drainQueuedPromptsAsMessages(
    activeTurn: ActiveTurnState,
  ): Promise<SessionUserMessageV1[]> {
    if (this.queue.length <= 0) return [];
    const drained = this.queue.splice(0, this.queue.length);
    const merged: SessionUserMessageV1[] = [];

    for (let index = 0; index < drained.length; index += 1) {
        const item = drained[index];
        try {
          const message = await this.createAndPersistUserMessage(item.input);
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
}

function buildPromptRuntimeErrorAssistantMessage(input: {
  sessionId: string;
  message: string;
}): SessionMessageV1 {
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
