/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 统一收口消息落盘、session 级模型配置、prompt/subscribe/fork 等高层 API。
 * - 内部继续复用 `Executor` / `JsonlSessionHistoryStore` / Composer 体系。
 */

import { nanoid } from "nanoid";
import type { Tool } from "ai";
import { Executor } from "@executor/Executor.js";
import { JsonlSessionHistoryComposer } from "@executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionHistoryStore } from "@/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import { extractTextFromUiMessage } from "@/executor/messages/UIMessageTransformer.js";
import type {
  AgentSession,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSystemBlock,
  AgentSessionSystemSnapshot,
} from "@/types/agent/AgentTypes.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import {
  buildSessionSystemBlocks,
  SessionSystemBuilder,
} from "@/session/SessionSystemBuilder.js";
import {
  buildSessionHistoryPage,
  buildSessionInfo,
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "@/session/index.js";
import {
  getSdkAgentSessionArchiveDirPath,
  getSdkAgentSessionDirPath,
  getSdkAgentSessionInflightPath,
} from "@/session/index.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";
import {
  mapAgentEventToSessionEvent,
  mapUiMessageChunkToAgentEvent,
} from "@/session/SessionEventMapper.js";
import {
  persistSdkAssistantResult,
  touchSessionMetadata,
} from "@/session/index.js";
import { createRuntimeSessionPort } from "@/session/index.js";
import { drainDeferredPersistedUserMessages } from "@executor/SessionRunScope.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type { SessionUserMessageV1 } from "@/executor/types/SessionMessages.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionPromptRuntime } from "@/session/runtime/SessionPromptRuntime.js";
import {
  inferAgentModelLabel,
  normalizeAgentModel,
} from "@/model/CityModelAdapter.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";

type SessionOptions = {
  /**
   * 当前 agent 稳定标识。
   */
  agentId: string;

  /**
   * 当前项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 当前 agent 默认工具集合。
   */
  tools: Record<string, Tool>;

  /**
   * 统一日志器。
   */
  logger: {
    info(message: string, details?: Record<string, unknown>): void;
    warn(message: string, details?: Record<string, unknown>): void;
  };

  /**
   * 读取当前 SDK 调用方传入的 instruction system blocks。
   */
  getInstructionSystemBlocks: () => AgentSessionSystemBlock[];

  /**
   * 读取当前 agent 显式注入的受托管 plugin system blocks。
   */
  getManagedPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前 agent 显式注册 plugin 的 system blocks。
   */
  getPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 在执行前确保当前 session 已完成宿主侧默认配置。
   *
   * 关键点（中文）
   * - 这里通常由 `Agent` 注入，用于补齐默认 model 等一次性装配。
   * - 所有执行入口都应通过这里兜底，避免只在 SDK `agent.createSession()` / `agent.getSession()` 链路上做配置。
   */
  ensureConfigured?: (session: Session) => Promise<void>;
};

/**
 * SDK 本地 Session。
 */
export class Session implements AgentSession {
  readonly id: string;
  readonly agentId: string;

  private readonly projectRoot: string;
  private readonly tools: Record<string, Tool>;
  private readonly logger: SessionOptions["logger"];
  private readonly getInstructionSystemBlocks: SessionOptions["getInstructionSystemBlocks"];
  private readonly getManagedPluginSystemBlocks: SessionOptions["getManagedPluginSystemBlocks"];
  private readonly getPluginSystemBlocks: SessionOptions["getPluginSystemBlocks"];
  private readonly ensureConfiguredHook?: SessionOptions["ensureConfigured"];
  private readonly historyStore: JsonlSessionHistoryStore;
  private readonly historyComposer: JsonlSessionHistoryComposer;
  private readonly executor: Executor;
  private readonly eventHub = new SessionEventHub();
  private readonly promptRuntime: SessionPromptRuntime;
  private sessionConfig: AgentSessionConfigSnapshot = {};
  private createdAt = Date.now();
  private timezone = resolveSystemTimezone();
  private initializePromise: Promise<this> | null = null;
  private ensureConfiguredPromise: Promise<void> | null = null;
  private runtimePort: SessionPort | null = null;

