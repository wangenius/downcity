/**
 * SessionCore：Session 执行内核。
 *
 * 关键点（中文）
 * - 这个类只做“流程编排”，不承载业务策略。
 * - 业务策略由组件实现（Orchestrator / Prompter / Persistor / Compactor）。
 * - 本文件追求“看注释即可理解执行路径”。
 *
 * 主流程（中文）
 * 1) `run`：入口，做并发保护与状态初始化。
 * 2) `runWithRetry`：做“可压缩错误”的重试。
 * 3) `prepareExecuteInput`：从各组件装配 system/tools/messages。
 * 4) `executePreparedRun`：执行 streamText tool-loop。
 * 5) `collectFinalAssistantMessage`：收敛最终 assistant 消息。
 */

import {
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { CompactorComponent } from "@sessions/components/CompactorComponent.js";
import { OrchestratorComponent } from "@sessions/components/OrchestratorComponent.js";
import { PersistorComponent } from "@sessions/components/PersistorComponent.js";
import { PrompterComponent } from "@sessions/components/PrompterComponent.js";
import {
  buildOpenAIResponsesProviderOptions,
  logAssistantMessageNow,
  pickMergedUserMessages,
  toModelMessages,
} from "@sessions/helpers/SessionHelpers.js";
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
} from "@sessions/runtime/SessionLoopSignals.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
  SessionRunInput,
} from "@/types/SessionRun.js";
import type { SessionMessageV1 } from "@/types/SessionMessage.js";
import type { JsonObject } from "@/types/Json.js";

/**
 * 可压缩错误的最大重试次数。
 */
const MAX_COMPACTION_RETRY_ATTEMPTS = 3;

/**
 * SessionCore 构造参数。
 */
type SessionCoreOptions = {
  /** 当前模型实例。 */
  model: LanguageModel;

  /** 统一日志器。 */
  logger: Logger;

  /** 当前会话持久化组件。 */
  persistor: PersistorComponent;

  /** 当前会话压缩组件。 */
  compactor: CompactorComponent;

  /** 当前轮运行编排组件。 */
  orchestrator: OrchestratorComponent;

  /** 当前轮 system 解析组件。 */
  prompter: PrompterComponent;
};

/**
 * SessionCore 主类。
 */
export class SessionCore {
  /** 模型实例：用于真正执行 streamText。 */
  private readonly model: LanguageModel;

  /** 日志实例：用于输出运行过程与错误。 */
  private readonly logger: Logger;

  /** 持久化组件：用于读写会话消息。 */
  private readonly persistor: PersistorComponent;

  /** 压缩组件：用于在上下文过长前执行 compact。 */
  private readonly compactor: CompactorComponent;

  /** 编排组件：用于提供 tools 与 step 回调。 */
  private readonly orchestrator: OrchestratorComponent;

  /** system 组件：用于解析 system messages。 */
  private readonly prompter: PrompterComponent;

  /** 运行互斥锁：防止同一个 SessionCore 实例并发 run。 */
  private isRunning = false;

  /** context-length 重试计数。 */
  private retryCount = 0;

  /**
   * 构造函数。
   */
  constructor(options: SessionCoreOptions) {
    // 注入模型。
    this.model = options.model;

    // 注入日志。
    this.logger = options.logger;

    // 注入持久化组件。
    this.persistor = options.persistor;

    // 注入压缩组件。
    this.compactor = options.compactor;

    // 注入编排组件。
    this.orchestrator = options.orchestrator;

    // 注入 system 组件。
    this.prompter = options.prompter;
  }

  /**
   * 执行一次 SessionCore run。
   *
   * 关键点（中文）
   * - 这里只做入口控制，不直接做模型调用。
   * - 保证同实例串行运行，避免 `retryCount` 等状态串线。
   */
  async run(input: SessionRunInput): Promise<SessionRunResult> {
    // 如果当前实例已经在运行，则直接拒绝并发调用。
    if (this.isRunning) {
      throw new Error("SessionCore.run does not support concurrent execution");
    }

    // 标记运行中。
    this.isRunning = true;

    // 每次新 run 先清理状态。
    this.resetRunState();

    try {
      // 真正执行带重试的 run。
      return await this.runWithRetry(input);
    } finally {
      // 无论成功失败都清理状态，避免污染下一轮。
      this.resetRunState();

      // 释放运行锁。
      this.isRunning = false;
    }
  }

