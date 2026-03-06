/**
 * Agent：单会话执行器（微内核）。
 *
 * 关键职责（中文）
 * - 通过 Orchestrator 组装一次运行上下文（requestId/tools/onStep）。
 * - 通过 Systemer 解析本轮 system messages。
 * - 调用 Compactor + Persistor 准备 messages 后执行 tool-loop。
 * - 产出 assistant 结果消息，并处理有限重试。
 */

import {
  isTextUIPart,
  streamText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type SystemModelMessage,
  type Tool,
} from "ai";
import { generateId } from "@utils/Id.js";
import type { AgentRunInput, AgentResult } from "@main/types/Agent.js";
import type { Logger } from "@utils/logger/Logger.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import { PersistorComponent } from "@main/agent/components/PersistorComponent.js";
import { CompactorComponent } from "@main/agent/components/CompactorComponent.js";
import { OrchestratorComponent } from "@main/agent/components/OrchestratorComponent.js";
import { SystemerComponent } from "@main/agent/components/SystemerComponent.js";

const MAX_ERROR_HANDOVER_ATTEMPTS = 2;
const MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS = 3;

type AgentRunState = {
  retryCount: number;
  errorHandoverAttempts: number;
  errorForAgent: string;
};

type AgentOptions = {
  model: LanguageModel;
  logger: Logger;
  persistor: PersistorComponent;
  compactor: CompactorComponent;
  orchestrator: OrchestratorComponent;
  systemer: SystemerComponent;
};

export class Agent {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly persistor: PersistorComponent;
  private readonly compactor: CompactorComponent;
  private readonly orchestrator: OrchestratorComponent;
  private readonly systemer: SystemerComponent;

  constructor(options: AgentOptions) {
    this.model = options.model;
    this.logger = options.logger;
    this.persistor = options.persistor;
    this.compactor = options.compactor;
    this.orchestrator = options.orchestrator;
    this.systemer = options.systemer;
  }

  /**
   * 归一化本轮 tools 输入。
   */
  private normalizeRunTools(tools: Record<string, Tool>): Record<string, Tool> {
    return tools && typeof tools === "object" ? { ...tools } : {};
  }

  /**
   * 归一化本轮 system messages 输入。
   */
  private normalizeRunSystem(
    system: SystemModelMessage[],
  ): SystemModelMessage[] {
    if (!Array.isArray(system)) return [];
    return system.filter((item) => item && typeof item === "object");
  }

