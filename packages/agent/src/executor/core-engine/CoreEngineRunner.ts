/**
 * CoreEngineRunner：模型与 tool-loop 主循环执行器。
 *
 * 关键点（中文）
 * - 只负责单次已装配输入的执行，不负责 run scope、外层重试与历史准备。
 * - 把 step 循环、续写恢复、最终 assistant 汇总等细节从 Executor 中剥离。
 * - 保持失败返回结构稳定，避免对外 Session 行为变化。
 */

import { streamText, type LanguageModel } from "ai";
import { buildOpenAIResponsesProviderOptions } from "@executor/messages/SessionMessageCodec.js";
import { logAssistantMessageNow } from "@executor/messages/SessionMessageLog.js";
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
} from "@executor/core-engine/CoreEngineSignals.js";
import {
  evaluateCoreEngineLoopDecision,
  shouldContinueForTailMergedUserMessages,
} from "@executor/core-engine/CoreEngineLoopDecision.js";
import {
  resolveEffectiveCoreEngineError,
  summarizeStreamError,
} from "@executor/core-engine/CoreEngineError.js";
import { collectFinalAssistantMessageFromUiStream } from "@executor/core-engine/CoreEngineUiStreamCollector.js";
import { CoreEngineMessageState } from "@executor/core-engine/CoreEngineMessageState.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { SessionContextComposer } from "@executor/composer/context/SessionContextComposer.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";

interface CoreEngineRunnerOptions {
  /**
   * 当前 session 对应的 history 事实源。
   */
  history_store: SessionHistoryStore;

  /**
   * 当前 session 对应的 context Composer。
   */
  context_composer: SessionContextComposer;

  /**
   * 当前 session 统一日志器。
   */
  logger: Logger;

  /**
   * 判断某次执行错误是否应该上抛给外层压缩重试。
   */
  should_compact_on_error: (error: unknown) => boolean;
}

interface CoreEngineRunInput {
  /**
   * 已装配好的执行输入。
   */
  execute_input: SessionExecuteInput;

  /**
   * 当前轮模型实例。
   */
  model: LanguageModel;

  /**
   * 当前显式运行上下文。
   */
  run_context: SessionRunContext;
}

/**
 * 模型与 tool-loop 主循环执行器。
 */
export class CoreEngineRunner {
  private readonly history_store: SessionHistoryStore;
  private readonly context_composer: SessionContextComposer;
  private readonly logger: Logger;
  private readonly should_compact_on_error: CoreEngineRunnerOptions["should_compact_on_error"];

  constructor(options: CoreEngineRunnerOptions) {
    this.history_store = options.history_store;
    this.context_composer = options.context_composer;
    this.logger = options.logger;
    this.should_compact_on_error = options.should_compact_on_error;
  }

