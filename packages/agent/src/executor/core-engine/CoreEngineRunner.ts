/**
 * CoreEngineRunner：模型与 tool-loop 主循环执行器。
 *
 * 关键点（中文）
 * - 只负责单次已装配输入的执行，不负责 run scope、外层重试与历史准备。
 * - 把 step 循环、续写恢复、最终 assistant 汇总等细节从 Executor 中剥离。
 * - 保持失败返回结构稳定，避免对外 Session 行为变化。
 */

import {
  streamText,
  type FileUIPart,
  type LanguageModel,
  type StepResult,
  type Tool,
} from "ai";
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
import {
  deep_compact_model_messages,
  resolve_model_usage_ratio,
  should_compact_after_usage,
} from "@executor/core-engine/CoreEngineContextCompaction.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { SessionContextComposer } from "@executor/composer/context/SessionContextComposer.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
} from "@/executor/types/SessionRecords.js";

const TURN_STOPPED_MESSAGE = "Turn stopped";

/** Provider context-length error 在当前 step 内最多压缩重试三次。 */
const MAX_CONTEXT_ERROR_COMPACTION_RETRIES = 3;

/**
 * 生成 file part 去重 key。
 */
function build_file_part_key(part: FileUIPart): string {
  return [
    String(part.type || ""),
    String(part.mediaType || ""),
    String(part.filename || ""),
    String(part.url || ""),
  ].join("\n");
}

/**
 * 把 tool/plugin 运行期产生的 file parts 并入最终 assistant UIMessage。
 */
