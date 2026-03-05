/**
 * ContextAgentRunner：单会话 Agent 执行器。
 *
 * 关键职责（中文）
 * - 组装 system prompt（运行时上下文 + 静态模板 + service system）。
 * - 执行 tool-loop，并把 assistant/tool 调用结果回写 context 消息。
 * - 在上下文超窗时按策略逐步收紧 compact 参数并重试。
 */

import {
  isTextUIPart,
  streamText,
  stepCountIs,
  Tool,
  type LanguageModel,
  type ModelMessage,
  type SystemModelMessage,
} from "ai";
import { generateId } from "@utils/Id.js";
import {
  buildContextSystemPrompt,
  DEFAULT_SHIP_PROMPTS,
  transformPromptsIntoSystemMessages,
} from "@core/prompts/System.js";
import type { AgentRunInput, AgentResult } from "@core/types/Agent.js";
import type {
  AgentSystemConfig,
  ResolvedAgentSystemConfig,
} from "@core/types/AgentSystem.js";
import type { Logger } from "@utils/logger/Logger.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@core/types/ContextMessage.js";
import type { ContextStore } from "./ContextStore.js";
import { shellTools } from "@core/shell/Tool.js";
import { compactContextMessageIfNeeded } from "./Compact.js";

export type ContextAgentDependencies = {
  model: LanguageModel;
  logger: Logger;
  projectRoot: string;
  withRequestContext?: <T>(
    ctx: { contextId?: string; requestId?: string },
    fn: () => T,
  ) => T;
  getContextStore: (contextId: string) => ContextStore;
  getStaticSystemPrompts: () => string[];
  getServiceSystemPrompts: (params?: {
    disabledServiceNames?: string[];
  }) => Promise<string[]>;
  compact?: {
    keepLastMessages?: number;
    maxInputTokensApprox?: number;
    archiveOnCompact?: boolean;
  };
};

export class ContextAgent {
  private readonly deps: ContextAgentDependencies;
  private readonly model: LanguageModel;

  private tools: Record<string, Tool> = {};
  /**
   * Agent system 配置（可由调用方覆盖）。
   *
   * 关键点（中文）
   * - 默认按 chat 会话模式运行。
   * - task 等非聊天场景可通过 `setSystem` 覆盖默认行为。
   */
  private system: ResolvedAgentSystemConfig =
    ContextAgent.createDefaultSystemConfig();
  /**
   * contextId 绑定检查。
   *
   * 关键点（中文）
   * - 运行时策略是"一个 contextId 一个 Agent 实例"（由 ContextManager 保证）
   * - 本实例一旦首次 run 绑定到某个 contextId，后续必须一致，避免上下文串线
   */
  private boundContextId: string | null = null;

  constructor(deps: ContextAgentDependencies) {
    this.deps = deps;
    this.model = deps.model;
    this.tools = { ...shellTools };
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
      ? [...new Set(
          input.disableServiceSystems
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        )]
      : [];

    return {
      mode,
      ...(replaceDefaultCorePrompt ? { replaceDefaultCorePrompt } : {}),
      disableServiceSystems,
    };
  }

  /**
   * 获取运行时 logger。
   */
  getLogger(): Logger {
    return this.deps.logger;
  }

  /**
   * run：对外统一入口。
   *
   * 流程（中文）
   * 1) 记录 requestId 与日志
   * 2) 进入 tool-loop 主流程
   */
  async run(input: AgentRunInput): Promise<AgentResult> {
    const { query, contextId, onStepCallback } = input;
    const startTime = Date.now();
    const requestId = generateId();
    const logger = this.getLogger();

    await logger.log("info", "Agent request started", {
      requestId,
      contextId,
      instructionsPreview: query?.slice(0, 200),
      rootPath: this.deps.projectRoot,
    });
    return this.runWithToolLoopAgent(query, startTime, contextId, {
      requestId,
      onStepCallback,
    });
  }

  /**
   * 绑定 contextId（单实例单会话约束）。
   */
  private bindContextId(contextId: string): string {
    const key = String(contextId || "").trim();
    if (!key) throw new Error("Agent.run requires a non-empty contextId");
    if (this.boundContextId && this.boundContextId !== key) {
      // 关键点（中文）：一个 Agent 实例只允许服务一个 contextId，避免上下文串线。
      throw new Error(
        `Agent is already bound to contextId=${this.boundContextId}, got contextId=${key}`,
      );
    }
    this.boundContextId = key;
    return key;
  }

