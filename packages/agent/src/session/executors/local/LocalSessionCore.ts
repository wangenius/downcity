/**
 * LocalSessionCore：本地 Session 执行内核。
 *
 * 关键点（中文）
 * - 这个类只做“流程编排”，不承载业务策略。
 * - 业务策略由各 Composer 实现（ExecutionComposer / SystemComposer / HistoryComposer / CompactionComposer）。
 * - 本文件追求“看注释即可理解执行路径”。
 *
 * 主流程（中文）
 * 1) `run`：入口，做并发保护与状态初始化。
 * 2) `runWithRetry`：做“可压缩错误”的重试。
 * 3) `prepareExecuteInput`：从各组件装配 system / tools / messages。
 * 4) `executePreparedRun`：执行 streamText tool-loop。
 * 5) `collectFinalAssistantMessage`：收敛最终 assistant 消息。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";
import { SessionExecutionComposer } from "@session/composer/execution/SessionExecutionComposer.js";
import { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import type {
  SessionExecuteInput,
  SessionRunResult,
  SessionRunInput,
} from "@/session/types/SessionRun.js";
import { SessionToolLoopRunner } from "@session/executors/local/SessionToolLoopRunner.js";

/**
 * 可压缩错误的最大重试次数。
 */
const MAX_COMPACTION_RETRY_ATTEMPTS = 3;

/**
 * LocalSessionCore 构造参数。
 */
type LocalSessionCoreOptions = {
  /** 当前模型实例。 */
  model: LanguageModel;

  /** 统一日志器。 */
  logger: Logger;

  /** 当前会话历史存储。 */
  historyComposer: SessionHistoryComposer;

  /** 当前会话压缩组件。 */
  compactionComposer: SessionCompactionComposer;

  /** 当前轮运行编排 Composer。 */
  executionComposer: SessionExecutionComposer;

  /** 当前轮 system 解析器。 */
  systemComposer: SessionSystemComposer;

};

/**
 * LocalSessionCore 主类。
 */
export class LocalSessionCore {
  /** 模型实例：用于真正执行 streamText。 */
  private readonly model: LanguageModel;

  /** 日志实例：用于输出运行过程与错误。 */
  private readonly logger: Logger;

  /** 历史存储：用于读写会话消息。 */
  private readonly historyComposer: SessionHistoryComposer;

  /** 压缩 Composer：用于在上下文过长前执行 compact。 */
  private readonly compactionComposer: SessionCompactionComposer;

  /** 编排 Composer：用于提供 tools 与 step 回调。 */
  private readonly executionComposer: SessionExecutionComposer;

  /** system 解析器：用于解析 system messages。 */
  private readonly systemComposer: SessionSystemComposer;

  /** 运行互斥锁：防止同一个 LocalSessionCore 实例并发 run。 */
  private isRunning = false;

  /** context-length 重试计数。 */
  private retryCount = 0;

  /**
   * 构造函数。
   */
  constructor(options: LocalSessionCoreOptions) {
    // 注入模型。
    this.model = options.model;

    // 注入日志。
    this.logger = options.logger;

    // 注入 history Composer。
    this.historyComposer = options.historyComposer;

    // 注入 compaction Composer。
    this.compactionComposer = options.compactionComposer;

    // 注入 execution Composer。
    this.executionComposer = options.executionComposer;

    // 注入 system 解析器。
    this.systemComposer = options.systemComposer;

  }