function mergePendingAssistantFileParts(
  message: SessionMessageRecordV1,
  parts: FileUIPart[],
): SessionMessageRecordV1 {
  if (!Array.isArray(parts) || parts.length === 0) return message;
  const current_parts = Array.isArray(message.parts) ? message.parts : [];
  const seen = new Set<string>();
  for (const part of current_parts) {
    const candidate = part as FileUIPart;
    if (candidate?.type !== "file") continue;
    seen.add(build_file_part_key(candidate));
  }
  const next_file_parts = parts.filter((part) => {
    const key = build_file_part_key(part);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (next_file_parts.length === 0) return message;
  return {
    ...message,
    parts: [...current_parts, ...next_file_parts],
  };
}

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

  /**
   * 在统一输入队列提交后解析当前 Session step 的 effective 配置。
   */
  resolve_step_inputs: () => Promise<{
    /** 当前 Session step 使用的模型。 */
    model: LanguageModel;
    /** 当前 Session step 使用的 system messages。 */
    system: SessionExecuteInput["system"];
    /** 当前 Session step 使用的工具集合。 */
    tools: SessionExecuteInput["tools"];
    /** 当前 Session step 模型支持的总上下文窗口长度。 */
    context_window?: number;
  }>;
}

/**
 * 模型与 tool-loop 主循环执行器。
 */
export class CoreEngineRunner {
  private readonly history_store: SessionHistoryStore;
  private readonly context_composer: SessionContextComposer;
  private readonly logger: Logger;
  private readonly should_compact_on_error: CoreEngineRunnerOptions["should_compact_on_error"];

  /** 最近一次已经通过真实 usage 验收的持久化 Summary 标识。 */
  private validated_compaction_summary_id = "";

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
    let system = Array.isArray(input.execute_input.system)
      ? input.execute_input.system
      : [];
    let tools = input.execute_input.tools;
    let last_observed_stream_error: unknown = undefined;
    let final_assistant_ui_message: SessionMessageRecordV1 | null = null;
    let compact_required = false;

    try {
      const message_state = await CoreEngineMessageState.create({
        messages: input.execute_input.messages,
        tools,
        projectRoot: input.run_context.projectRoot,
      });
      const persisted_compaction_summary_id = resolve_compaction_summary_id(
        input.execute_input.messages,
      );

      const append_merged_user_messages = (messages: SessionRecordV1[]) =>
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

      const prepare_step_inputs = this.context_composer.createPrepareStepHandler({
        system,
        appendMergedUserMessages: append_merged_user_messages,
        runContext: input.run_context,
      });

      let text_only_continuation_count = 0;
      let incomplete_response_recovery_count = 0;
      let context_error_compaction_retries = 0;
      let compact_pending = false;
      let compact_validation_pending = Boolean(
        persisted_compaction_summary_id &&
          persisted_compaction_summary_id !==
            this.validated_compaction_summary_id,
      );
      let compact_depth = 0;

      while (step_count < MAX_TOOL_LOOP_STEPS) {
        // 关键点（中文）：steer 与配置 mutation 在同一个 Session step 检查点提交。
        // 当前流与 tool callback 保持原执行视图，下一 step 再统一读取 effective 配置。
        await prepare_step_inputs({ messages: [] });
        const step_inputs = await input.resolve_step_inputs();
        system = Array.isArray(step_inputs.system) ? step_inputs.system : [];
        tools = step_inputs.tools;
        if (compact_pending) {
          const previous_message_count = message_state.modelMessages.length;
          message_state.replace_model_messages(
            deep_compact_model_messages(
              message_state.modelMessages,
              compact_depth,
            ),
          );
          compact_depth += 1;
          compact_pending = false;
          compact_validation_pending = true;
          compact_required = true;
          await this.logger.log("info", "[agent] context.compacted", {
            sessionId: session_id,
            reason: "usage_threshold",
            compactDepth: compact_depth,
            previousMessageCount: previous_message_count,
            nextMessageCount: message_state.modelMessages.length,
          });
        }

        last_observed_stream_error = undefined;
        let step_assistant_ui_message: SessionMessageRecordV1;
        let executed_steps: StepResult<Record<string, Tool>>[];
        try {
          const result = streamText({
            model: step_inputs.model,
            system,
            onStepFinish: on_step_finish,
            messages: message_state.modelMessages,
            tools,
            abortSignal: input.run_context.abortSignal,
            providerOptions: buildOpenAIResponsesProviderOptions(),
            onError: async ({ error }) => {
              last_observed_stream_error = error;
              await this.logger.log("error", "[agent] stream.error", {
                sessionId: session_id,
                ...summarizeStreamError(error),
              });
            },
          });

          step_assistant_ui_message =
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
              abortSignal: input.run_context.abortSignal,
            });

          final_assistant_ui_message = mergeAssistantUiMessages(
            final_assistant_ui_message,
            step_assistant_ui_message,
          );

          // 关键点（中文）：先保存本 step 已收敛的 assistant 消息，再等待 steps。
          // stop/abort 时 `result.steps` 可能抛错，但当前已经生成的文本仍应沉淀。
          message_state.appendRuntimeSessionMessage(step_assistant_ui_message);
          executed_steps = await result.steps;
        } catch (error) {
          const compact_error = this.should_compact_on_error(error)
            ? error
            : last_observed_stream_error;
          if (
            this.should_compact_on_error(compact_error) &&
            context_error_compaction_retries <
              MAX_CONTEXT_ERROR_COMPACTION_RETRIES
          ) {
            context_error_compaction_retries += 1;
            const previous_message_count = message_state.modelMessages.length;
            message_state.replace_model_messages(
              deep_compact_model_messages(
                message_state.modelMessages,
                compact_depth,
              ),
            );
            compact_depth += 1;
            compact_pending = false;
            compact_validation_pending = true;
            compact_required = true;
            await this.logger.log("warn", "[agent] context.compacted", {
              sessionId: session_id,
              reason: "provider_context_error",
              retryCount: context_error_compaction_retries,
              compactDepth: compact_depth,
              previousMessageCount: previous_message_count,
              nextMessageCount: message_state.modelMessages.length,
              ...summarizeStreamError(compact_error),
            });
            continue;
          }
          throw error;
        }

        context_error_compaction_retries = 0;
        const last_step = executed_steps[executed_steps.length - 1];
        if (!last_step) break;

        const usage_ratio = resolve_model_usage_ratio(
          last_step.usage,
          step_inputs.context_window,
        );
        if (usage_ratio !== null) {
          const validating_compaction = compact_validation_pending;
          compact_pending = should_compact_after_usage(
            usage_ratio,
            validating_compaction,
          );
          compact_validation_pending = false;
          if (validating_compaction && persisted_compaction_summary_id) {
            this.validated_compaction_summary_id =
              persisted_compaction_summary_id;
          }
          if (compact_pending) compact_required = true;
          await this.logger.log("info", "[agent] context.usage", {
            sessionId: session_id,
            stepIndex: step_count,
            usageRatio: usage_ratio,
            contextWindow: step_inputs.context_window,
            validatingCompaction: validating_compaction,
            compactPending: compact_pending,
          });
        }

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
        const tail_merged_message_count = input.run_context.hasPendingStepInput?.()
          ? 1
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

      const final_message = mergePendingAssistantFileParts(
        final_assistant_ui_message ||
          this.context_composer.buildFallbackAssistantMessage(
            "Execution completed",
            input.run_context,
          ),
        input.run_context.pendingAssistantFileParts,
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
        ...(compact_required ? { compact_required: true } : {}),
        deferredPersistedUserMessages: [
          ...input.run_context.deferredPersistedUserMessages,
        ],
      };
    } catch (error) {
      if (input.run_context.abortSignal?.aborted) {
        const error_text = TURN_STOPPED_MESSAGE;
        await this.logger.log("info", "[agent] stopped", {
          sessionId: session_id,
        });
        const stopped_message = final_assistant_ui_message
          ? mergePendingAssistantFileParts(
              final_assistant_ui_message,
              input.run_context.pendingAssistantFileParts,
            )
          : null;
        return {
          success: false,
          error: error_text,
          ...(stopped_message ? { assistantMessage: stopped_message } : {}),
          ...(compact_required ? { compact_required: true } : {}),
          deferredPersistedUserMessages: [
            ...input.run_context.deferredPersistedUserMessages,
          ],
        };
      }

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
        ...(compact_required ? { compact_required: true } : {}),
        deferredPersistedUserMessages: [
          ...input.run_context.deferredPersistedUserMessages,
        ],
      };
    }
  }
}

/** 读取当前模型上下文中最新的持久化 compact Summary 标识。 */
function resolve_compaction_summary_id(messages: SessionRecordV1[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!("role" in message) || message.role !== "assistant") continue;
    if (
      message.metadata?.source === "compact" &&
      message.metadata.kind === "summary"
    ) {
      return String(message.id || "").trim();
    }
  }
  return "";
}