  constructor(options: SessionOptions) {
    this.id = String(options.sessionId || "").trim();
    this.agentId = String(options.agentId || "").trim();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.tools = options.tools;
    this.logger = options.logger;
    this.getInstructionSystemBlocks = options.getInstructionSystemBlocks;
    this.getManagedPluginSystemBlocks = options.getManagedPluginSystemBlocks;
    this.getPluginSystemBlocks = options.getPluginSystemBlocks;
    this.ensureConfiguredHook = options.ensureConfigured;
    if (!this.id) {
      throw new Error("Session requires a non-empty sessionId");
    }
    if (!this.agentId) {
      throw new Error("Session requires a non-empty agentId");
    }
    if (!this.projectRoot) {
      throw new Error("Session requires a non-empty projectRoot");
    }

    const sessionDirPath = getSdkAgentSessionDirPath(
      this.projectRoot,
      this.agentId,
      this.id,
    );
    const messagesDirPath = `${sessionDirPath}/messages`;
    this.historyStore = new JsonlSessionHistoryStore({
      rootPath: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      paths: {
        sessionDirPath,
        messagesDirPath,
        messagesFilePath: `${messagesDirPath}/messages.jsonl`,
        metaFilePath: `${messagesDirPath}/meta.json`,
        archiveDirPath: getSdkAgentSessionArchiveDirPath(
          this.projectRoot,
          this.agentId,
          this.id,
        ),
        inflightFilePath: getSdkAgentSessionInflightPath(
          this.projectRoot,
          this.agentId,
          this.id,
        ),
      },
    });
    this.historyComposer = new JsonlSessionHistoryComposer({
      store: this.historyStore,
    });

    this.executor = new Executor({
      sessionId: this.id,
      historyStore: this.historyStore,
      historyComposer: this.historyComposer,
      getModel: () => this.sessionConfig.model,
      logger: this.logger as never,
      systemComposer: new SessionSystemBuilder({
        agentId: this.agentId,
        projectRoot: this.projectRoot,
        getSessionCreatedAt: () => this.createdAt,
        getSessionTimezone: () => this.timezone,
        getInstructionSystemBlocks: this.getInstructionSystemBlocks,
        getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
        getPluginSystemBlocks: this.getPluginSystemBlocks,
      }),
      getTools: () => this.tools,
    });
    this.promptRuntime = new SessionPromptRuntime({
      sessionId: this.id,
      publish: (event) => {
        this.eventHub.publish(event);
      },
      createAndPersistUserMessage: async (input) => {
        return await this.createAndPersistUserPromptMessage(input);
      },
      executeTurn: async ({ turnId, promptInput, onStepMerge }) => {
        return await this.executePromptTurn({
          turnId,
          promptInput,
          onStepMerge,
        });
      },
    });
  }

