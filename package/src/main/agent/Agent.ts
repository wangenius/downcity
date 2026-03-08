/**
 * Agent：通用执行器。
 *
 * 关键点（中文）
 * - 自身负责“调用核心组件装配 -> 执行 tool-loop”。
 * - 组件按运行节点收敛为：Orchestrator / Prompter / Compactor / Persistor。
 * - `AgentExecuteInput` 使用 context 语义消息，内部再转换为模型消息。
 */

import {
  convertToModelMessages,
  isTextUIPart,
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  type ToolSet,
} from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";
import { OrchestratorComponent } from "@main/agent/components/OrchestratorComponent.js";
import { PersistorComponent } from "@main/agent/components/PersistorComponent.js";
import { PrompterComponent } from "@main/agent/components/PrompterComponent.js";
import type {
  AgentExecuteInput,
  AgentResult,
  AgentRunInput,
} from "@main/types/Agent.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { ContextSystemMessage } from "@main/types/ContextSystemMessage.js";

const MAX_ERROR_HANDOVER_ATTEMPTS = 2;
const MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS = 3;
const MAX_TOOL_LOOP_STEPS = 64;

type AgentExecuteState = {
  errorHandoverAttempts: number;
  errorForAgent: string;
};

type AgentRunState = {
  retryCount: number;
};

type AgentStepLike = {
  text?: unknown;
  toolCalls?: unknown;
};

type AgentOptions = {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前会话持久化组件。
   */
  persistor: PersistorComponent;

  /**
   * 当前会话压缩组件。
   */
  compactor: CompactorComponent;

  /**
   * 当前轮运行编排组件。
   */
  orchestrator: OrchestratorComponent;

  /**
   * 当前轮 system 解析组件。
   */
  system: PrompterComponent;
};

/**
 * 判断是否为上下文长度超限错误。
 */
export function isContextLengthError(error: unknown): boolean {
  const errorMsg = String(error ?? "");
  return (
    errorMsg.includes("context_length") ||
    errorMsg.includes("too long") ||
    errorMsg.includes("maximum context") ||
    errorMsg.includes("context window")
  );
}

export class Agent {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly persistor: PersistorComponent;
  private readonly compactor: CompactorComponent;
  private readonly orchestrator: OrchestratorComponent;
  private readonly system: PrompterComponent;

  constructor(options: AgentOptions) {
    this.model = options.model;
    this.logger = options.logger;
    this.persistor = options.persistor;
    this.compactor = options.compactor;
    this.orchestrator = options.orchestrator;
    this.system = options.system;
  }

  /**
   * 执行一次 Agent run。
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    return this.runWithState(input, {
      retryCount: 0,
    });
  }

  /**
   * 执行一次 Agent run（带装配重试状态）。
   */
  private async runWithState(
    input: AgentRunInput,
    state: AgentRunState,
  ): Promise<AgentResult> {
    const query = String(input.query || "").trim();
    const contextId = String(this.persistor.contextId || "").trim();
    if (!contextId) {
      throw new Error("Agent.run requires persistor.contextId");
    }

    let requestId = "";

    try {
      const prepared = await this.prepareExecuteInput({
        contextId,
        query,
        retryCount: state.retryCount,
      });
      requestId = prepared.requestId;
      return await this.executePreparedRun(prepared, {
        errorHandoverAttempts: 0,
        errorForAgent: "",
      });
    } catch (error) {
      if (isContextLengthError(error)) {
        await this.logger.log("info", "[agent] compacting", {
          contextId,
          error: String(error),
          retryCount: state.retryCount,
        });
        if (state.retryCount >= MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS) {
          return {
            success: false,
            assistantMessage: this.buildFallbackAssistantMessage({
              contextId,
              requestId,
              text: "Context length exceeded and retries failed. Please resend your question.",
              note: "context_length_exceeded",
            }),
          };
        }
        return this.runWithState(input, {
          retryCount: state.retryCount + 1,
        });
      }

      const errorMsg = String(error);
      await this.logger.log("error", "Agent execution failed", {
        contextId,
        error: errorMsg,
      });
      return {
        success: false,
        assistantMessage: this.buildFallbackAssistantMessage({
          contextId,
          requestId,
          text: `Execution failed: ${errorMsg}`,
          note: "agent_execution_failed",
        }),
      };
    }
  }

