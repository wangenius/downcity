/**
 * Agent：单会话执行器。
 *
 * 关键职责（中文）
 * - 消费上游注入的 system messages。
 * - 执行 tool-loop，并产出 assistant 结果消息。
 * - 在上下文超窗时按策略逐步收紧 compact 参数并重试。
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
import type {
  AgentSystemConfig,
  ResolvedAgentSystemConfig,
} from "@main/types/AgentSystem.js";
import type { Logger } from "@utils/logger/Logger.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@main/types/ContextMessage.js";
import type { ContextPersistor } from "./ContextPersistor.js";

const MAX_ERROR_HANDOVER_ATTEMPTS = 2;
const MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS = 3;

type AgentRunState = {
  retryAttempts: number;
  errorHandoverAttempts: number;
  errorForAgent: string;
};

type AgentOptions = {
  model: LanguageModel;
  logger: Logger;
  persistor: ContextPersistor;
};

export class Agent {
  private readonly model: LanguageModel;
  private readonly logger: Logger;
  private readonly persistor: ContextPersistor;
  /**
   * Agent system 配置（可由调用方覆盖）。
   *
   * 关键点（中文）
   * - 默认按 chat 会话模式运行。
   * - task 等非聊天场景可通过 `setSystem` 覆盖默认行为。
   */
  private system: ResolvedAgentSystemConfig = Agent.createDefaultSystemConfig();

  constructor(options: AgentOptions) {
    this.model = options.model;
    this.logger = options.logger;
    this.persistor = options.persistor;
  }

  /**
   * 创建默认 system 配置。
   */
  private static createDefaultSystemConfig(): ResolvedAgentSystemConfig {
    return {
      mode: "chat",
      disableServiceSystems: [],
    };
  }

  /**
   * 归一化外部传入的 system 配置。
   */
  private normalizeSystemConfig(
    input: AgentSystemConfig,
  ): ResolvedAgentSystemConfig {
    const mode = input.mode === "task" ? "task" : "chat";
    const replaceDefaultCorePrompt = String(
      input.replaceDefaultCorePrompt || "",
    ).trim();
    const disableServiceSystems = Array.isArray(input.disableServiceSystems)
      ? [
          ...new Set(
            input.disableServiceSystems
              .map((item) => String(item || "").trim())
              .filter(Boolean),
          ),
        ]
      : [];

    return {
      mode,
      ...(replaceDefaultCorePrompt ? { replaceDefaultCorePrompt } : {}),
      disableServiceSystems,
    };
  }

  /**
   * 读取当前 Agent system 配置。
   */
  getSystem(): ResolvedAgentSystemConfig {
    return { ...this.system };
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
   *
   * 算法步骤（中文）
   * - 使用调用方传入的 system/tools 执行模型调用。
   * - 基于 persistor 准备本轮 messages。
   * - 执行模型调用；若超窗则有限重试并失败兜底。
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    return this.runWithState(input, {
      retryAttempts: 0,
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
    const { query, onStepCallback } = input;
    const contextId = this.persistor.contextId;
    if (!contextId) {
      throw new Error("Agent.run requires persistor.contextId");
    }
    const startTime = Date.now();
    const requestId = String(input.requestId || "").trim() || generateId();
    const { retryAttempts, errorHandoverAttempts, errorForAgent } = state;
    const logger = this.logger;
    const runTools = this.normalizeRunTools(input.tools);
    let currentBaseSystemMessages = this.normalizeRunSystem(input.system);
    let baseModelMessages: ModelMessage[] = [];

    try {
      baseModelMessages = await this.persistor.prepareRunMessages({
        contextId,
        query,
        tools: runTools,
        system: currentBaseSystemMessages,
        model: this.model,
        retryAttempts,
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

      // phase 2（中文）：进入 tool-loop。
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
            const stepOverrides: {
              system?: Array<SystemModelMessage>;
            } = {
              system: currentBaseSystemMessages,
            };
            return {
              ...stepOverrides,
              ...(Array.isArray(outMessages) ? { messages: outMessages } : {}),
            };
          },
          messages: baseModelMessages,
          tools: runTools,
          providerOptions: this.buildOpenAIResponsesProviderOptions(),
          stopWhen: [stepCountIs(30)],
        });

      const result = runStreamText();

      // phase 3（中文）：把 stream 结果固化为最终 assistant UIMessage。
      // 关键点（中文）：用 ai-sdk v6 的 UIMessage 流来生成最终 assistant UIMessage（包含 tool parts），避免手工拼装。
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
          // 关键点（中文）：metadata 通过 ai-sdk 的 UIMessage 生成管线注入，避免我们手工改写最终 message。
          messageMetadata: () => md,
          onFinish: (event) => {
            finalAssistantUiMessage = event.responseMessage ?? null;
          },
        });
        // 关键点（中文）：必须消费完整 UIMessage stream，onFinish 才会触发并产出 responseMessage。
        for await (const _ of uiStream) {
          // ignore chunks
        }
      } catch (error) {
        uiStreamError = error;
        finalAssistantUiMessage = null;
      }
      if (uiStreamError !== null) {
        // 关键点（中文）：流式阶段出现异常必须上抛，统一走失败返回，避免“看似成功但已中断”。
        throw uiStreamError;
      }

      // phase 4（中文）：统计结果并返回标准 AgentResult。
      const duration = Date.now() - startTime;
      await logger.log("info", "Agent execution completed", {
        duration,
      });
      // 关键点（中文）：对话消息由 ContextManager 管理并写入 messages（messages.jsonl）

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
      // 超窗重试策略（中文）：识别 context window 类错误并触发 compact 递进重试。
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
            retryAttempts,
          },
        );
        if (retryAttempts >= MAX_CONTEXT_LENGTH_RETRY_ATTEMPTS) {
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
          retryAttempts: retryAttempts + 1,
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
   *
   * 关键点（中文）
   * - 明确要求 Agent 基于错误继续推进，而不是停止在报错结论。
   * - 截断错误文本，避免把超长堆栈直接塞回上下文。
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
   *
   * 关键点（中文）
   * - 仅在 UIMessage 生成失败/异常时兜底使用
   * - metadata 尽量与正常 assistant 消息保持一致
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

  /**
   * 设置当前 Agent 的 system 配置。
   *
   * 关键点（中文）
   * - 由上游调用方（如 task runner）按场景覆盖默认 chat system。
   */
  setSystem(config: AgentSystemConfig): void {
    this.system = this.normalizeSystemConfig(config);
  }
}