  /**
   * 执行一次 SessionCore run（带可压缩错误重试）。
   *
   * 关键点（中文）
   * - 正常：准备输入 -> 执行。
   * - 异常：
   *   - 可压缩错误：压缩重试（是否可压缩由 compactor 决定）。
   *   - 其他错误：返回失败消息。
   */
  private async runWithRetry(input: SessionRunInput): Promise<SessionRunResult> {
    try {
      // 清理并规整 query，避免把 undefined/null 传入后续组件。
      const query = String(input.query || "").trim();

      // 组装本轮运行所需输入（system/messages/tools）。
      const prepared = await this.prepareExecuteInput(query);

      // 执行组装好的运行输入。
      return await this.executePreparedRun(prepared);
    } catch (error) {
      // 是否应压缩重试由 compactor 决策，SessionCore 只消费布尔结果。
      if (this.compactor.shouldCompactOnError(error)) {
        // 记录压缩重试日志，便于观测问题频率。
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retryCount,
          error: String(error),
        });

        // 若未超过上限，则增加计数并递归重试。
        if (this.retryCount < MAX_COMPACTION_RETRY_ATTEMPTS) {
          this.retryCount += 1;
          return this.runWithRetry(input);
        }

        // 达到上限后返回可读失败消息，避免死循环。
        return {
          success: false,
          assistantMessage: this.orchestrator.buildFallbackAssistantMessage(
            "Context length exceeded and retries failed. Please resend your question.",
          ),
        };
      }

      // 非“可压缩错误”走统一失败返回。
      const errorMsg = String(error);

      // 记录错误日志。
      await this.logger.log("error", "SessionCore execution failed", {
        error: errorMsg,
      });

      // 返回失败 assistant 消息。
      return {
        success: false,
        assistantMessage: this.orchestrator.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * 调用核心组件组装当前轮执行输入。
   *
   * 关键点（中文）
   * - orchestrator 提供 tools 与运行上下文。
   * - system 提供本轮 system messages。
   * - compactor 先尝试压缩，再由 persistor 产出消息基线。
   */
  private async prepareExecuteInput(query: string): Promise<SessionExecuteInput> {
    // 基础安全检查：persistor 必须携带 sessionId。
    if (!String(this.persistor.sessionId || "").trim()) {
      throw new Error("SessionCore.run requires persistor.sessionId");
    }

    // 让 orchestrator 组装运行上下文（例如 tools 与 request 作用域）。
    const runContext = await this.orchestrator.compose();

    // 拿到本轮工具集合。
    const tools = runContext.tools;

    // 解析本轮 system messages。
    const system = await this.prompter.resolve();

    try {
      // 只有在重试场景下才记录额外 compacting 日志。
      if (this.retryCount > 0) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retryCount,
        });
      }