  /**
   * tool-loop 主执行流程。
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    return this.runWithState(input, {
      retryCount: 0,
      errorHandoverAttempts: 0,
      errorForAgent: "",
    });
  }

  /**
   * tool-loop 主执行流程（带重试状态）。
   */
  private async runWithState(
    input: AgentRunInput,
    state: AgentRunState,
  ): Promise<AgentResult> {
    const query = String(input.query || "").trim();
    const contextId = this.persistor.contextId;
    if (!contextId) {
      throw new Error("Agent.run requires persistor.contextId");
    }

    const startTime = Date.now();
    const { retryCount, errorHandoverAttempts, errorForAgent } = state;
    const logger = this.logger;

    let requestId = generateId();
    let runTools: Record<string, Tool> = {};
    let currentBaseSystemMessages: SystemModelMessage[] = [];
    let onStepCallback: (() => Promise<ContextMessageV1[]>) | undefined;
    let baseModelMessages: ModelMessage[] = [];

    try {
      const runContext = await this.orchestrator.compose({
        contextId,
      });
      requestId = String(runContext.requestId || "").trim() || generateId();
      runTools = this.normalizeRunTools(runContext.tools);
      onStepCallback =
        typeof runContext.onStepCallback === "function"
          ? runContext.onStepCallback
          : undefined;
      currentBaseSystemMessages = this.normalizeRunSystem(
        await this.systemer.resolve({
          contextId,
          requestId,
        }),
      );

      // 关键点（中文）：压缩失败不阻断主流程，消息准备继续按原历史进行。
      try {
        await this.compactor.run({
          persistor: this.persistor,
          model: this.model,
          system: currentBaseSystemMessages,
          retryCount,
        });
      } catch {
        // ignore
      }

      baseModelMessages = await this.persistor.prepare({
        query,
        tools: runTools,
        system: currentBaseSystemMessages,
        model: this.model,
        retryCount,
      });

      if (errorForAgent) {
        // 关键点（中文）：把错误作为“新用户补充”交还给 Agent，要求其继续执行而非终止。
        baseModelMessages = [
          ...baseModelMessages,
          {
            role: "user",
            content: this.buildErrorHandoverUserMessage(
              errorForAgent,
              errorHandoverAttempts,
            ),
          },
        ];
      }

      // 关键点（中文）
      // - 在 step 边界尝试合并同 lane 的新增用户消息，保证当前 run 可见最新输入。
      // - 保留 tool-loop 的 in-flight 后缀消息（工具调用链）。
      let lastAppliedBasePrefixLen = baseModelMessages.length;
      const appendMergedUserMessages = (
        messages: ContextMessageV1[],
      ): number => {
        if (!Array.isArray(messages) || messages.length === 0) return 0;
        const toAppend: ModelMessage[] = [];
        for (const m of messages) {
          if (!m || typeof m !== "object") continue;
          if (m.role !== "user") continue;
          const parts = Array.isArray(m.parts) ? m.parts : [];
          const text = parts
            .filter(isTextUIPart)
            .map((p) => String(p.text ?? ""))
            .join("\n")
            .trim();
          if (!text) continue;
          toAppend.push({ role: "user", content: text });
        }
        if (toAppend.length > 0) {
          baseModelMessages = [...baseModelMessages, ...toAppend];
        }
        return toAppend.length;
      };

      const runStreamText = () =>
        streamText({
          model: this.model,
          system: currentBaseSystemMessages,
          prepareStep: async ({ messages }) => {
            const incomingMessages: ModelMessage[] = Array.isArray(messages)
              ? messages
              : [];
            const suffix =
              incomingMessages.length >= lastAppliedBasePrefixLen
                ? incomingMessages.slice(lastAppliedBasePrefixLen)
                : [];
            let outMessages: ModelMessage[] | undefined;
            if (typeof onStepCallback === "function") {
              try {
                const mergedMessages = await onStepCallback();
                const added = appendMergedUserMessages(
                  Array.isArray(mergedMessages) ? mergedMessages : [],
                );
                if (added > 0) {
                  outMessages = [...baseModelMessages, ...suffix];
                  lastAppliedBasePrefixLen = baseModelMessages.length;
                }
              } catch {
                // ignore merge hook failures
              }
            }
            return {
              system: currentBaseSystemMessages,
              ...(Array.isArray(outMessages) ? { messages: outMessages } : {}),
            };
          },
          messages: baseModelMessages,
          tools: runTools,
          providerOptions: this.buildOpenAIResponsesProviderOptions(),
          stopWhen: [stepCountIs(30)],
        });

      const result = runStreamText();

      let finalAssistantUiMessage: ContextMessageV1 | null = null;
      let uiStreamError: unknown | null = null;
      try {
        const md: ContextMetadataV1 = {
          v: 1,
          ts: Date.now(),
          contextId,
          requestId,
          source: "egress",
          kind: "normal",
          extra: { note: "ai_sdk_ui_message" },
        };

        const uiStream = result.toUIMessageStream<ContextMessageV1>({
          sendReasoning: false,
          sendSources: false,
          generateMessageId: () => `a:${contextId}:${generateId()}`,
          messageMetadata: () => md,
          onFinish: (event) => {
            finalAssistantUiMessage = event.responseMessage ?? null;
          },
        });
        for await (const _ of uiStream) {
          // ignore chunks
        }
      } catch (error) {
        uiStreamError = error;
        finalAssistantUiMessage = null;
      }
      if (uiStreamError !== null) {
        throw uiStreamError;
      }

      const duration = Date.now() - startTime;
      await logger.log("info", "Agent execution completed", {
        duration,
      });

      if (!finalAssistantUiMessage) {
        let assistantText = "";
        try {
          assistantText = String((await result.text) ?? "").trim();
        } catch {
          assistantText = "";
        }
        finalAssistantUiMessage = this.buildFallbackAssistantMessage({
          contextId,
          requestId,
          text: assistantText || "Execution completed",
          note: "assistant_message_fallback",
        });
      }
      return {
        success: true,
        assistantMessage: finalAssistantUiMessage,
      };
    } catch (error) {
      const errorMsg = String(error);
      if (
        errorMsg.includes("context_length") ||
        errorMsg.includes("too long") ||
        errorMsg.includes("maximum context") ||
        errorMsg.includes("context window")
      ) {
        await logger.log(
          "warn",
          "Context length exceeded, retry with messages compaction",
          {
            contextId,
            error: errorMsg,
            retryCount,
          },
        );
        if (retryCount >= MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS) {
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
          ...state,
          retryCount: retryCount + 1,
        });
      }
      if (errorHandoverAttempts < MAX_ERROR_HANDOVER_ATTEMPTS) {
        await logger.log(
          "warn",
          "Agent run failed, hand over error back to agent",
          {
            contextId,
            error: errorMsg,
            errorHandoverAttempts,
          },
        );
        return this.runWithState(input, {
          ...state,
          errorHandoverAttempts: errorHandoverAttempts + 1,
          errorForAgent: errorMsg,
        });
      }

      await logger.log("error", "Agent execution failed", {
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
   * 构建 OpenAI Responses providerOptions。
   */
  private buildOpenAIResponsesProviderOptions(): {
    openai: {
      store: boolean;
    };
  } {
    return {
      openai: {
        // 关键点（中文）：Responses 走无状态模式，历史仅由本地 UIMessage 管理。
        store: false,
      },
    };
  }

  /**
   * 构造“错误交接给 Agent”的补充用户消息。
   */
  private buildErrorHandoverUserMessage(
    errorMsg: string,
    handoverAttempt: number,
  ): string {
    const normalizedError = String(errorMsg || "")
      .trim()
      .slice(0, 1200);
    return [
      "上一轮执行出现错误，请不要结束，继续推进当前任务。",
      `错误信息：${normalizedError || "(empty error)"}`,
      "要求：分析错误原因，调整执行步骤，并继续调用需要的工具直到任务完成。",
      `错误交接轮次：${handoverAttempt + 1}`,
    ].join("\n");
  }

  /**
   * 构造 fallback assistant 消息。
   */
  private buildFallbackAssistantMessage(params: {
    contextId: string;
    text: string;
    requestId?: string;
    note: string;
  }): ContextMessageV1 {
    const metadata: Omit<ContextMetadataV1, "v" | "ts"> = {
      contextId: params.contextId,
      requestId: params.requestId,
      extra: { note: params.note },
    };
    const finalText = String(params.text ?? "").trim() || "Execution completed";
    const md: ContextMetadataV1 = {
      v: 1,
      ts: Date.now(),
      ...metadata,
      source: "egress",
      kind: "normal",
    };
    return {
      id: `a:${params.contextId}:${generateId()}`,
      role: "assistant",
      metadata: md,
      parts: [{ type: "text", text: finalText }],
    };
  }

}