  /**
   * 调用核心组件组装当前轮执行输入。
   */
  private async prepareExecuteInput(params: {
    contextId: string;
    query: string;
    retryCount: number;
  }): Promise<AgentExecuteInput> {
    const runContext = await this.orchestrator.compose({
      contextId: params.contextId,
    });
    const requestId = String(runContext.requestId || "").trim();
    if (!requestId) {
      throw new Error("Agent.prepareExecuteInput requires requestId");
    }
    const tools = this.normalizeRunTools(runContext.tools);
    const system = this.normalizeSystem(
      await this.system.resolve({
        contextId: params.contextId,
        requestId,
      }),
    );

    try {
      if (params.retryCount > 0) {
        await this.logger.log("info", "[agent] compacting", {
          contextId: params.contextId,
          retryCount: params.retryCount,
        });
      }
      await this.compactor.run({
        persistor: this.persistor,
        model: this.model,
        system,
        retryCount: params.retryCount,
      });
    } catch {
      // ignore
    }

    const messages = this.normalizeContextMessages(
      await this.persistor.prepare({
        query: params.query,
        tools,
        system,
        model: this.model,
        retryCount: params.retryCount,
      }),
    );

    return {
      requestId,
      system,
      messages,
      tools,
      ...(typeof runContext.onStepCallback === "function"
        ? { onStepCallback: runContext.onStepCallback }
        : {}),
      ...(typeof runContext.onAssistantStepCallback === "function"
        ? { onAssistantStepCallback: runContext.onAssistantStepCallback }
        : {}),
    };
  }

  /**
   * 执行一次已装配完成的运行材料。
   */
  private async executePreparedRun(
    input: AgentExecuteInput,
    state: AgentExecuteState,
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const contextId = String(this.persistor.contextId || "").trim();
    const requestId = String(input.requestId || "").trim();
    const system = this.normalizeSystem(input.system);
    const tools = this.normalizeRunTools(input.tools);
    const onStepCallback =
      typeof input.onStepCallback === "function"
        ? input.onStepCallback
        : undefined;
    const onAssistantStepCallback =
      typeof input.onAssistantStepCallback === "function"
        ? input.onAssistantStepCallback
        : undefined;
    const { errorHandoverAttempts } = state;

    // 核心步骤 1（中文）：组装本轮 context messages 基线（必要时追加错误交接提示）。
    let baseContextMessages = this.normalizeContextMessages(input.messages);
    const errorForAgent = String(state.errorForAgent || "").trim();
    if (errorForAgent) {
      baseContextMessages = [
        ...baseContextMessages,
        this.buildErrorHandoverUserMessage({
          contextId,
          requestId,
          errorMessage: errorForAgent,
          handoverAttempt: errorHandoverAttempts,
        }),
      ];
    }

    try {
      // 核心步骤 2（中文）：将 context 消息转换为模型消息，并构建“step 间追加 user 消息”的增量器。
      let baseModelMessages = await this.toModelMessages(
        baseContextMessages,
        tools,
      );
      const appendMergedUserMessages = async (
        messages: ContextMessageV1[],
      ): Promise<ModelMessage[]> => {
        const normalized = this.extractMergedUserMessages(messages);
        if (normalized.length === 0) return [];
        baseContextMessages = [...baseContextMessages, ...normalized];
        const mergedModelMessages = await this.toModelMessages(normalized, tools);
        if (mergedModelMessages.length > 0) {
          baseModelMessages = [...baseModelMessages, ...mergedModelMessages];
        } else {
          baseModelMessages = await this.toModelMessages(
            baseContextMessages,
            tools,
          );
        }
        return mergedModelMessages;
      };

      const onStepFinish = this.createOnStepFinishHandler({
        onAssistantStepCallback,
      });
      const prepareStep = this.createPrepareStepHandler({
        system,
        onStepCallback,
        appendMergedUserMessages,
      });

      const result = streamText({
        model: this.model,
        system,
        onStepFinish,
        prepareStep,
        messages: baseModelMessages,
        tools,
        providerOptions: this.buildOpenAIResponsesProviderOptions(),
        stopWhen: [stepCountIs(MAX_TOOL_LOOP_STEPS)],
      });

      // 核心步骤 3（中文）：消费 UI stream，并拿到最终 assistant message（含兜底）。
      const finalAssistantUiMessage = await this.collectFinalAssistantMessage({
        result,
        contextId,
        requestId,
      });

      // 核心步骤 4（中文）：记录完成日志并返回最终消息。
      const duration = Date.now() - startTime;
      await this.logger.log("info", "[agent] finish", {
        duration,
      });

      return {
        success: true,
        assistantMessage: finalAssistantUiMessage,
      };
    } catch (error) {
      return this.handleExecutePreparedRunError({
        error,
        input,
        contextId,
        requestId,
        errorHandoverAttempts,
      });
    }
  }