      // 尝试执行压缩（best-effort，失败不阻断主流程）。
      await this.compactor.run({
        persistor: this.persistor,
        model: this.model,
        system,
        retryCount: this.retryCount,
      });
    } catch {
      // 压缩失败忽略，继续使用当前历史消息执行。
    }

    // 让 persistor 按当前 query/system/tools 生成消息基线。
    const messages = await this.persistor.prepare({
      query,
      tools,
      system,
      model: this.model,
      retryCount: this.retryCount,
    });

    // 返回最终可执行输入。
    return {
      system,
      messages,
      tools,
    };
  }

  /**
   * 执行一次已装配完成的运行材料。
   *
   * 关键点（中文）
   * - 这里只关心执行，不关心 request/context 参数怎么来的。
   * - 增量并入逻辑用来支持 step 间新增 user 消息。
   */
  private async executePreparedRun(
    input: SessionExecuteInput,
  ): Promise<SessionRunResult> {
    // 记录开始时间，用于 finish 日志。
    const startTime = Date.now();
    const sessionId = String(this.persistor.sessionId || "").trim();

    // 防御性兜底：确保 system 至少是数组。
    const system = Array.isArray(input.system) ? input.system : [];

    // 工具集合直接透传。
    const tools = input.tools;

    try {
      // 核心步骤 1（中文）：把 session messages 转成模型输入消息。
      let runtimeSessionMessages = Array.isArray(input.messages)
        ? [...input.messages]
        : [];

      // 根据当前基线消息生成模型消息。
      let baseModelMessages = await toModelMessages(runtimeSessionMessages, tools);

      // 核心步骤 2（中文）：定义“step 间新增 user 消息并入器”。
      const appendMergedUserMessages = async (
        messages: SessionMessageV1[],
      ): Promise<ModelMessage[]> => {
        // 子步骤 A（中文）：过滤出有效 user 文本消息。
        const mergedMessages = pickMergedUserMessages(messages);

        // 如果没有可并入消息，直接返回空增量。
        if (mergedMessages.length === 0) return [];

        // 子步骤 B（中文）：更新 context 基线，保证后续全量重算时可见这些新增消息。
        runtimeSessionMessages = [...runtimeSessionMessages, ...mergedMessages];

        // 先尝试只转换新增消息，减少重复计算。
        const mergedModelMessages = await toModelMessages(
          mergedMessages,
          tools,
        );

        // 如果增量转换成功，直接追加并返回增量。
        if (mergedModelMessages.length > 0) {
          baseModelMessages = [...baseModelMessages, ...mergedModelMessages];
          return mergedModelMessages;
        }

        // 子步骤 C（中文）：增量不可用时回退为全量重算，保证一致性。
        baseModelMessages = await toModelMessages(runtimeSessionMessages, tools);

        // 返回空，表示本次 prepareStep 不注入增量片段。
        return [];
      };

      // 从 orchestrator 获取 step 完成回调（用于中间输出处理）。
      const orchestratorOnStepFinish =
        this.orchestrator.createOnStepFinishHandler();
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
        await orchestratorOnStepFinish(stepResult);
      };

      // 从 orchestrator 获取 step 准备回调（用于 step 间消息并入）。
      const prepareStep = this.orchestrator.createPrepareStepHandler({
        system,
        appendMergedUserMessages,
      });

      // 核心步骤 3（中文）：改为显式外层循环，由 runtime 自己决定是否继续下一步。
      let finalAssistantUiMessage: SessionMessageV1 | null = null;
      let textOnlyContinuationCount = 0;
      let incompleteResponseRecoveryCount = 0;

      while (stepCount < MAX_TOOL_LOOP_STEPS) {
        const result = streamText({
          // 指定模型。
          model: this.model,
          // 指定 system。
          system,
          // 注入 step 完成钩子。
          onStepFinish,
          // 注入 step 准备钩子。
          prepareStep,
          // 注入消息基线。
          messages: baseModelMessages,
          // 注入工具集。
          tools,
          // 注入 provider 选项。
          providerOptions: buildOpenAIResponsesProviderOptions(),
        });

        // 单步收敛 UI assistant 消息，并累计为本轮最终消息。
        const stepAssistantUiMessage = await this.collectFinalAssistantMessage({
          result,
        });

        const executedSteps = await result.steps;
        const lastStep = executedSteps[executedSteps.length - 1];
        if (!lastStep) break;

        const incompleteResponse = detectIncompleteResponse({
          stepResult: lastStep,
          assistantMessage: stepAssistantUiMessage,
        });
        const shouldRecoverIncompleteResponse =
          incompleteResponse !== null &&
          incompleteResponseRecoveryCount < MAX_INCOMPLETE_RESPONSE_RECOVERIES;

        const textOnlyContinuationReason =
          detectTextOnlyContinuationReason(lastStep);
        const shouldContinueForToolCalls = lastStep.toolCalls.length > 0;
        const shouldContinueForTextOnly =
          !shouldContinueForToolCalls &&
          textOnlyContinuationReason !== null &&
          Object.keys(tools).length > 0 &&
          textOnlyContinuationCount < MAX_TEXT_ONLY_CONTINUATIONS;

        await this.logger.log("info", "[agent] loop.decision", {
          sessionId,
          stepIndex: stepCount,
          continueForToolCalls: shouldContinueForToolCalls,
          continueForTextOnly: shouldContinueForTextOnly,
          continueForIncompleteRecovery: shouldRecoverIncompleteResponse,
          textOnlyContinuationReason,
          textOnlyContinuationCount,
          incompleteResponseReason: incompleteResponse?.reason ?? null,
          incompleteResponseRecoveryCount,
          toolCallCount: lastStep.toolCalls.length,
          toolResultCount: lastStep.toolResults.length,
          finishReason: lastStep.finishReason,
          textPreview: toInlinePreview(lastStep.text),
        });

        if (shouldRecoverIncompleteResponse && incompleteResponse) {
          incompleteResponseRecoveryCount += 1;
          await this.logger.log("warn", "[agent] incomplete_response.recover", {
            sessionId,
            stepIndex: stepCount,
            recoveryCount: incompleteResponseRecoveryCount,
            reason: incompleteResponse.reason,
            ...incompleteResponse.details,
          });
          const recoveryMessage = this.persistor.userText({
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
          runtimeSessionMessages = [...runtimeSessionMessages, recoveryMessage];
          const recoveryModelMessages = await toModelMessages(
            [recoveryMessage],
            tools,
          );
          if (recoveryModelMessages.length > 0) {
            baseModelMessages = [...baseModelMessages, ...recoveryModelMessages];
          } else {
            baseModelMessages = await toModelMessages(
              runtimeSessionMessages,
              tools,
            );
          }
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
        if (responseMessages.length > 0) {
          baseModelMessages = [...baseModelMessages, ...responseMessages];
        }

        finalAssistantUiMessage = mergeAssistantUiMessages(
          finalAssistantUiMessage,
          stepAssistantUiMessage,
        );

        // 关键点（中文）：把本 step 的 assistant UI 消息并入运行时上下文，保证后续全量重算不丢历史。
        runtimeSessionMessages = [...runtimeSessionMessages, stepAssistantUiMessage];

        if (shouldContinueForToolCalls) {
          textOnlyContinuationCount = 0;
          incompleteResponseRecoveryCount = 0;
          continue;
        }

        if (shouldContinueForTextOnly) {
          textOnlyContinuationCount += 1;
          incompleteResponseRecoveryCount = 0;
          const continuationMessage = this.persistor.userText({
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
          runtimeSessionMessages = [...runtimeSessionMessages, continuationMessage];
          const continuationModelMessages = await toModelMessages(
            [continuationMessage],
            tools,
          );
          if (continuationModelMessages.length > 0) {
            baseModelMessages = [
              ...baseModelMessages,
              ...continuationModelMessages,
            ];
          } else {
            baseModelMessages = await toModelMessages(
              runtimeSessionMessages,
              tools,
            );
          }
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

      // 核心步骤 4（中文）：收敛最终 assistant 消息。
      const finalMessage =
        finalAssistantUiMessage ||
        this.orchestrator.buildFallbackAssistantMessage("Execution completed");

      await this.logger.log("info", "[agent] final.message", {
        sessionId,
        ...summarizeUiMessageForDebug(finalMessage),
      });

      // 输出 assistant 文本日志。
      await logAssistantMessageNow(this.logger, finalMessage);

      // 计算耗时。
      const duration = Date.now() - startTime;

      // 写入 finish 日志。
      await this.logger.log("info", "[agent] finish", {
        sessionId,
        duration,
        stepCount,
        totalToolCallCount,
        totalToolResultCount,
      });

      // 返回成功结果。
      return {
        success: true,
        assistantMessage: finalMessage,
      };
    } catch (error) {
      // 可压缩错误上抛，让上层 runWithRetry 统一处理重试。
      if (this.compactor.shouldCompactOnError(error)) {
        throw error;
      }

      // 非“可压缩错误”转为失败结果。
      const errorMsg = String(error);

      // 记录错误日志。
      await this.logger.log("error", "SessionCore execution failed", {
        error: errorMsg,
      });

      // 返回失败消息。
      return {
        success: false,
        assistantMessage: this.orchestrator.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * 消费 UI stream 并解析最终 assistant 消息。
   *
   * 关键点（中文）
   * - 优先取 UI stream 的结构化 responseMessage。
   * - 取不到时回退到 `result.text` 生成文本消息。
   */
  private async collectFinalAssistantMessage(params: {
    result: ReturnType<typeof streamText>;
  }): Promise<SessionMessageV1> {
    // 用于接收 onFinish 传出的结构化 assistant 消息。
    let streamedAssistantMessage: SessionMessageV1 | null = null;
    let uiFinishSummary: JsonObject | null = null;

    // 创建 UI message stream。
    const uiStream = params.result.toUIMessageStream<SessionMessageV1>({
      // 不发送 reasoning 片段。
      sendReasoning: false,
      // 不发送来源片段。
      sendSources: false,
      // 在 finish 时收敛最终 responseMessage。
      onFinish: (event) => {
        streamedAssistantMessage = event.responseMessage ?? null;
        uiFinishSummary = {
          isContinuation: event.isContinuation,
          isAborted: event.isAborted,
          finishReason:
            typeof event.finishReason === "string" ? event.finishReason : null,
          ...summarizeUiMessageForDebug(event.responseMessage),
        };
      },
    });

    // 必须完整消费 stream，确保 onFinish 被触发。
    for await (const _ of uiStream) {
      // 此处只为驱动流消费，不处理 chunk。
    }

    await this.logger.log("info", "[agent] ui.finish", {
      sessionId: String(this.persistor.sessionId || "").trim(),
      ...(uiFinishSummary || {
        responseMessageMissing: true,
      }),
    });

    // 如果拿到结构化消息，直接返回。
    if (streamedAssistantMessage) return streamedAssistantMessage;

    // 回退路径：尝试读取纯文本结果。
    let assistantText = "";
    try {
      assistantText = String((await params.result.text) ?? "").trim();
    } catch {
      // 读取文本失败时保持空串。
      assistantText = "";
    }

    await this.logger.log("warn", "[agent] final.message.fallback", {
      sessionId: String(this.persistor.sessionId || "").trim(),
      assistantTextLength: assistantText.length,
      assistantTextPreview: toInlinePreview(assistantText),
    });

    // 用回退文本构造标准 assistant 消息并返回。
    return this.orchestrator.buildFallbackAssistantMessage(
      assistantText || "Execution completed",
    );
  }

  /**
   * 重置当前 run 状态。
   *
   * 关键点（中文）
   * - 统一收口 run 级状态，避免散落在多个位置。
   */
  private resetRunState(): void {
    // 当前仅维护 retryCount，重置为 0。
    this.retryCount = 0;
  }
}