  /**
   * 执行一次已装配完成的模型/tool-loop 运行。
   */
  async run(input: CoreEngineRunInput): Promise<SessionRunResult> {
    const start_time = Date.now();
    const session_id = String(this.history_store.sessionId || "").trim();
    const system = Array.isArray(input.execute_input.system)
      ? input.execute_input.system
      : [];
    const tools = input.execute_input.tools;
    let last_observed_stream_error: unknown = undefined;

    try {
      const message_state = await CoreEngineMessageState.create({
        messages: input.execute_input.messages,
        tools,
      });

      const append_merged_user_messages = (messages: SessionMessageV1[]) =>
        message_state.appendMergedUserMessages(messages);

      const context_composer_on_step_finish =
        this.context_composer.createOnStepFinishHandler(input.run_context);
      let step_count = 0;
      let total_tool_call_count = 0;
      let total_tool_result_count = 0;
      const on_step_finish = async (step_result: unknown): Promise<void> => {
        step_count += 1;
        const summary = summarizeStepForDebug(step_result);
        total_tool_call_count +=
          typeof summary.toolCallCount === "number" ? summary.toolCallCount : 0;
        total_tool_result_count +=
          typeof summary.toolResultCount === "number"
            ? summary.toolResultCount
            : 0;
        await this.logger.log("info", "[agent] step.finish", {
          sessionId: session_id,
          stepIndex: step_count,
          ...summary,
        });
        await context_composer_on_step_finish(step_result);
      };

      const prepare_step = this.context_composer.createPrepareStepHandler({
        system,
        appendMergedUserMessages: append_merged_user_messages,
        runContext: input.run_context,
      });

      let final_assistant_ui_message: SessionMessageV1 | null = null;
      let text_only_continuation_count = 0;
      let incomplete_response_recovery_count = 0;

      while (step_count < MAX_TOOL_LOOP_STEPS) {
        const result = streamText({
          model: input.model,
          system,
          onStepFinish: on_step_finish,
          prepareStep: prepare_step,
          messages: message_state.modelMessages,
          tools,
          providerOptions: buildOpenAIResponsesProviderOptions(),
          onError: async ({ error }) => {
            last_observed_stream_error = error;
            await this.logger.log("error", "[agent] stream.error", {
              sessionId: session_id,
              ...summarizeStreamError(error),
            });
          },
        });

        const step_assistant_ui_message =
          await collectFinalAssistantMessageFromUiStream({
            result,
            sessionId: session_id,
            logger: this.logger,
            buildFallbackAssistantMessage: (text) =>
              this.context_composer.buildFallbackAssistantMessage(
                text,
                input.run_context,
              ),
            onUiMessageChunkCallback: input.run_context.onUiMessageChunkCallback,
          });

        const executed_steps = await result.steps;
        const last_step = executed_steps[executed_steps.length - 1];
        if (!last_step) break;

        const incomplete_response = detectIncompleteResponse({
          stepResult: last_step,
          assistantMessage: step_assistant_ui_message,
        });
        const text_only_continuation_reason =
          detectTextOnlyContinuationReason(last_step);
        const loop_decision = evaluateCoreEngineLoopDecision({
          hasIncompleteResponse: incomplete_response !== null,
          incompleteRecoveryCount: incomplete_response_recovery_count,
          maxIncompleteRecoveries: MAX_INCOMPLETE_RESPONSE_RECOVERIES,
          textOnlyContinuationReason: text_only_continuation_reason,
          textOnlyContinuationCount: text_only_continuation_count,
          maxTextOnlyContinuations: MAX_TEXT_ONLY_CONTINUATIONS,
          hasTools: Object.keys(tools).length > 0,
          toolCallCount: last_step.toolCalls.length,
        });

        await this.logger.log("info", "[agent] loop.decision", {
          sessionId: session_id,
          stepIndex: step_count,
          continueForToolCalls: loop_decision.continueForToolCalls,
          continueForTextOnly: loop_decision.continueForTextOnly,
          continueForIncompleteRecovery:
            loop_decision.continueForIncompleteRecovery,
          decisionKind: loop_decision.kind,
          textOnlyContinuationReason: text_only_continuation_reason,
          textOnlyContinuationCount: text_only_continuation_count,
          incompleteResponseReason: incomplete_response?.reason ?? null,
          incompleteResponseRecoveryCount: incomplete_response_recovery_count,
          toolCallCount: last_step.toolCalls.length,
          toolResultCount: last_step.toolResults.length,
          finishReason: last_step.finishReason,
          textPreview: toInlinePreview(last_step.text),
        });

        if (
          loop_decision.continueForIncompleteRecovery &&
          incomplete_response
        ) {
          incomplete_response_recovery_count += 1;
          await this.logger.log("warn", "[agent] incomplete_response.recover", {
            sessionId: session_id,
            stepIndex: step_count,
            recoveryCount: incomplete_response_recovery_count,
            reason: incomplete_response.reason,
            ...incomplete_response.details,
          });
          const recovery_message = this.history_store.userText({
            text: buildIncompleteResponseRecoveryNudge(
              incomplete_response_recovery_count,
            ),
            metadata: {
              sessionId: session_id,
              extra: {
                internal: "agent_incomplete_response_recover",
                reason: incomplete_response.reason,
                stepIndex: step_count,
              },
            },
          });
          await message_state.appendUserTextMessage(recovery_message);
          continue;
        }

        if (incomplete_response) {
          await this.logger.log("error", "[agent] incomplete_response", {
            sessionId: session_id,
            stepIndex: step_count,
            reason: incomplete_response.reason,
            recoveryCount: incomplete_response_recovery_count,
            ...incomplete_response.details,
          });
          throw new Error(
            `Agent received incomplete response (${incomplete_response.reason})`,
          );
        }

        const response_messages = Array.isArray(last_step.response?.messages)
          ? last_step.response.messages
          : [];
        message_state.appendModelMessages(response_messages);

        final_assistant_ui_message = mergeAssistantUiMessages(
          final_assistant_ui_message,
          step_assistant_ui_message,
        );

        // 关键点（中文）：把本 step 的 assistant UI 消息并入运行时上下文，保证后续全量重算不丢历史。
        message_state.appendRuntimeSessionMessage(step_assistant_ui_message);

        if (loop_decision.continueForToolCalls) {
          text_only_continuation_count = 0;
          incomplete_response_recovery_count = 0;
          continue;
        }

        if (loop_decision.continueForTextOnly) {
          text_only_continuation_count += 1;
          incomplete_response_recovery_count = 0;
          const continuation_message = this.history_store.userText({
            text: buildTextOnlyContinuationNudge(text_only_continuation_count),
            metadata: {
              sessionId: session_id,
              extra: {
                internal: "agent_loop_auto_continue",
                reason: text_only_continuation_reason,
                stepIndex: step_count,
              },
            },
          });
          await message_state.appendUserTextMessage(continuation_message);
          continue;
        }

        // 关键点（中文）：stop 前做 tail merge，覆盖最后一个 step 后才入队的新 user 消息。
        const tail_prepared = await prepare_step({ messages: [] });
        const tail_merged_message_count = Array.isArray(tail_prepared.messages)
          ? tail_prepared.messages.length
          : 0;
        if (
          shouldContinueForTailMergedUserMessages({
            mergedUserMessageCount: tail_merged_message_count,
          })
        ) {
          text_only_continuation_count = 0;
          incomplete_response_recovery_count = 0;
          await this.logger.log("info", "[agent] loop.tail_merge_continue", {
            sessionId: session_id,
            stepIndex: step_count,
            mergedUserMessageCount: tail_merged_message_count,
          });
          continue;
        }

        break;
      }

      if (step_count >= MAX_TOOL_LOOP_STEPS) {
        await this.logger.log("warn", "[agent] loop.max_steps_reached", {
          sessionId: session_id,
          stepCount: step_count,
          totalToolCallCount: total_tool_call_count,
          totalToolResultCount: total_tool_result_count,
        });
      }

      const final_message =
        final_assistant_ui_message ||
        this.context_composer.buildFallbackAssistantMessage(
          "Execution completed",
          input.run_context,
        );

      await this.logger.log("info", "[agent] final.message", {
        sessionId: session_id,
        ...summarizeUiMessageForDebug(final_message),
      });
      await logAssistantMessageNow(this.logger, final_message);

      const duration = Date.now() - start_time;
      await this.logger.log("info", "[agent] finish", {
        sessionId: session_id,
        duration,
        stepCount: step_count,
        totalToolCallCount: total_tool_call_count,
        totalToolResultCount: total_tool_result_count,
      });

      return {
        success: true,
        assistantMessage: final_message,
        deferredPersistedUserMessages: [
          ...input.run_context.deferredPersistedUserMessages,
        ],
      };
    } catch (error) {
      if (this.should_compact_on_error(error)) {
        throw error;
      }

      const error_text = resolveEffectiveCoreEngineError({
        error,
        streamError: last_observed_stream_error,
      });

      await this.logger.log("error", "CoreEngine execution failed", {
        error: error_text,
      });

      return {
        success: false,
        error: error_text,
        assistantMessage: this.context_composer.buildFallbackAssistantMessage(
          `Execution failed: ${error_text}`,
          input.run_context,
        ),
        deferredPersistedUserMessages: [
          ...input.run_context.deferredPersistedUserMessages,
        ],
      };
    }
  }
}
