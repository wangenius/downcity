/**
 * Executor：单个 session 的执行编排器。
 *
 * 关键点（中文）
 * - SDK 对外对象叫 `Session`，这里是内部执行层。
 * - 一个 Executor 只对应一个固定的 `sessionId`。
 * - 负责 history 写入、run scope、executing 状态与本地 Runner 的懒创建。
 */

import type { LanguageModel, Tool } from "ai";
import { SessionHistoryWriter } from "@session/composer/history/SessionHistoryWriter.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { withSessionRunScope } from "@session/SessionRunScope.js";
import type { SessionRunScope } from "@session/SessionRunScope.js";
import { buildSessionStepEventMessages } from "@session/messages/SessionStepEventMapper.js";
import { JsonlSessionCompactionComposer } from "@session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionExecutionComposer } from "@session/composer/execution/LocalSessionExecutionComposer.js";
import type { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";
import type { SessionExecutionComposer } from "@session/composer/execution/SessionExecutionComposer.js";
import type { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import { Runner } from "@session/executors/local/Runner.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { SessionExecutor } from "@/session/types/SessionExecutor.js";
import type { SessionRunResult } from "@/session/types/SessionRun.js";

type ExecutorOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 对应的 history Composer。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 读取当前 session 使用的模型实例。
   */
  getModel: () => LanguageModel | undefined;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 session 对应的 compaction Composer。
   */
  compactionComposer?: SessionCompactionComposer;

  /**
   * 当前 session 对应的 system Composer。
   */
  systemComposer: SessionSystemComposer;

  /**
   * 获取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;

  /**
   * 可选自定义 execution Composer。
   */
  executionComposer?: SessionExecutionComposer;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * Executor 单实例实现。
 */
export class Executor implements SessionExecutor {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;

  private readonly historyComposer: SessionHistoryComposer;
  private readonly getModel: ExecutorOptions["getModel"];
  private readonly logger: Logger;
  private readonly compactionComposer: SessionCompactionComposer;
  private readonly systemComposer: SessionSystemComposer;
  private readonly getTools: ExecutorOptions["getTools"];
  private readonly runnerExecutionComposer?: SessionExecutionComposer;
  private readonly historyWriter: SessionHistoryWriter;

  private runner: Runner | null = null;
  private executing = false;

  constructor(options: ExecutorOptions) {
    const sessionId = String(options.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("Executor requires a non-empty sessionId");
    }

    this.sessionId = sessionId;
    this.historyComposer = options.historyComposer;
    this.getModel = options.getModel;
    this.logger = options.logger;
    this.compactionComposer =
      options.compactionComposer || new JsonlSessionCompactionComposer();
    this.systemComposer = options.systemComposer;
    this.getTools = options.getTools;
    this.runnerExecutionComposer = options.executionComposer;
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
   * 获取当前 session 的执行端口。
   *
   * 关键点（中文）
   * - 兼容 runtime/service 端口语义：Executor 自己就是执行端口。
   */
  getExecutor(): SessionExecutor {
    return this;
  }

  /**
   * 获取或创建当前本地 Runner。
   */
  private getRunner(): Runner {
    if (this.runner) return this.runner;
    const model = this.getModel();
    if (!model) {
      throw new Error(
        `Executor for session "${this.sessionId}" requires a configured model`,
      );
    }
    const created = new Runner({
      model,
      logger: this.logger,
      historyComposer: this.getHistoryComposer(),
      compactionComposer: this.compactionComposer,
      systemComposer: this.systemComposer,
      executionComposer:
        this.runnerExecutionComposer ||
        new LocalSessionExecutionComposer({
          sessionId: this.sessionId,
          getTools: this.getTools,
        }),
    });
    this.runner = created;
    return created;
  }

  /**
   * 清理当前 session 的 Runner 缓存。
   *
   * 关键点（中文）
   * - 这里只清 Runner，不清 history Composer。
   * - history 是事实源，不应随着 Runner 一起丢失。
   */
  clearExecutor(): void {
    this.runner = null;
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
    onUiMessageChunkCallback?: SessionRunScope["onUiMessageChunkCallback"];
  }): Promise<SessionRunResult> {
    if (this.executing) {
      // 关键点（中文）：同一个 Session 实例只允许一个活跃 run，
      // 否则 step 回调、scope 与执行器状态都会互相污染。
      throw new Error("Executor.run does not support concurrent execution");
    }
    const query = String(params.query || "").trim();
    const sessionRunScope: Omit<SessionRunScope, "sessionId"> = {
      ...(typeof params.onStepCallback === "function"
        ? { onStepCallback: params.onStepCallback }
        : {}),
      ...(typeof params.onAssistantStepCallback === "function"
        ? { onAssistantStepCallback: params.onAssistantStepCallback }
        : {}),
      ...(typeof params.onUiMessageChunkCallback === "function"
        ? { onUiMessageChunkCallback: params.onUiMessageChunkCallback }
        : {}),
    };
    let persistedAssistantStepCount = 0;
    const providedOnAssistantStepCallback =
      sessionRunScope.onAssistantStepCallback;

    const wrappedOnAssistantStepCallback = async (step: {
      text: string;
      stepIndex: number;
      visibility?: "visible" | "internal";
      stepResult?: unknown;
    }): Promise<void> => {
      const stepMessages = buildSessionStepEventMessages({
        sessionId: this.sessionId,
        stepIndex: step.stepIndex,
        stepResult: step.stepResult,
        text: step.text,
        visibility: step.visibility,
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
        () => this.getRunner().run({ query }),
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
