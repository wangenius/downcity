/**
 * Session：单个会话实例。
 *
 * 关键点（中文）
 * - 一个 Session 只对应一个固定的 `sessionId`。
 * - 对外直接暴露 `run / appendUserMessage / appendAssistantMessage / getExecutor / getHistoryComposer`。
 * - 运行态（如 executing）直接收在实例内部，不再拆 `Facade / Runner / ExecutionRegistry`。
 */

import { SessionHistoryWriter } from "@session/composer/history/SessionHistoryWriter.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { withSessionRunScope } from "@session/SessionRunScope.js";
import type { SessionRunScope } from "@session/SessionRunScope.js";
import { buildSessionStepEventMessages } from "@session/messages/SessionStepEventMapper.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionExecutor } from "@/types/session/SessionExecutor.js";
import type { SessionRunResult } from "@/types/session/SessionRun.js";

type SessionOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 对应的 history Composer。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 创建当前 session 对应的执行器。
   */
  createExecutor: (historyComposer: SessionHistoryComposer) => SessionExecutor;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * Session 单实例实现。
 */
export class Session {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;

  private readonly historyComposer: SessionHistoryComposer;
  private readonly createExecutor: SessionOptions["createExecutor"];
  private readonly historyWriter: SessionHistoryWriter;

  private executor: SessionExecutor | null = null;
  private executing = false;

  constructor(options: SessionOptions) {
    const sessionId = String(options.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("Session requires a non-empty sessionId");
    }

    this.sessionId = sessionId;
    this.historyComposer = options.historyComposer;
    this.createExecutor = options.createExecutor;
    this.historyWriter = new SessionHistoryWriter({
      sessionId,
      getHistoryComposer: () => this.getHistoryComposer(),
      runAfterSessionUpdated: options.runAfterSessionUpdated,
    });
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.executing;
  }

  /**
   * 获取当前 session 的 history Composer。
   */
  getHistoryComposer(): SessionHistoryComposer {
    return this.historyComposer;
  }

  /**
   * 获取当前 session 的执行器。
   */
  getExecutor(): SessionExecutor {
    if (this.executor) return this.executor;
    const created = this.createExecutor(this.getHistoryComposer());
    this.executor = created;
    return created;
  }

  /**
   * 清理当前 session 的执行器缓存。
   *
   * 关键点（中文）
   * - 这里只清 executor，不清 history Composer。
   * - history 是事实源，不应随着 executor 一起丢失。
   */
  clearExecutor(): void {
    const current = this.executor;
    this.executor = null;
    void current?.dispose?.();
  }

  /**
   * 触发 session 更新后的异步回调。
   */
  async afterSessionUpdatedAsync(): Promise<void> {
    await this.historyWriter.afterSessionUpdatedAsync();
  }

  /**
   * 追加一条 user 消息。
   */
  async appendUserMessage(params: {
    message?: SessionMessageV1 | null;
    text?: string;
    extra?: JsonObject;
  }): Promise<void> {
    await this.historyWriter.appendUserMessage(params);
  }

  /**
   * 追加一条 assistant 消息。
   */
  async appendAssistantMessage(params: {
    message?: SessionMessageV1 | null;
    fallbackText?: string;
    extra?: JsonObject;
  }): Promise<void> {
    await this.historyWriter.appendAssistantMessage(params);
  }

  /**
   * 运行当前 session 的一次请求。
   *
   * 关键点（中文）
   * - 这里直接承接单个 Session 实例的一次 run 外层编排。
   * - scope 绑定、assistant step 持久化、executing 状态都收在实例内部。
   */
  async run(params: {
    query: string;
    onStepCallback?: SessionRunScope["onStepCallback"];
    onAssistantStepCallback?: SessionRunScope["onAssistantStepCallback"];
  }): Promise<SessionRunResult> {
    if (this.executing) {
      // 关键点（中文）：同一个 Session 实例只允许一个活跃 run，
      // 否则 step 回调、scope 与执行器状态都会互相污染。
      throw new Error("Session.run does not support concurrent execution");
    }
    const query = String(params.query || "").trim();
    const sessionRunScope: Omit<SessionRunScope, "sessionId"> = {
      ...(typeof params.onStepCallback === "function"
        ? { onStepCallback: params.onStepCallback }
        : {}),
      ...(typeof params.onAssistantStepCallback === "function"
        ? { onAssistantStepCallback: params.onAssistantStepCallback }
        : {}),
    };
    let persistedAssistantStepCount = 0;
    const providedOnAssistantStepCallback =
      sessionRunScope.onAssistantStepCallback;

    const wrappedOnAssistantStepCallback = async (step: {
      text: string;
      stepIndex: number;
      stepResult?: unknown;
    }): Promise<void> => {
      const stepMessages = buildSessionStepEventMessages({
        sessionId: this.sessionId,
        stepIndex: step.stepIndex,
        stepResult: step.stepResult,
        text: step.text,
      });
      if (stepMessages.length > 0) {
        for (const stepMessage of stepMessages) {
          await this.appendAssistantMessage({
            message: stepMessage,
          });
          persistedAssistantStepCount += 1;
        }
      }

      if (typeof providedOnAssistantStepCallback === "function") {
        await providedOnAssistantStepCallback(step);
      }
    };

    this.executing = true;
    try {
      const result = await withSessionRunScope(
        {
          sessionId: this.sessionId,
          ...sessionRunScope,
          onAssistantStepCallback: wrappedOnAssistantStepCallback,
        },
        () => this.getExecutor().run({ query }),
      );
      if (persistedAssistantStepCount <= 0) return result;

      return {
        ...result,
        assistantMessage: {
          ...result.assistantMessage,
          metadata: {
            ...(result.assistantMessage.metadata || {
              v: 1 as const,
              ts: Date.now(),
              sessionId: this.sessionId,
            }),
            extra: {
              ...(
                result.assistantMessage.metadata?.extra &&
                  typeof result.assistantMessage.metadata.extra === "object" &&
                  !Array.isArray(result.assistantMessage.metadata.extra)
                  ? result.assistantMessage.metadata.extra
                  : {}
              ),
              assistantStepMessagesPersisted: true,
              assistantStepCount: persistedAssistantStepCount,
            },
          },
        },
      };
    } finally {
      this.executing = false;
    }
  }
}