  /**
   * 初始化当前 session 的 meta 信息与内存配置。
   */
  async initialize(): Promise<this> {
    if (this.initializePromise) {
      return await this.initializePromise;
    }
    this.initializePromise = (async () => {
      const metadata = await readSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
      });
      const createdAt =
        typeof metadata.createdAt === "number" ? metadata.createdAt : Date.now();
      const timezone =
        typeof metadata.timezone === "string" && metadata.timezone.trim()
          ? metadata.timezone.trim()
          : resolveSystemTimezone();
      await writeSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
        meta: {
          ...metadata,
          agentId: this.agentId,
          createdAt,
          timezone,
        },
      });
      this.createdAt = createdAt;
      this.timezone = timezone;
      this.sessionConfig = {
        ...(metadata.modelLabel
          ? { modelLabel: metadata.modelLabel }
          : {}),
      };
      return this;
    })();
    return await this.initializePromise;
  }

  /**
   * 读取当前 session 配置快照。
   */
  get config(): AgentSessionConfigSnapshot {
    return {
      ...this.sessionConfig,
    };
  }

  /**
   * 写入当前 session 默认配置。
   */
  async set(input: AgentSessionSetInput): Promise<void> {
    if (input.model) {
      this.sessionConfig.model = normalizeAgentModel(input.model);
      this.sessionConfig.modelLabel = inferAgentModelLabel(input.model);
      this.executor.clearExecutor();
    }
    await patchSessionModelLabel({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      model: this.sessionConfig.model,
    });
  }

  /**
   * 追加一条新的 Session prompt。
   *
   * 关键点（中文）
   * - 这是 Session actor 模型下唯一的输入入口。
   * - 首条输入、运行中补充输入、排到下一轮的输入，调用方式完全一致。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("session.prompt requires a non-empty query");
    }
    await this.ensureRunnable();
    return await this.promptRuntime.prompt({
      query,
    });
  }

  /**
   * 订阅当前 Session 的未来事件。
   *
   * 关键点（中文）
   * - 只广播订阅之后产生的事件。
   * - 不做历史回放；历史仍通过 `history()` 读取。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    return this.eventHub.subscribe(subscriber);
  }

  /**
   * 追加一条 user 文本消息。
   */
  async appendUserMessage(input: {
    /**
     * 需要写入的用户文本。
     */
    text: string;
  }): Promise<void> {
    await this.executor.appendUserMessage({
      text: String(input.text || "").trim(),
    });
    await this.ensureTitleFromHistory({ generate: true });
    await this.touchMetadata();
  }

  /**
   * 追加一条 assistant 文本消息。
   */
  async appendAssistantMessage(input: {
    /**
     * 需要写入的 assistant 文本。
     */
    text: string;
  }): Promise<void> {
    await this.executor.appendAssistantMessage({
      fallbackText: String(input.text || "").trim(),
    });
    await this.touchMetadata();
  }

  /**
   * 读取当前 session 详情。
   */
  async getInfo(): Promise<AgentSessionInfo> {
    const [metadata, messages] = await Promise.all([
      readSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
      }),
      this.historyStore.list(),
    ]);
    const metadataWithTitle = metadata.title
      ? metadata
      : await ensureSessionTitle({
          projectRoot: this.projectRoot,
          agentId: this.agentId,
          sessionId: this.id,
          messages,
        });
    return buildSessionInfo({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      metadata: metadataWithTitle,
      messages,
      executing: this.isExecuting(),
    });
  }

  /**
   * 读取当前 session 历史分页。
   */
  async history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage> {
    const [session, messages] = await Promise.all([
      this.getInfo(),
      this.historyStore.list(),
    ]);
    return buildSessionHistoryPage({
      session,
      messages,
      input,
    });
  }

  /**
   * 读取当前 session 生效的 system prompt 文本集合。
   *
   * 关键点（中文）
   * - 返回内容与实际 run 时使用的 SDK system composer 同源。
   * - 包含 instruction/core、受托管 plugin system、显式注册 plugin system 与 session 上下文。
   * - 返回结构化快照，不把 system prompt 写入会话历史。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    const blocks = await buildSessionSystemBlocks({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: this.id,
      createdAt: this.createdAt,
      timezone: this.timezone,
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: this.getPluginSystemBlocks,
    });
    return {
      sessionId: this.id,
      session: {
        agentId: this.agentId,
        sessionId: this.id,
        projectRoot: this.projectRoot,
        createdAt: new Date(this.createdAt).toISOString(),
        timezone: this.timezone,
      },
      blocks,
    };
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.promptRuntime.isActive() || this.executor.isExecuting();
  }

  /**
   * 清理当前 session 的执行器缓存。
   */
  clearExecutor(): void {
    this.executor.clearExecutor();
  }

  /**
   * 从当前 session 创建一个分叉会话。
   */
  async fork(input?: AgentSessionForkInput | string): Promise<Session> {
    const messageId =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    const messages = await this.historyStore.list();
    const forkMessages =
      !messageId
        ? messages
        : (() => {
            const targetIndex = messages.findIndex(
              (message) => String(message.id || "").trim() === messageId,
            );
            if (targetIndex < 0) {
              throw new Error(
                `Cannot fork session "${this.id}": messageId "${messageId}" not found.`,
              );
            }
            return messages.slice(0, targetIndex + 1);
          })();

    const forked = new Session({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: `fork-${Date.now()}-${nanoid(8)}`,
      tools: this.tools,
      logger: this.logger,
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: this.getPluginSystemBlocks,
    });
    await forked.initialize();
    if (this.sessionConfig.model) {
      await forked.set({
        model: this.sessionConfig.model,
      });
    }
    for (const message of forkMessages) {
      await forked.historyStore.append(message);
    }
    await forked.ensureTitleFromHistory({ generate: true });
    await forked.touchMetadata();
    return forked;
  }

  /**
   * 返回供受托管 plugin 使用的 session 端口。
   */
  getRuntimePort(): SessionPort {
    if (this.runtimePort) return this.runtimePort;
    this.runtimePort = createRuntimeSessionPort({
      sessionId: this.id,
      getExecutor: () => this.executor.getExecutor(),
      prompt: async (input) => {
        return await this.prompt(input);
      },
      subscribe: (subscriber) => {
        return this.subscribe(subscriber);
      },
      clearExecutor: () => {
        this.executor.clearExecutor();
      },
      afterSessionUpdatedAsync: async () => {
        await this.executor.afterSessionUpdatedAsync();
      },
      appendUserMessage: async (messageParams) => {
        await this.executor.appendUserMessage(messageParams);
        await this.ensureTitleFromHistory({ generate: true });
        await this.touchMetadata();
      },
      appendAssistantMessage: async (messageParams) => {
        await this.executor.appendAssistantMessage(messageParams);
      },
      isExecuting: () => this.isExecuting(),
      historyStore: this.historyStore,
      ensureReadyForExecution: async () => {
        await this.ensureReadyForExecution();
      },
      touchMetadata: async () => {
        await this.touchMetadata();
      },
    });
    return this.runtimePort;
  }

  /**
   * 在执行前确保 session 已完成初始化与宿主装配。
   */
  async ensureReadyForExecution(): Promise<void> {
    await this.initialize();
    if (this.ensureConfiguredPromise) {
      await this.ensureConfiguredPromise;
      return;
    }
    this.ensureConfiguredPromise = (async () => {
      if (!this.ensureConfiguredHook) return;
      await this.ensureConfiguredHook(this);
    })();
    try {
      await this.ensureConfiguredPromise;
    } catch (error) {
      this.ensureConfiguredPromise = null;
      throw error;
    }
  }

  private async ensureRunnable(): Promise<void> {
    await this.ensureReadyForExecution();
    if (!this.sessionConfig.model) {
      throw new Error(
        `Session "${this.id}" requires a configured model. Pass model to new Agent({ model }) or call session.set({ model }) first.`,
      );
    }
  }

  private async touchMetadata(): Promise<void> {
    await touchSessionMetadata({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      sessionConfig: this.sessionConfig,
    });
  }

  private async ensureTitleFromHistory(input?: {
    /**
     * 是否允许调用模型生成标题。
     */
    generate?: boolean;
  }): Promise<void> {
    const messages = await this.historyStore.list();
    const beforeMetadata = await readSessionMetadata({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
    });
    const beforeTitle = String(beforeMetadata.title || "").trim();
    const nextMetadata = await ensureSessionTitle({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      messages,
      ...(input?.generate ? { model: this.sessionConfig.model } : {}),
      generate: input?.generate === true,
    });
    const nextTitle = String(nextMetadata.title || "").trim();
    if (!nextTitle || nextTitle === beforeTitle) return;
    this.eventHub.publish({
      type: "session-title",
      sessionId: this.id,
      title: nextTitle,
    });
  }

  private async persistAssistantResult(
    assistantMessage: SessionMessageV1,
  ): Promise<void> {
    await persistSdkAssistantResult({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      sessionConfig: this.sessionConfig,
      executor: this.executor,
      assistantMessage,
    });
  }

  private async createAndPersistUserPromptMessage(
    input: AgentSessionPromptInput,
  ): Promise<SessionUserMessageV1> {
    const message = this.historyStore.userText({
      text: String(input.query || "").trim(),
      metadata: {
        sessionId: this.id,
      },
    }) as SessionUserMessageV1;
    await this.executor.appendUserMessage({
      message,
    });
    await this.ensureTitleFromHistory({ generate: true });
    await this.touchMetadata();
    return message;
  }

  private async executePromptTurn(input: {
    turnId: string;
    promptInput: AgentSessionPromptInput;
    onStepMerge: () => Promise<SessionUserMessageV1[]>;
  }): Promise<{
    text: string;
    success: boolean;
    assistantMessage: SessionMessageV1;
    error?: string;
  }> {
    const toolNameByCallId = new Map<string, string>();
    const result = await this.executor.run({
      query: input.promptInput.query,
      onStepCallback: input.onStepMerge,
      onAssistantStepCallback: async (step) => {
        this.eventHub.publish({
          type: "assistant-step",
          turnId: input.turnId,
          text: step.text,
          stepIndex: step.stepIndex,
          ...(step.visibility ? { visibility: step.visibility } : {}),
        });
      },
      onUiMessageChunkCallback: async (chunk) => {
        if (chunk.type === "tool-input-start") {
          toolNameByCallId.set(chunk.toolCallId, chunk.toolName);
          return;
        }
        const event = mapUiMessageChunkToAgentEvent(chunk);
        if (!event) return;
        const resolvedEvent =
          (
            event.type === "tool-result" ||
            event.type === "tool-error"
          ) &&
          event.toolName === "unknown"
            ? {
                ...event,
                toolName:
                  toolNameByCallId.get(event.toolCallId) || event.toolName,
              }
            : event;
        if (
          resolvedEvent.type === "tool-call" ||
          resolvedEvent.type === "tool-error"
        ) {
          toolNameByCallId.set(
            resolvedEvent.toolCallId,
            resolvedEvent.toolName,
          );
        }
        const sessionEvent = mapAgentEventToSessionEvent({
          event: resolvedEvent,
          turnId: input.turnId,
        });
        if (sessionEvent) {
          this.eventHub.publish(sessionEvent);
        }
      },
    });
    await this.persistAssistantResult(result.assistantMessage);
    await this.persistDeferredUserMessages();
    return {
      text: extractTextFromUiMessage(result.assistantMessage),
      success: result.success,
      assistantMessage: result.assistantMessage,
      ...(result.error ? { error: result.error } : {}),
    };
  }

  private async persistDeferredUserMessages(): Promise<void> {
    const deferredMessages = drainDeferredPersistedUserMessages(this.id);
    for (const message of deferredMessages) {
      await this.executor.appendUserMessage({
        message,
      });
    }
    if (deferredMessages.length > 0) {
      await this.touchMetadata();
    }
  }
}