  /**
   * 生成 step 完成回调。
   *
   * 关键点（中文）
   * - 汇总本轮工具调用计数，供执行后校验使用。
   * - 若上层注入了 onAssistantStepCallback，则把本 step 文本回传给外层分步发送。
   */
  private createOnStepFinishHandler(params: {
    onAssistantStepCallback?: AgentExecuteInput["onAssistantStepCallback"];
  }): (stepResult: unknown) => Promise<void> {
    let assistantStepIndex = 0;
    return async (stepResult: unknown): Promise<void> => {
      const step = stepResult as AgentStepLike;
      const stepText = String(step.text || "").trim();
      if (typeof params.onAssistantStepCallback !== "function" || !stepText) return;
      try {
        assistantStepIndex += 1;
        await params.onAssistantStepCallback({
          text: stepText,
          // 关键点（中文）：1-based step 序号，按回调触发次数递增。
          stepIndex: assistantStepIndex,
        });
      } catch {
        // ignore assistant step callback failures
      }
    };
  }

  /**
   * 生成 prepareStep 回调。
   *
   * 关键点（中文）
   * - 每个 step 开始前，尝试把同 lane 新入队的 user 消息并入当前推理上下文。
   * - 只追加“本轮新增 user 消息”的 model 片段，不重排已有消息顺序。
   */
  private createPrepareStepHandler(params: {
    system: ContextSystemMessage[];
    onStepCallback?: AgentExecuteInput["onStepCallback"];
    appendMergedUserMessages: (
      messages: ContextMessageV1[],
    ) => Promise<ModelMessage[]>;
  }): (input: { messages?: ModelMessage[] }) => Promise<{
    system: ContextSystemMessage[];
    messages?: ModelMessage[];
  }> {
    return async ({
      messages,
    }: {
      messages?: ModelMessage[];
    }): Promise<{
      system: ContextSystemMessage[];
      messages?: ModelMessage[];
    }> => {
      if (typeof params.onStepCallback !== "function") {
        return { system: params.system };
      }

      const incomingMessages: ModelMessage[] = Array.isArray(messages)
        ? messages
        : [];
      let outMessages: ModelMessage[] | undefined;
      try {
        const mergedMessages = await params.onStepCallback();
        const mergedModelMessages = await params.appendMergedUserMessages(
          Array.isArray(mergedMessages) ? mergedMessages : [],
        );
        if (mergedModelMessages.length > 0) {
          // 关键点（中文）：保持当前 step 已有消息顺序不变，只把新增 user 消息追加到末尾，避免错序。
          outMessages = [...incomingMessages, ...mergedModelMessages];
        }
      } catch {
        // ignore merge hook failures
      }

      return {
        system: params.system,
        ...(Array.isArray(outMessages) ? { messages: outMessages } : {}),
      };
    };
  }

  /**
   * 消费 UI stream 并解析最终 assistant 消息。
   *
   * 关键点（中文）
   * - 优先使用 UI stream onFinish 给出的完整消息。
   * - 若 stream 未产出 message，则回退到 `result.text` 生成标准 assistant 文本消息。
   */
  private async collectFinalAssistantMessage(params: {
    result: ReturnType<typeof streamText>;
    contextId: string;
    requestId: string;
  }): Promise<ContextMessageV1> {
    let streamedAssistantMessage: ContextMessageV1 | null = null;
    const md = this.buildAssistantMessageMetadata({
      contextId: params.contextId,
      requestId: params.requestId,
      note: "ai_sdk_ui_message",
    });
    const uiStream = params.result.toUIMessageStream<ContextMessageV1>({
      sendReasoning: false,
      sendSources: false,
      generateMessageId: () => `a:${params.contextId}:${Date.now()}`,
      messageMetadata: () => md,
      onFinish: (event) => {
        streamedAssistantMessage = event.responseMessage ?? null;
      },
    });
    for await (const _ of uiStream) {
      // ignore chunks
    }
    if (streamedAssistantMessage) return streamedAssistantMessage;

    let assistantText = "";
    try {
      assistantText = String((await params.result.text) ?? "").trim();
    } catch {
      assistantText = "";
    }

    const fallback = this.buildFallbackAssistantMessage({
      contextId: params.contextId,
      requestId: params.requestId,
      text: assistantText || "Execution completed",
      note: "assistant_message_fallback",
    });
    return fallback;
  }

  /**
   * 统一处理 executePreparedRun 的错误语义。
   *
   * 关键点（中文）
   * - context-length 错误上抛给上层重试策略处理。
   * - 其他错误优先走“错误交接重试”，超过阈值再返回失败消息。
   */
  private async handleExecutePreparedRunError(params: {
    error: unknown;
    input: AgentExecuteInput;
    contextId: string;
    requestId: string;
    errorHandoverAttempts: number;
  }): Promise<AgentResult> {
    if (isContextLengthError(params.error)) {
      throw params.error;
    }

    const errorMsg = String(params.error);
    if (params.errorHandoverAttempts < MAX_ERROR_HANDOVER_ATTEMPTS) {
      await this.logger.log(
        "warn",
        "Agent run failed, hand over error back to agent",
        {
          contextId: params.contextId,
          error: errorMsg,
          errorHandoverAttempts: params.errorHandoverAttempts,
        },
      );
      return this.executePreparedRun(params.input, {
        errorHandoverAttempts: params.errorHandoverAttempts + 1,
        errorForAgent: errorMsg,
      });
    }

    await this.logger.log("error", "Agent execution failed", {
      contextId: params.contextId,
      error: errorMsg,
    });
    return {
      success: false,
      assistantMessage: this.buildFallbackAssistantMessage({
        contextId: params.contextId,
        requestId: params.requestId,
        text: `Execution failed: ${errorMsg}`,
        note: "agent_execution_failed",
      }),
    };
  }

