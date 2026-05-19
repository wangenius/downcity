/**
 * Session tool-loop runner。
 *
 * 关键点（中文）
 * - 这里只负责已准备好的 `SessionExecuteInput` 如何进入 `streamText` 循环。
 * - Runner 保留入口、重试与输入准备职责，本模块负责 step 循环、续写、恢复和最终日志。
 * - 运行过程中同时维护 UI assistant 消息、模型消息基线和 step 统计。
 */

import { streamText, type LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
} from "@/session/types/SessionRun.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { SessionExecutionComposer } from "@session/composer/execution/SessionExecutionComposer.js";
import {
  buildOpenAIResponsesProviderOptions,
} from "@session/messages/SessionMessageCodec.js";
import { logAssistantMessageNow } from "@session/messages/SessionMessageLog.js";
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
} from "@session/executors/local/SessionSignals.js";
import {
  evaluateSessionLoopDecision,
  shouldContinueForTailMergedUserMessages,
} from "@session/executors/local/SessionLoopDecision.js";
import {
  resolveEffectiveExecutionError,
  summarizeStreamError,
} from "@session/executors/local/SessionExecutionError.js";
import { collectFinalAssistantMessageFromUiStream } from "@session/executors/local/SessionUiStreamCollector.js";
import { SessionModelMessageState } from "@session/executors/local/SessionModelMessageState.js";

/**
 * SessionToolLoopRunner 构造参数。
 */
export type SessionToolLoopRunnerOptions = {
  /** 当前模型实例。 */
  model: LanguageModel;
  /** 统一日志器。 */
  logger: Logger;
  /** 当前会话历史存储。 */
  historyComposer: SessionHistoryComposer;
  /** 当前轮运行编排 Composer。 */
  executionComposer: SessionExecutionComposer;
  /** 判断错误是否应交给上层 compaction retry。 */
  shouldCompactOnError: (error: unknown) => boolean;
};

/**
 * 已准备输入的模型/tool-loop 执行器。
 */
export class SessionToolLoopRunner {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly historyComposer: SessionHistoryComposer;
  private readonly executionComposer: SessionExecutionComposer;
  private readonly shouldCompactOnError: (error: unknown) => boolean;

  constructor(options: SessionToolLoopRunnerOptions) {
    this.model = options.model;
    this.logger = options.logger;
    this.historyComposer = options.historyComposer;
    this.executionComposer = options.executionComposer;
    this.shouldCompactOnError = options.shouldCompactOnError;
  }

  /**
   * 执行一次已装配完成的运行材料。
   */
  async execute(input: SessionExecuteInput): Promise<SessionRunResult> {
    const startTime = Date.now();
    const sessionId = String(this.historyComposer.sessionId || "").trim();
    const system = Array.isArray(input.system) ? input.system : [];
    const tools = input.tools;
    let lastObservedStreamError: unknown = undefined;

    try {
      const messageState = await SessionModelMessageState.create({
        messages: input.messages,
        tools,
      });

      const appendMergedUserMessages = (messages: SessionMessageV1[]) =>
        messageState.appendMergedUserMessages(messages);

      const executionComposerOnStepFinish =
        this.executionComposer.createOnStepFinishHandler();
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
        await executionComposerOnStepFinish(stepResult);
      };

      const prepareStep = this.executionComposer.createPrepareStepHandler({
        system,
        appendMergedUserMessages,
      });

      let finalAssistantUiMessage: SessionMessageV1 | null = null;
      let textOnlyContinuationCount = 0;
      let incompleteResponseRecoveryCount = 0;

      while (stepCount < MAX_TOOL_LOOP_STEPS) {
        const result = streamText({
          model: this.model,
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
            this.executionComposer.buildFallbackAssistantMessage(text),
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
        const loopDecision = evaluateSessionLoopDecision({
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
          const recoveryMessage = this.historyComposer.userText({
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
          const continuationMessage = this.historyComposer.userText({
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
        this.executionComposer.buildFallbackAssistantMessage("Execution completed");

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
      if (this.shouldCompactOnError(error)) {
        throw error;
      }

      const errorMsg = resolveEffectiveExecutionError({
        error,
        streamError: lastObservedStreamError,
      });

      await this.logger.log("error", "Runner execution failed", {
        error: errorMsg,
      });

      return {
        success: false,
        error: errorMsg,
        assistantMessage: this.executionComposer.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }
}
