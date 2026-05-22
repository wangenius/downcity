/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 统一收口消息落盘、session 级模型配置、run/stream/fork 等高层 API。
 * - 内部继续复用 `Executor` / `JsonlSessionHistoryStore` / Composer 体系。
 */

import { nanoid } from "nanoid";
import type { LanguageModel, Tool } from "ai";
import { Executor } from "@session/Executor.js";
import { JsonlSessionHistoryComposer } from "@session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionHistoryStore } from "@/session/store/history/jsonl/JsonlSessionHistoryStore.js";
import { extractTextFromUiMessage } from "@/service/builtins/chat/runtime/UIMessageTransformer.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionMetadata,
  AgentSessionRunInput,
  AgentSessionRunResult,
  AgentSessionSetInput,
  AgentSessionStreamEvent,
  AgentSessionSystemBlock,
  AgentSessionSystemSnapshot,
} from "@/sdk/AgentSdkTypes.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import {
  buildSessionSystemBlocks,
  SessionSystemBuilder,
} from "@/sdk/SessionSystemBuilder.js";
import {
  inferModelLabel,
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "@/sdk/session/index.js";
import {
  getSdkAgentSessionArchiveDirPath,
  getSdkAgentSessionDirPath,
} from "@/sdk/session/index.js";
import { AsyncQueue } from "@/sdk/AsyncQueue.js";
import type { SessionPort } from "@/core/AgentContextTypes.js";
import { pushUiMessageChunkAsSdkEvent } from "@/sdk/StreamEvents.js";
import {
  persistSdkAssistantResult,
  touchSessionMetadata,
} from "@/sdk/session/index.js";
import { createSessionServicePort } from "@/sdk/session/index.js";

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
   * 读取当前 agent 显式注入 service 的 system blocks。
   */
  getServiceSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取当前 agent 显式注册 plugin 的 system blocks。
   */
  getPluginSystemBlocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 在执行前确保当前 session 已完成宿主侧默认配置。
   *
   * 关键点（中文）
   * - 这里通常由 `AgentCore` 注入，用于补齐默认 model、宿主覆写等一次性装配。
   * - 所有执行入口都应通过这里兜底，避免只在 SDK `agent.session()` 链路上做配置。
   */
  ensureConfigured?: (session: Session) => Promise<void>;
};

/**
 * SDK 本地 Session。
 */
export class Session {
  readonly id: string;
  readonly agentId: string;

  private readonly projectRoot: string;
  private readonly tools: Record<string, Tool>;
  private readonly logger: SessionOptions["logger"];
  private readonly getInstructionSystemBlocks: SessionOptions["getInstructionSystemBlocks"];
  private readonly getServiceSystemBlocks: SessionOptions["getServiceSystemBlocks"];
  private readonly getPluginSystemBlocks: SessionOptions["getPluginSystemBlocks"];
  private readonly ensureConfiguredHook?: SessionOptions["ensureConfigured"];
  private readonly historyStore: JsonlSessionHistoryStore;
  private readonly historyComposer: JsonlSessionHistoryComposer;
  private readonly executor: Executor;
  private sessionConfig: AgentSessionConfigSnapshot = {};
  private createdAt = Date.now();
  private timezone = resolveSystemTimezone();
  private initializePromise: Promise<this> | null = null;
  private ensureConfiguredPromise: Promise<void> | null = null;
  private servicePort: SessionPort | null = null;

