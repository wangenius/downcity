/**
 * Agent：最小执行层。
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
  stepCountIs,
  type LanguageModel,
  type ModelMessage
} from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { CompactorComponent } from "@agent/components/CompactorComponent.js";
import { OrchestratorComponent } from "@agent/components/OrchestratorComponent.js";
import { PersistorComponent } from "@agent/components/PersistorComponent.js";
import { PrompterComponent } from "@agent/components/PrompterComponent.js";
import {
  buildOpenAIResponsesProviderOptions,
  logAssistantMessageNow,
  pickMergedUserMessages,
  toModelMessages,
} from "@agent/helpers/AgentHelpers.js";
import type {
  AgentExecuteInput,
  AgentResult,
  AgentRunInput,
} from "@agent/types/Agent.js";
import type { ContextMessageV1 } from "@agent/types/ContextMessage.js";

/**
 * 可压缩错误的最大重试次数。
 */
const MAX_COMPACTION_RETRY_ATTEMPTS = 3;

/**
 * 单次 tool-loop 允许的最大 step 数。
 */
const MAX_TOOL_LOOP_STEPS = 64;

/**
 * Agent 构造参数。
 */
type AgentOptions = {
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
 * Agent 主类。
 */
export class Agent {
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

  /** 运行互斥锁：防止同一个 Agent 实例并发 run。 */
  private isRunning = false;

  /** context-length 重试计数。 */
  private retryCount = 0;

  /**
   * 构造函数。
   */
  constructor(options: AgentOptions) {
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
   * 执行一次 Agent run。
   *
   * 关键点（中文）
   * - 这里只做入口控制，不直接做模型调用。
   * - 保证同实例串行运行，避免 `retryCount` 等状态串线。
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    // 如果当前实例已经在运行，则直接拒绝并发调用。
    if (this.isRunning) {
      throw new Error("Agent.run does not support concurrent execution");
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
   * 执行一次 Agent run（带可压缩错误重试）。
   *
   * 关键点（中文）
   * - 正常：准备输入 -> 执行。
   * - 异常：
   *   - 可压缩错误：压缩重试（是否可压缩由 compactor 决定）。
   *   - 其他错误：返回失败消息。
   */
  private async runWithRetry(input: AgentRunInput): Promise<AgentResult> {
    try {
      // 清理并规整 query，避免把 undefined/null 传入后续组件。
      const query = String(input.query || "").trim();

      // 组装本轮运行所需输入（system/messages/tools）。
      const prepared = await this.prepareExecuteInput(query);

      // 执行组装好的运行输入。
      return await this.executePreparedRun(prepared);
    } catch (error) {
      // 是否应压缩重试由 compactor 决策，Agent 只消费布尔结果。
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
      await this.logger.log("error", "Agent execution failed", {
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
  private async prepareExecuteInput(query: string): Promise<AgentExecuteInput> {
    // 基础安全检查：persistor 必须携带 contextId。
    if (!String(this.persistor.contextId || "").trim()) {
      throw new Error("Agent.run requires persistor.contextId");
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
    input: AgentExecuteInput,
  ): Promise<AgentResult> {
    // 记录开始时间，用于 finish 日志。
    const startTime = Date.now();

    // 防御性兜底：确保 system 至少是数组。
    const system = Array.isArray(input.system) ? input.system : [];

    // 工具集合直接透传。
    const tools = input.tools;

    try {
      // 核心步骤 1（中文）：把 context messages 转成模型输入消息。
      let baseContextMessages = Array.isArray(input.messages)
        ? [...input.messages]
        : [];

      // 根据当前基线消息生成模型消息。
      let baseModelMessages = await toModelMessages(baseContextMessages, tools);

      // 核心步骤 2（中文）：定义“step 间新增 user 消息并入器”。
      const appendMergedUserMessages = async (
        messages: ContextMessageV1[],
      ): Promise<ModelMessage[]> => {
        // 子步骤 A（中文）：过滤出有效 user 文本消息。
        const mergedMessages = pickMergedUserMessages(messages);

        // 如果没有可并入消息，直接返回空增量。
        if (mergedMessages.length === 0) return [];

        // 子步骤 B（中文）：更新 context 基线，保证后续全量重算时可见这些新增消息。
        baseContextMessages = [...baseContextMessages, ...mergedMessages];

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
        baseModelMessages = await toModelMessages(baseContextMessages, tools);

        // 返回空，表示本次 prepareStep 不注入增量片段。
        return [];
      };

      // 从 orchestrator 获取 step 完成回调（用于中间输出处理）。
      const onStepFinish = this.orchestrator.createOnStepFinishHandler();

      // 从 orchestrator 获取 step 准备回调（用于 step 间消息并入）。
      const prepareStep = this.orchestrator.createPrepareStepHandler({
        system,
        appendMergedUserMessages,
      });

      // 核心步骤 3（中文）：启动 streamText 工具循环。
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
        // 限制最大 step 数，避免无界循环。
        stopWhen: [stepCountIs(MAX_TOOL_LOOP_STEPS)],
      });

      // 核心步骤 4（中文）：收敛最终 assistant 消息。
      const finalAssistantUiMessage = await this.collectFinalAssistantMessage({
        result,
      });

      // 输出 assistant 文本日志。
      await logAssistantMessageNow(this.logger, finalAssistantUiMessage);

      // 计算耗时。
      const duration = Date.now() - startTime;

      // 写入 finish 日志。
      await this.logger.log("info", "[agent] finish", {
        duration,
      });

      // 返回成功结果。
      return {
        success: true,
        assistantMessage: finalAssistantUiMessage,
      };
    } catch (error) {
      // 可压缩错误上抛，让上层 runWithRetry 统一处理重试。
      if (this.compactor.shouldCompactOnError(error)) {
        throw error;
      }

      // 非“可压缩错误”转为失败结果。
      const errorMsg = String(error);

      // 记录错误日志。
      await this.logger.log("error", "Agent execution failed", {
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
  }): Promise<ContextMessageV1> {
    // 用于接收 onFinish 传出的结构化 assistant 消息。
    let streamedAssistantMessage: ContextMessageV1 | null = null;

    // 创建 UI message stream。
    const uiStream = params.result.toUIMessageStream<ContextMessageV1>({
      // 不发送 reasoning 片段。
      sendReasoning: false,
      // 不发送来源片段。
      sendSources: false,
      // 在 finish 时收敛最终 responseMessage。
      onFinish: (event) => {
        streamedAssistantMessage = event.responseMessage ?? null;
      },
    });

    // 必须完整消费 stream，确保 onFinish 被触发。
    for await (const _ of uiStream) {
      // 此处只为驱动流消费，不处理 chunk。
    }

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