  /**
   * 执行一次 LocalSessionCore run。
   *
   * 关键点（中文）
   * - 这里只做入口控制，不直接做模型调用。
   * - 保证同实例串行运行，避免 `retryCount` 等状态串线。
   */
  async run(input: SessionRunInput): Promise<SessionRunResult> {
    // 如果当前实例已经在运行，则直接拒绝并发调用。
    if (this.isRunning) {
      throw new Error("LocalSessionCore.run does not support concurrent execution");
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
   * 执行一次 LocalSessionCore run（带可压缩错误重试）。
   *
   * 关键点（中文）
   * - 正常：准备输入 -> 执行。
   * - 异常：
   *   - 可压缩错误：压缩重试（是否可压缩由 compaction Composer 决定）。
   *   - 其他错误：返回失败消息。
   */
  private async runWithRetry(input: SessionRunInput): Promise<SessionRunResult> {
    try {
      // 清理并规整 query，避免把 undefined / null 传入后续组件。
      const query = String(input.query || "").trim();

      // 组装本轮运行所需输入（system/messages/tools）。
      const prepared = await this.prepareExecuteInput(query);

      // 执行组装好的运行输入。
      return await this.executePreparedRun(prepared);
    } catch (error) {
      // 是否应压缩重试由 compaction Composer 决策，LocalSessionCore 只消费布尔结果。
      if (this.compactionComposer.shouldCompactOnError(error)) {
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
          error: "Context length exceeded and retries failed. Please resend your question.",
          assistantMessage: this.executionComposer.buildFallbackAssistantMessage(
            "Context length exceeded and retries failed. Please resend your question.",
          ),
        };
      }

      // 非“可压缩错误”走统一失败返回。
      const errorMsg = String(error);

      // 记录错误日志。
      await this.logger.log("error", "LocalSessionCore execution failed", {
        error: errorMsg,
      });

      // 返回失败 assistant 消息。
      return {
        success: false,
        error: errorMsg,
        assistantMessage: this.executionComposer.buildFallbackAssistantMessage(
          `Execution failed: ${errorMsg}`,
        ),
      };
    }
  }

  /**
   * 调用核心组件组装当前轮执行输入。
   *
   * 关键点（中文）
   * - execution Composer 提供 tools 与运行上下文。
   * - system 提供本轮 system messages。
   * - compaction Composer 先尝试压缩，再由 history Composer 产出消息基线。
  */
  private async prepareExecuteInput(query: string): Promise<SessionExecuteInput> {
    // 基础安全检查：historyComposer 必须携带 sessionId。
    if (!String(this.historyComposer.sessionId || "").trim()) {
      throw new Error("LocalSessionCore.run requires historyComposer.sessionId");
    }

    // 让 execution Composer 组装运行上下文（例如 tools 与 request 作用域）。
    const runContext = await this.executionComposer.compose();

    // 拿到本轮工具集合。
    const tools = runContext.tools;

    // 解析本轮 system messages。
    const baseSystem = await this.systemComposer.resolve();
    const system = baseSystem;

    try {
      // 只有在重试场景下才记录额外 compacting 日志。
      if (this.retryCount > 0) {
        await this.logger.log("info", "[agent] compacting", {
          retryCount: this.retryCount,
        });
      }

      // 尝试执行压缩（best-effort，失败不阻断主流程）。
      await this.compactionComposer.run({
        historyComposer: this.historyComposer,
        model: this.model,
        system,
        retryCount: this.retryCount,
      });
    } catch {
      // 压缩失败忽略，继续使用当前历史消息执行。
    }

    // 让 history Composer 按当前 query/system/tools 生成消息基线。
    const messages = await this.historyComposer.prepare({
      query,
      tools,
      system,
      model: this.model,
      retryCount: this.retryCount,
    });

    // 返回最终可执行输入。
    return {
      query,
      system,
      messages,
      tools,
    };
  }

  /**
   * 执行一次已装配完成的运行材料。
   *
   * 关键点（中文）
   * - 这里只关心执行，不关心 request / context 参数怎么来的。
   * - 增量并入逻辑用来支持 step 间新增 user 消息。
   */
  private async executePreparedRun(
    input: SessionExecuteInput,
  ): Promise<SessionRunResult> {
    const runner = new SessionToolLoopRunner({
      model: this.model,
      logger: this.logger,
      historyComposer: this.historyComposer,
      executionComposer: this.executionComposer,
      shouldCompactOnError: (error) =>
        this.compactionComposer.shouldCompactOnError(error),
    });
    return await runner.execute(input);
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
