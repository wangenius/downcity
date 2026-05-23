/**
 * Executor：单个 session 的执行编排器。
 *
 * 关键点（中文）
 * - SDK 对外对象叫 `Session`，这里是内部执行层。
 * - 一个 Executor 只对应一个固定的 `sessionId`。
 * - 负责 history 写入、run scope、executing 状态、Composer 编排与 tool-loop 执行。
 */

import { streamText, type LanguageModel, type Tool } from "ai";
import { SessionHistoryWriter } from "@session/composer/history/SessionHistoryWriter.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";
import { withSessionRunScope } from "@session/SessionRunScope.js";
import type { SessionRunScope } from "@session/SessionRunScope.js";
import { buildSessionStepEventMessages } from "@session/messages/SessionStepEventMapper.js";
import { JsonlSessionCompactionComposer } from "@session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionContextComposer } from "@session/composer/context/LocalSessionContextComposer.js";
import type { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";
import type { SessionContextComposer } from "@session/composer/context/SessionContextComposer.js";
import type { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import {
  MAX_INCOMPLETE_RESPONSE_RECOVERIES,
  MAX_TEXT_ONLY_CONTINUATIONS,
  MAX_TOOL_LOOP_STEPS,
  buildIncompleteResponseRecoveryNudge,
  buildTextOnlyContinuationNudge,
  detectIncompleteResponse,
  detectTextOnlyContinuationReason,
  mergeAssistantUiMessages,
  summarizeStepForDebug,
  summarizeUiMessageForDebug,
  toInlinePreview,
} from "@session/core-engine/CoreEngineSignals.js";
import {
  evaluateCoreEngineLoopDecision,
  shouldContinueForTailMergedUserMessages,
} from "@session/core-engine/CoreEngineLoopDecision.js";
import {
  resolveEffectiveCoreEngineError,
  summarizeStreamError,
} from "@session/core-engine/CoreEngineError.js";
import { collectFinalAssistantMessageFromUiStream } from "@session/core-engine/CoreEngineUiStreamCollector.js";
import { CoreEngineMessageState } from "@session/core-engine/CoreEngineMessageState.js";
import {
  buildOpenAIResponsesProviderOptions,
} from "@session/messages/SessionMessageCodec.js";
import { logAssistantMessageNow } from "@session/messages/SessionMessageLog.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { SessionExecutor } from "@/session/types/SessionExecutor.js";
import type {
  SessionExecuteInput,
  SessionRunInput,
  SessionRunResult,
} from "@/session/types/SessionRun.js";

/**
 * 可压缩错误的最大重试次数。
 */
const MAX_COMPACTION_RETRY_ATTEMPTS = 3;

type ExecutorOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 对应的 history 事实源。
   */
  historyStore: SessionHistoryStore;

  /**
   * 当前 session 对应的 history Composer。
   *
   * 关键点（中文）
   * - Composer 只负责组装本轮 messages，不负责落盘。
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
   * 可选自定义 context Composer。
   */
  contextComposer?: SessionContextComposer;

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
  private readonly historyStore: SessionHistoryStore;
  private readonly getModel: ExecutorOptions["getModel"];
  private readonly logger: Logger;
  private readonly compactionComposer: SessionCompactionComposer;
  private readonly systemComposer: SessionSystemComposer;
  protected readonly contextComposer: SessionContextComposer;
  private readonly historyWriter: SessionHistoryWriter;

  private executing = false;
  private retryCount = 0;

  constructor(options: ExecutorOptions) {
    const sessionId = String(options.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("Executor requires a non-empty sessionId");
    }

    this.sessionId = sessionId;
    this.historyStore = options.historyStore;
    this.historyComposer = options.historyComposer;
    this.getModel = options.getModel;
    this.logger = options.logger;
    this.compactionComposer =
      options.compactionComposer || new JsonlSessionCompactionComposer();
    this.systemComposer = options.systemComposer;
    this.contextComposer =
      options.contextComposer ||
      new LocalSessionContextComposer({
        sessionId: this.sessionId,
        getTools: options.getTools,
      });
    this.historyWriter = new SessionHistoryWriter({
      sessionId,
      getHistoryStore: () => this.getHistoryStore(),
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
   * 获取当前 session 的 history 事实源。
   */
  getHistoryStore(): SessionHistoryStore {
    return this.historyStore;
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
   * 清理当前 session 的执行器运行态。
   *
   * 关键点（中文）
   * - 当前 Executor 不缓存模型实例，模型每轮 run 都从 `getModel()` 读取。
   * - history 是事实源，不应随着执行态一起丢失。
   */
  clearExecutor(): void {}

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
    this.resetRunState();
    try {
      const result = await withSessionRunScope(
        {
          sessionId: this.sessionId,
          ...sessionRunScope,
          onAssistantStepCallback: wrappedOnAssistantStepCallback,
        },
        () => this.runWithRetry({ query }),
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
      this.resetRunState();
      this.executing = false;
    }
  }

  /**
   * 执行一次 session run（带可压缩错误重试）。
   */
  private async runWithRetry(input: SessionRunInput): Promise<SessionRunResult> {
    const model = this.resolveModelOrThrow();
    try {
      const query = String(input.query || "").trim();
      const prepared = await this.prepareExecuteInput(query, model);
      return await this.executePreparedRun(prepared, model);
    } catch (error) {
      if (this.compactionComposer.shouldCompactOnError(error)) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retryCount,
          error: String(error),
        });

        if (this.retryCount < MAX_COMPACTION_RETRY_ATTEMPTS) {
          this.retryCount += 1;
          return this.runWithRetry(input);
        }

        return {
          success: false,
          error: "Context length exceeded and retries failed. Please resend your question.",
          assistantMessage: this.contextComposer.buildFallbackAssistantMessage(
            "Context length exceeded and retries failed. Please resend your question.",
          ),
        };
      }

      const errorMsg = String(error);
      await this.logger.log("error", "Executor execution failed", {
        error: errorMsg,
      });
      return {
        success: false,
        error: errorMsg,
        assistantMessage: this.contextComposer.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * 调用 Composer 组装当前轮执行输入。
   */
  private async prepareExecuteInput(
    query: string,
    model: LanguageModel,
  ): Promise<SessionExecuteInput> {
    if (!String(this.historyComposer.sessionId || "").trim()) {
      throw new Error("Executor.run requires historyComposer.sessionId");
    }

    const runContext = await this.contextComposer.compose();
    const tools = runContext.tools;
    const system = await this.systemComposer.resolve();

    try {
      if (this.retryCount > 0) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retryCount,
        });
      }

      await this.compactionComposer.run({
        historyStore: this.historyStore,
        model,
        system,
        retryCount: this.retryCount,
      });
    } catch {
      // 压缩失败不阻断主流程，继续使用当前历史消息执行。
    }

    const messages = await this.historyComposer.prepare({
      query,
      tools,
      system,
      model,
      retryCount: this.retryCount,
    });

    return {
      query,
      system,
      messages,
      tools,
    };
  }

  /**
   * 执行一次已装配完成的运行材料。
   */
  private async executePreparedRun(
    input: SessionExecuteInput,
    model: LanguageModel,
  ): Promise<SessionRunResult> {
    return await this.runCoreEngine(input, model);
  }

  /**
   * 运行模型/tool-loop 核心。
   *
   * 关键点（中文）
   * - CoreEngine 是 Executor 内部机制，不是第二个 Executor 实例。
   * - 这里只返回最终 assistant message；是否写入长期 history 由外层 Session/Service 决定。
   * - 运行中生成的内部续写 user message 只进入本轮内存态，不直接落盘。
   */
  private async runCoreEngine(
    input: SessionExecuteInput,
    model: LanguageModel,
  ): Promise<SessionRunResult> {
    const startTime = Date.now();
    const sessionId = String(this.historyStore.sessionId || "").trim();
    const system = Array.isArray(input.system) ? input.system : [];
    const tools = input.tools;
    let lastObservedStreamError: unknown = undefined;

    try {
      const messageState = await CoreEngineMessageState.create({
        messages: input.messages,
        tools,
      });

      const appendMergedUserMessages = (messages: SessionMessageV1[]) =>
        messageState.appendMergedUserMessages(messages);

      const contextComposerOnStepFinish =
        this.contextComposer.createOnStepFinishHandler();
      let stepCount = 0;
      let totalToolCallCount = 0;
      let totalToolResultCount = 0;
      const onStepFinish = async (stepResult: unknown): Promise<void> => {
        stepCount += 1;
        const summary = summarizeStepForDebug(stepResult);
        totalToolCallCount +=
          typeof summary.toolCallCount === "number" ? summary.toolCallCount : 0;
        totalToolResultCount +=
          typeof summary.toolResultCount === "number"
            ? summary.toolResultCount
            : 0;
        await this.logger.log("info", "[agent] step.finish", {
          sessionId,
          stepIndex: stepCount,
          ...summary,
        });
        await contextComposerOnStepFinish(stepResult);
      };

      const prepareStep = this.contextComposer.createPrepareStepHandler({
        system,
        appendMergedUserMessages,
      });

      let finalAssistantUiMessage: SessionMessageV1 | null = null;
      let textOnlyContinuationCount = 0;
      let incompleteResponseRecoveryCount = 0;

      while (stepCount < MAX_TOOL_LOOP_STEPS) {
        const result = streamText({
          model,
          system,
          onStepFinish,
          prepareStep,
          messages: messageState.modelMessages,
          tools,
          providerOptions: buildOpenAIResponsesProviderOptions(),
          onError: async ({ error }) => {
            lastObservedStreamError = error;
            await this.logger.log("error", "[agent] stream.error", {
              sessionId,
              ...summarizeStreamError(error),
            });
          },
        });

        const stepAssistantUiMessage = await collectFinalAssistantMessageFromUiStream({
          result,
          sessionId,
          logger: this.logger,
          buildFallbackAssistantMessage: (text) =>
            this.contextComposer.buildFallbackAssistantMessage(text),
        });

        const executedSteps = await result.steps;
        const lastStep = executedSteps[executedSteps.length - 1];
        if (!lastStep) break;

        const incompleteResponse = detectIncompleteResponse({
          stepResult: lastStep,
          assistantMessage: stepAssistantUiMessage,
        });
        const textOnlyContinuationReason =
          detectTextOnlyContinuationReason(lastStep);
        const loopDecision = evaluateCoreEngineLoopDecision({
          hasIncompleteResponse: incompleteResponse !== null,
          incompleteRecoveryCount: incompleteResponseRecoveryCount,
          maxIncompleteRecoveries: MAX_INCOMPLETE_RESPONSE_RECOVERIES,
          textOnlyContinuationReason,
          textOnlyContinuationCount,
          maxTextOnlyContinuations: MAX_TEXT_ONLY_CONTINUATIONS,
          hasTools: Object.keys(tools).length > 0,
          toolCallCount: lastStep.toolCalls.length,
        });

        await this.logger.log("info", "[agent] loop.decision", {
          sessionId,
          stepIndex: stepCount,
          continueForToolCalls: loopDecision.continueForToolCalls,
          continueForTextOnly: loopDecision.continueForTextOnly,
          continueForIncompleteRecovery:
            loopDecision.continueForIncompleteRecovery,
          decisionKind: loopDecision.kind,
          textOnlyContinuationReason,
          textOnlyContinuationCount,
          incompleteResponseReason: incompleteResponse?.reason ?? null,
          incompleteResponseRecoveryCount,
          toolCallCount: lastStep.toolCalls.length,
          toolResultCount: lastStep.toolResults.length,
          finishReason: lastStep.finishReason,
          textPreview: toInlinePreview(lastStep.text),
        });

        if (loopDecision.continueForIncompleteRecovery && incompleteResponse) {
          incompleteResponseRecoveryCount += 1;
          await this.logger.log("warn", "[agent] incomplete_response.recover", {
            sessionId,
            stepIndex: stepCount,
            recoveryCount: incompleteResponseRecoveryCount,
            reason: incompleteResponse.reason,
            ...incompleteResponse.details,
          });
          const recoveryMessage = this.historyStore.userText({
            text: buildIncompleteResponseRecoveryNudge(
              incompleteResponseRecoveryCount,
            ),
            metadata: {
              sessionId,
              extra: {
                internal: "agent_incomplete_response_recover",
                reason: incompleteResponse.reason,
                stepIndex: stepCount,
              },
            },
          });
          await messageState.appendUserTextMessage(recoveryMessage);
          continue;
        }

        if (incompleteResponse) {
          await this.logger.log("error", "[agent] incomplete_response", {
            sessionId,
            stepIndex: stepCount,
            reason: incompleteResponse.reason,
            recoveryCount: incompleteResponseRecoveryCount,
            ...incompleteResponse.details,
          });
          throw new Error(
            `Agent received incomplete response (${incompleteResponse.reason})`,
          );
        }

        const responseMessages = Array.isArray(lastStep.response?.messages)
          ? lastStep.response.messages
          : [];
        messageState.appendModelMessages(responseMessages);

        finalAssistantUiMessage = mergeAssistantUiMessages(
          finalAssistantUiMessage,
          stepAssistantUiMessage,
        );

        // 关键点（中文）：把本 step 的 assistant UI 消息并入运行时上下文，保证后续全量重算不丢历史。
        messageState.appendRuntimeSessionMessage(stepAssistantUiMessage);

        if (loopDecision.continueForToolCalls) {
          textOnlyContinuationCount = 0;
          incompleteResponseRecoveryCount = 0;
          continue;
        }

        if (loopDecision.continueForTextOnly) {
          textOnlyContinuationCount += 1;
          incompleteResponseRecoveryCount = 0;
          const continuationMessage = this.historyStore.userText({
            text: buildTextOnlyContinuationNudge(textOnlyContinuationCount),
            metadata: {
              sessionId,
              extra: {
                internal: "agent_loop_auto_continue",
                reason: textOnlyContinuationReason,
                stepIndex: stepCount,
              },
            },
          });
          await messageState.appendUserTextMessage(continuationMessage);
          continue;
        }

        // 关键点（中文）：stop 前做 tail merge，覆盖最后一个 step 后才入队的新 user 消息。
        const tailPrepared = await prepareStep({ messages: [] });
        const tailMergedMessageCount = Array.isArray(tailPrepared.messages)
          ? tailPrepared.messages.length
          : 0;
        if (
          shouldContinueForTailMergedUserMessages({
            mergedUserMessageCount: tailMergedMessageCount,
          })
        ) {
          textOnlyContinuationCount = 0;
          incompleteResponseRecoveryCount = 0;
          await this.logger.log("info", "[agent] loop.tail_merge_continue", {
            sessionId,
            stepIndex: stepCount,
            mergedUserMessageCount: tailMergedMessageCount,
          });
          continue;
        }

        break;
      }

      if (stepCount >= MAX_TOOL_LOOP_STEPS) {
        await this.logger.log("warn", "[agent] loop.max_steps_reached", {
          sessionId,
          stepCount,
          totalToolCallCount,
          totalToolResultCount,
        });
      }

      const finalMessage =
        finalAssistantUiMessage ||
        this.contextComposer.buildFallbackAssistantMessage("Execution completed");

      await this.logger.log("info", "[agent] final.message", {
        sessionId,
        ...summarizeUiMessageForDebug(finalMessage),
      });
      await logAssistantMessageNow(this.logger, finalMessage);

      const duration = Date.now() - startTime;
      await this.logger.log("info", "[agent] finish", {
        sessionId,
        duration,
        stepCount,
        totalToolCallCount,
        totalToolResultCount,
      });

      return {
        success: true,
        assistantMessage: finalMessage,
      };
    } catch (error) {
      if (this.compactionComposer.shouldCompactOnError(error)) {
        throw error;
      }

      const errorMsg = resolveEffectiveCoreEngineError({
        error,
        streamError: lastObservedStreamError,
      });

      await this.logger.log("error", "CoreEngine execution failed", {
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        assistantMessage: this.contextComposer.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * 读取当前 session 模型。
   */
  private resolveModelOrThrow(): LanguageModel {
    const model = this.getModel();
    if (!model) {
      throw new Error(
        `Executor for session "${this.sessionId}" requires a configured model. Pass model to new Agent({ model }), call session.set({ model }), or let the host configure the session before execution.`,
      );
    }
    return model;
  }

  /**
   * 重置当前 run 级状态。
   */
  private resetRunState(): void {
    this.retryCount = 0;
  }
}