  /**
   * tool-loop 主执行流程。
   *
   * 算法步骤（中文）
   * - 绑定 contextId，防止一个实例跨会话串线。
   * - 读取/补齐用户消息到 context store（防止入口未写入）。
   * - 收集 service system 文本，和运行时/静态 system 一起拼装。
   * - 执行模型调用；若超窗则按 compact policy 递进重试。
   */
  private async runWithToolLoopAgent(
    userText: string,
    startTime: number,
    contextId: string,
    opts?: {
      retryAttempts?: number;
      requestId?: string;
      onStepCallback?: AgentRunInput["onStepCallback"];
    },
  ): Promise<AgentResult> {
    let contextStore: ContextStore | null = null;
    const retryAttempts = opts?.retryAttempts ?? 0;
    const requestId = opts?.requestId || "";
    const onStepCallback = opts?.onStepCallback;
    const logger = this.getLogger();

    try {
      this.bindContextId(contextId);

      // phase 0（中文）：装配 context store 与 runtime/system prompt 基础上下文。
      contextStore = this.deps.getContextStore(contextId);
      const activeContextStore = contextStore;

      const runtimeSystemMessages = this.buildRuntimeSystemMessages({
        projectRoot: this.deps.projectRoot,
        contextId,
        requestId,
      });

      const staticSystemMessages = await transformPromptsIntoSystemMessages(
        this.resolveStaticSystemPrompts({
          systems: this.deps.getStaticSystemPrompts(),
        }),
        {
          projectPath: this.deps.projectRoot,
        },
      );
      let serviceSystemMessages = await transformPromptsIntoSystemMessages(
        await this.deps.getServiceSystemPrompts({
          disabledServiceNames: this.system.disableServiceSystems,
        }),
        {
          projectPath: this.deps.projectRoot,
        },
      );
      let currentBaseSystemMessages: SystemModelMessage[] = [
        ...runtimeSystemMessages,
        ...staticSystemMessages,
        ...serviceSystemMessages,
      ];

      const compactPolicy = this.resolveCompactPolicy(retryAttempts);
      let compacted = false;
      try {
        const compactResult = await compactContextMessageIfNeeded(
          {
            rootPath: activeContextStore.rootPath,
            contextId: activeContextStore.contextId,
            withWriteLock: (fn) => activeContextStore.withWriteLock(fn),
            loadAll: () => activeContextStore.loadAll(),
            createSummaryMessage: ({ text, sourceRange }) =>
              activeContextStore.createAssistantTextMessage({
                text,
                metadata: {
                  contextId: activeContextStore.contextId,
                },
                kind: "summary",
                source: "compact",
                ...(sourceRange ? { sourceRange } : {}),
              }),
            getArchiveDirPath: () => activeContextStore.getArchiveDirPath(),
            getMessagesFilePath: () => activeContextStore.getMessagesFilePath(),
            readMetaUnsafe: () => activeContextStore.readMetaUnsafe(),
            writeMetaUnsafe: (next) => activeContextStore.writeMetaUnsafe(next),
          },
          {
            model: this.model,
            system: currentBaseSystemMessages,
            keepLastMessages: compactPolicy.keepLastMessages,
            maxInputTokensApprox: compactPolicy.maxInputTokensApprox,
            archiveOnCompact: compactPolicy.archiveOnCompact,
          },
        );
        compacted = Boolean(compactResult.compacted);
      } catch {
        // ignore compact failure; fallback to un-compacted context messages
      }
      if (compacted) {
        // 关键点（中文）：compact 后重新收集 service system，保证提示词与最新状态一致。
        serviceSystemMessages = await transformPromptsIntoSystemMessages(
          await this.deps.getServiceSystemPrompts({
            disabledServiceNames: this.system.disableServiceSystems,
          }),
          {
            projectPath: this.deps.projectRoot,
          },
        );
        currentBaseSystemMessages = [
          ...runtimeSystemMessages,
          ...staticSystemMessages,
          ...serviceSystemMessages,
        ];
      }

      let baseModelMessages: ModelMessage[] =
        await activeContextStore.toModelMessages({
          tools: this.tools,
        });
      if (!Array.isArray(baseModelMessages) || baseModelMessages.length === 0) {
        baseModelMessages = [{ role: "user", content: userText }];
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
          tools: this.tools,
          providerOptions: this.buildOpenAIResponsesProviderOptions(),
          stopWhen: [stepCountIs(30)],
        });

      const result = this.deps.withRequestContext
        ? await this.deps.withRequestContext({ contextId, requestId }, runStreamText)
        : runStreamText();

      // phase 3（中文）：把 stream 结果固化为最终 assistant UIMessage。
      // 关键点（中文）：用 ai-sdk v6 的 UIMessage 流来生成最终 assistant UIMessage（包含 tool parts），避免手工拼装。
      let finalAssistantUiMessage: ContextMessageV1 | null = null;
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
      } catch {
        finalAssistantUiMessage = null;
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
          contextStore,
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
        if (retryAttempts >= 3) {
          return {
            success: false,
            assistantMessage: this.buildFallbackAssistantMessage({
              contextId,
              requestId,
              contextStore,
              text: "Context length exceeded and retries failed. Please resend your question (or tune context.messages.* compaction settings).",
              note: "context_length_exceeded",
            }),
          };
        }

        return this.runWithToolLoopAgent(userText, startTime, contextId, {
          retryAttempts: retryAttempts + 1,
          requestId,
          onStepCallback,
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
          contextStore,
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
   * 构建运行时 system message。
   *
   * 关键点（中文）
   * - 注入运行所需的最小上下文：projectRoot/contextId/requestId。
   */
  private buildRuntimeSystemMessages(input: {
    projectRoot: string;
    contextId: string;
    requestId: string;
  }): SystemModelMessage[] {
    return [
      {
        role: "system",
        content: buildContextSystemPrompt({
          projectRoot: input.projectRoot,
          contextId: input.contextId,
          requestId: input.requestId,
          mode: this.system.mode,
        }),
      },
    ];
  }

  /**
   * 解析静态 system prompts。
   *
   * 关键点（中文）
   * - task 执行上下文替换默认 core prompt（`DEFAULT_SHIP_PROMPTS`）为 task 专用提示词。
   * - PROFILE.md / SOUL.md / USER.md 等其他静态系统提示保持不变。
   */
  private resolveStaticSystemPrompts(input: {
    systems: string[];
  }): string[] {
    const base = Array.isArray(input.systems) ? [...input.systems] : [];
    const replacement = String(this.system.replaceDefaultCorePrompt || "").trim();
    if (!replacement) return base;

    const filtered = base.filter((item) => item !== DEFAULT_SHIP_PROMPTS);
    return [...filtered, replacement];
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
    contextStore?: ContextStore | null;
    note: string;
  }): ContextMessageV1 {
    const metadata: Omit<ContextMetadataV1, "v" | "ts"> = {
      contextId: params.contextId,
      requestId: params.requestId,
      extra: { note: params.note },
    };
    const finalText = String(params.text ?? "").trim() || "Execution completed";
    const store = params.contextStore || null;
    if (store) {
      return store.createAssistantTextMessage({
        text: finalText,
        metadata,
        kind: "normal",
        source: "egress",
      });
    }
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
   * 计算 compact 重试策略。
   *
   * 算法说明（中文）
   * - retry 次数越高，keepLastMessages/maxInputTokensApprox 越小（指数收缩）。
   * - 目标是在不直接失败的前提下，尽量保留可用上下文。
   */
  private resolveCompactPolicy(retryAttempts: number): {
    keepLastMessages: number;
    maxInputTokensApprox: number;
    archiveOnCompact: boolean;
  } {
    const contextMessagesConfig = this.deps.compact;

    const baseKeepLastMessages =
      typeof contextMessagesConfig?.keepLastMessages === "number"
        ? Math.max(
            6,
            Math.min(5000, Math.floor(contextMessagesConfig.keepLastMessages)),
          )
        : 30;
    const baseMaxInputTokensApprox =
      typeof contextMessagesConfig?.maxInputTokensApprox === "number"
        ? Math.max(
            2000,
            Math.min(
              200_000,
              Math.floor(contextMessagesConfig.maxInputTokensApprox),
            ),
          )
        : 128000;

    // 关键点（中文）：当 provider 报错超窗时，会进入 retry；此时需要更激进的 compact。
    const retryFactor = Math.max(1, Math.pow(2, retryAttempts));
    const keepLastMessages = Math.max(
      6,
      Math.floor(baseKeepLastMessages / retryFactor),
    );
    const maxInputTokensApprox = Math.max(
      2000,
      Math.floor(baseMaxInputTokensApprox / retryFactor),
    );
    const archiveOnCompact =
      contextMessagesConfig?.archiveOnCompact === undefined
        ? true
        : Boolean(contextMessagesConfig.archiveOnCompact);

    return {
      keepLastMessages,
      maxInputTokensApprox,
      archiveOnCompact,
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

  /**
   * 重置为默认 chat system 配置。
   */
  resetSystem(): void {
    this.system = ContextAgent.createDefaultSystemConfig();
  }
}