  constructor(options: SessionOptions) {
    this.id = String(options.sessionId || "").trim();
    this.agentId = String(options.agentId || "").trim();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.tools = options.tools;
    this.logger = options.logger;
    this.getInstructionSystemBlocks = options.getInstructionSystemBlocks;
    this.getServiceSystemBlocks = options.getServiceSystemBlocks;
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
        getServiceSystemBlocks: this.getServiceSystemBlocks,
        getPluginSystemBlocks: this.getPluginSystemBlocks,
      }),
      getTools: () => this.tools,
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
        ...(metadata.sdkConfig?.modelLabel
          ? { modelLabel: metadata.sdkConfig.modelLabel }
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
      this.sessionConfig.model = input.model;
      this.sessionConfig.modelLabel = inferModelLabel(input.model);
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
   * 读取完整消息历史。
   */
  async history(): Promise<SessionMessageV1[]> {
    return await this.historyStore.list();
  }

  /**
   * 读取当前 session 生效的 system prompt 文本集合。
   *
   * 关键点（中文）
   * - 返回内容与实际 run 时使用的 SDK system composer 同源。
   * - 包含 instruction/core、显式注入 service system、显式注册 plugin system 与 session 上下文。
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
      getServiceSystemBlocks: this.getServiceSystemBlocks,
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
    return this.executor.isExecuting();
  }

  /**
   * 清理当前 session 的执行器缓存。
   */
  clearExecutor(): void {
    this.executor.clearExecutor();
  }

  /**
   * 执行一轮非流式请求。
   */
  async run(input: AgentSessionRunInput): Promise<AgentSessionRunResult> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("session.run requires a non-empty query");
    }
    await this.ensureReadyForExecution();
    if (!this.sessionConfig.model) {
      throw new Error(
        `Session "${this.id}" requires a configured model. Pass model to new Agent({ model }), call session.set({ model }) first, or let the host configure the session during creation.`,
      );
    }
    await this.appendUserMessage({ text: query });
    const result = await this.executor.run({
      query,
    });
    await this.persistAssistantResult(result.assistantMessage);
    return {
      success: result.success,
      ...(result.error ? { error: result.error } : {}),
      text: extractTextFromUiMessage(result.assistantMessage),
      assistantMessage: result.assistantMessage,
    };
  }

  /**
   * 执行一轮流式请求。
   */
  async *stream(
    input: AgentSessionRunInput,
  ): AsyncIterable<AgentSessionStreamEvent> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("session.stream requires a non-empty query");
    }
    await this.ensureReadyForExecution();
    if (!this.sessionConfig.model) {
      throw new Error(
        `Session "${this.id}" requires a configured model. Pass model to new Agent({ model }), call session.set({ model }) first, or let the host configure the session during creation.`,
      );
    }
    const queue = new AsyncQueue<AgentSessionStreamEvent>();
    const toolNameByCallId = new Map<string, string>();
    await this.appendUserMessage({ text: query });

    const runPromise = (async () => {
      try {
        const result = await this.executor.run({
          query,
          onUiMessageChunkCallback: async (chunk) => {
            pushUiMessageChunkAsSdkEvent({
              queue,
              chunk,
              toolNameByCallId,
            });
          },
        });
        await this.persistAssistantResult(result.assistantMessage);
      } catch (error) {
        queue.push({
          type: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        queue.close();
      }
    })();

    for await (const event of queue) {
      yield event;
    }

    await runPromise;
  }

  /**
   * 从当前 session 创建一个分叉会话。
   */
  async fork(input?: AgentSessionForkInput["messageId"]): Promise<Session> {
    const messageId = String(input || "").trim() || undefined;
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
      getServiceSystemBlocks: this.getServiceSystemBlocks,
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
    await forked.touchMetadata();
    return forked;
  }

  /**
   * 生成当前 session 的元数据快照。
   */
  async toMetadata(): Promise<AgentSessionMetadata> {
    const meta = await readSessionMetadata({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
    });
    const messageCount = await this.historyStore.size();
    return {
      agentId: this.agentId,
      sessionId: this.id,
      messageCount,
      ...(typeof meta.createdAt === "number" ? { createdAt: meta.createdAt } : {}),
      ...(typeof meta.updatedAt === "number" ? { updatedAt: meta.updatedAt } : {}),
      ...(meta.sdkConfig?.modelLabel ? { modelLabel: meta.sdkConfig.modelLabel } : {}),
    };
  }

  /**
   * 返回供 chat service 使用的 session 端口。
   */
  getServicePort(): SessionPort {
    if (this.servicePort) return this.servicePort;
    this.servicePort = createSessionServicePort({
      sessionId: this.id,
      executor: this.executor,
      historyStore: this.historyStore,
      ensureReadyForExecution: async () => {
        await this.ensureReadyForExecution();
      },
      touchMetadata: async () => {
        await this.touchMetadata();
      },
    });
    return this.servicePort;
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

  private async touchMetadata(): Promise<void> {
    await touchSessionMetadata({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      sessionConfig: this.sessionConfig,
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
}
