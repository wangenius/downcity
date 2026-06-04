/**
 * ExecutorRecoveryPolicy：执行恢复与重试策略。
 *
 * 关键点（中文）
 * - 统一封装“压缩后重试”和“普通失败兜底”逻辑。
 * - Executor 只负责准备输入与调用策略，不再直接承载重试状态机。
 * - 不改变外部行为，只把异常分流规则集中到一个地方。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type { SessionCompactionComposer } from "@executor/composer/compaction/SessionCompactionComposer.js";
import type { SessionContextComposer } from "@executor/composer/context/SessionContextComposer.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";

/**
 * 可压缩错误的最大重试次数。
 */
const MAX_COMPACTION_RETRY_ATTEMPTS = 3;

interface ExecutorRecoveryPolicyOptions {
  /**
   * 当前 session 对应的 compaction Composer。
   */
  compaction_composer: SessionCompactionComposer;

  /**
   * 当前 session 对应的 context Composer。
   */
  context_composer: SessionContextComposer;

  /**
   * 当前 session 统一日志器。
   */
  logger: Logger;
}

interface ExecutorPrepareRunInput {
  /**
   * 当前轮用户 query。
   */
  query: string;

  /**
   * 当前轮模型实例。
   */
  model: LanguageModel;

  /**
   * 当前显式运行上下文。
   */
  run_context: SessionRunContext;

  /**
   * 当前压缩重试次数。
   */
  retry_count: number;
}

interface ExecutorExecutePreparedRunInput {
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

interface ExecutorRecoveryRunInput {
  /**
   * 当前轮用户 query。
   */
  query: string;

  /**
   * 当前轮模型实例。
   */
  model: LanguageModel;

  /**
   * 当前显式运行上下文。
   */
  run_context: SessionRunContext;

  /**
   * 运行前装配执行输入。
   */
  prepare_execute_input: (
    input: ExecutorPrepareRunInput,
  ) => Promise<SessionExecuteInput>;

  /**
   * 执行已装配好的运行输入。
   */
  execute_prepared_run: (
    input: ExecutorExecutePreparedRunInput,
  ) => Promise<SessionRunResult>;
}

/**
 * 执行恢复与重试策略服务。
 */
export class ExecutorRecoveryPolicy {
  private readonly compaction_composer: SessionCompactionComposer;
  private readonly context_composer: SessionContextComposer;
  private readonly logger: Logger;
  private retry_count = 0;

  constructor(options: ExecutorRecoveryPolicyOptions) {
    this.compaction_composer = options.compaction_composer;
    this.context_composer = options.context_composer;
    this.logger = options.logger;
  }

  /**
   * 重置当前 run 级状态。
   */
  reset_run_state(): void {
    this.retry_count = 0;
  }

  /**
   * 执行一次带恢复策略的 session run。
   */
  async run_with_retry(
    input: ExecutorRecoveryRunInput,
  ): Promise<SessionRunResult> {
    try {
      const execute_input = await input.prepare_execute_input({
        query: input.query,
        model: input.model,
        run_context: input.run_context,
        retry_count: this.retry_count,
      });
      return await input.execute_prepared_run({
        execute_input,
        model: input.model,
        run_context: input.run_context,
      });
    } catch (error) {
      if (this.compaction_composer.shouldCompactOnError(error)) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retry_count,
          error: String(error),
        });

        if (this.retry_count < MAX_COMPACTION_RETRY_ATTEMPTS) {
          this.retry_count += 1;
          return await this.run_with_retry(input);
        }

        return this.build_failure_result({
          error_text:
            "Context length exceeded and retries failed. Please resend your question.",
          fallback_text:
            "Context length exceeded and retries failed. Please resend your question.",
          run_context: input.run_context,
        });
      }

      const error_text = String(error);
      await this.logger.log("error", "Executor execution failed", {
        error: error_text,
      });
      return this.build_failure_result({
        error_text,
        fallback_text: `Execution failed: ${error_text}`,
        run_context: input.run_context,
      });
    }
  }

  private build_failure_result(input: {
    /**
     * 对外暴露的错误文本。
     */
    error_text: string;

    /**
     * fallback assistant 消息文本。
     */
    fallback_text: string;

    /**
     * 当前显式运行上下文。
     */
    run_context: SessionRunContext;
  }): SessionRunResult {
    return {
      success: false,
      error: input.error_text,
      assistantMessage: this.context_composer.buildFallbackAssistantMessage(
        input.fallback_text,
        input.run_context,
      ),
      deferredPersistedUserMessages: [
        ...input.run_context.deferredPersistedUserMessages,
      ],
    };
  }
}