  /**
   * 归一化 system messages。
   */
  private normalizeSystem(
    system: ContextSystemMessage[],
  ): ContextSystemMessage[] {
    if (!Array.isArray(system)) return [];
    return system.filter((item) => item && typeof item === "object");
  }

  /**
   * 归一化工具集合。
   */
  private normalizeRunTools(tools: Record<string, Tool>): Record<string, Tool> {
    return tools && typeof tools === "object" ? { ...tools } : {};
  }

  /**
   * 归一化 context 消息集合。
   */
  private normalizeContextMessages(
    messages: ContextMessageV1[],
  ): ContextMessageV1[] {
    if (!Array.isArray(messages)) return [];
    return messages
      .map((message) => {
        const parts = Array.isArray(message.parts)
          ? message.parts.filter((part) => part && typeof part === "object")
          : [];
        return {
          ...message,
          parts,
        };
      })
      .filter(
        (message) => Array.isArray(message.parts) && message.parts.length > 0,
      );
  }

  /**
   * 从回调返回值中提取可追加的 user 消息。
   */
  private extractMergedUserMessages(
    messages: ContextMessageV1[],
  ): ContextMessageV1[] {
    if (!Array.isArray(messages)) return [];
    return this.normalizeContextMessages(messages).filter((message) => {
      if (message.role !== "user") return false;
      const text = message.parts
        .filter(isTextUIPart)
        .map((part) => String(part.text ?? ""))
        .join("\n")
        .trim();
      return Boolean(text);
    });
  }

  /**
   * 将 context 消息转换为模型消息。
   */
  private async toModelMessages(
    messages: ContextMessageV1[],
    tools: Record<string, Tool>,
  ): Promise<ModelMessage[]> {
    const input = this.normalizeContextMessages(messages).map((message) => {
      const { id: _id, ...rest } = message;
      return rest;
    });
    if (input.length === 0) return [];
    return await convertToModelMessages(input, {
      ...(tools && Object.keys(tools).length > 0
        ? { tools: tools as ToolSet }
        : {}),
      ignoreIncompleteToolCalls: true,
    });
  }

  /**
   * 构造 assistant 消息元信息。
   */
  private buildAssistantMessageMetadata(params: {
    contextId: string;
    requestId?: string;
    note: string;
  }): ContextMetadataV1 {
    return {
      v: 1,
      ts: Date.now(),
      contextId: params.contextId,
      requestId: params.requestId,
      source: "egress",
      kind: "normal",
      extra: { note: params.note },
    };
  }

  /**
   * 构造 fallback assistant 消息。
   */
  private buildFallbackAssistantMessage(params: {
    contextId: string;
    requestId?: string;
    text: string;
    note: string;
  }): ContextMessageV1 {
    return this.persistor.assistantText({
      text: params.text,
      metadata: {
        contextId: params.contextId,
        requestId: params.requestId,
        extra: { note: params.note },
      },
      kind: "normal",
      source: "egress",
    });
  }

  /**
   * 构造错误交接 user 消息。
   */
  private buildErrorHandoverUserMessage(params: {
    contextId: string;
    requestId?: string;
    errorMessage: string;
    handoverAttempt: number;
  }): ContextMessageV1 {
    const normalizedError = String(params.errorMessage || "")
      .trim()
      .slice(0, 1200);
    return this.persistor.userText({
      text: [
        "上一轮执行出现错误，请不要结束，继续推进当前任务。",
        `错误信息：${normalizedError || "(empty error)"}`,
        "要求：分析错误原因，调整执行步骤，并继续调用需要的工具直到任务完成。",
        `错误交接轮次：${params.handoverAttempt + 1}`,
      ].join("\n"),
      metadata: {
        contextId: params.contextId,
        requestId: params.requestId,
        extra: { note: "agent_error_handover" },
      },
    });
  }

  /**
   * 构建 OpenAI Responses providerOptions。
   */
  private buildOpenAIResponsesProviderOptions(): {
    openai: {
      store: boolean;
    };
  } {
    return {
      openai: {
        store: false,
      },
    };
  }
}
