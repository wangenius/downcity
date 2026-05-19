/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 统一收口消息落盘、默认模型配置、run/stream/fork 等高层 API。
 * - 内部继续复用现有 `Session` / `JsonlSessionHistoryComposer` / `LocalSessionExecutor`。
 */

import { nanoid } from "nanoid";
import type { LanguageModel, Tool } from "ai";
import { Session as CoreSession } from "@session/Session.js";
import { JsonlSessionHistoryComposer } from "@session/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionCompactionComposer } from "@session/composer/compaction/jsonl/JsonlSessionCompactionComposer.js";
import { LocalSessionExecutor } from "@session/executors/local/LocalSessionExecutor.js";
import { extractTextFromUiMessage } from "@/service/builtins/chat/runtime/UIMessageTransformer.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionMetadata,
  AgentSessionRunInput,
  AgentSessionRunResult,
  AgentSessionSetInput,
  AgentSessionStreamEvent,
} from "@/sdk/AgentSdkTypes.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import { SdkSessionSystemComposer } from "@/sdk/SdkSessionSystemComposer.js";
import { resolveSdkSessionSystemMessages } from "@/sdk/SdkSessionSystemComposer.js";
import {
  inferModelLabel,
  patchSdkSessionModelLabel,
  readSdkSessionMetadata,
  writeSdkSessionMetadata,
} from "@/sdk/SessionMetadata.js";
import {
  getSdkAgentSessionArchiveDirPath,
  getSdkAgentSessionDirPath,
} from "@/sdk/Paths.js";
import { AsyncQueue } from "@/sdk/AsyncQueue.js";
import type { SessionPort } from "@/runtime/AgentContextTypes.js";
import { pushUiMessageChunkAsSdkEvent } from "@/sdk/StreamEvents.js";
import {
  persistSdkAssistantResult,
  touchSdkSessionMetadata,
} from "@/sdk/SessionPersistence.js";
import { createSdkSessionServicePort } from "@/sdk/SessionServicePort.js";

type SdkSessionOptions = {
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
   * 读取静态 system 文本集合。
   */
  getStaticSystemPrompts: () => string[];

  /**
   * 读取当前 agent 显式注入 service 的 system 文本集合。
   */
  getServiceSystemPrompts: () => Promise<string[]>;

  /**
   * 读取当前 agent 显式注册 plugin 的 system 文本集合。
   */
  getPluginSystemPrompts: () => Promise<string[]>;
};

/**
 * SDK 本地 Session。
 */
export class SdkSession {
  readonly id: string;
  readonly agentId: string;

  private readonly projectRoot: string;
  private readonly tools: Record<string, Tool>;
  private readonly logger: SdkSessionOptions["logger"];
  private readonly getStaticSystemPrompts: SdkSessionOptions["getStaticSystemPrompts"];
  private readonly getServiceSystemPrompts: SdkSessionOptions["getServiceSystemPrompts"];
  private readonly getPluginSystemPrompts: SdkSessionOptions["getPluginSystemPrompts"];
  private readonly historyComposer: JsonlSessionHistoryComposer;
  private readonly coreSession: CoreSession;
  private sessionConfig: AgentSessionConfigSnapshot = {};
  private initializePromise: Promise<this> | null = null;
  private servicePort: SessionPort | null = null;

  constructor(options: SdkSessionOptions) {
    this.id = String(options.sessionId || "").trim();
    this.agentId = String(options.agentId || "").trim();
    this.projectRoot = String(options.projectRoot || "").trim();
    this.tools = options.tools;
    this.logger = options.logger;
    this.getStaticSystemPrompts = options.getStaticSystemPrompts;
    this.getServiceSystemPrompts = options.getServiceSystemPrompts;
    this.getPluginSystemPrompts = options.getPluginSystemPrompts;
    if (!this.id) {
      throw new Error("SdkSession requires a non-empty sessionId");
    }
    if (!this.agentId) {
      throw new Error("SdkSession requires a non-empty agentId");
    }
    if (!this.projectRoot) {
      throw new Error("SdkSession requires a non-empty projectRoot");
    }

    const sessionDirPath = getSdkAgentSessionDirPath(
      this.projectRoot,
      this.agentId,
      this.id,
    );
    const messagesDirPath = `${sessionDirPath}/messages`;
    this.historyComposer = new JsonlSessionHistoryComposer({
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

    this.coreSession = new CoreSession({
      sessionId: this.id,
      historyComposer: this.historyComposer,
      createExecutor: (historyComposer) => {
        const model = this.sessionConfig.model;
        if (!model) {
          throw new Error(
            `Session "${this.id}" has no model configured. Call session.set({ model }) first.`,
          );
        }
        return new LocalSessionExecutor({
          model,
          logger: this.logger as never,
          historyComposer,
          compactionComposer: new JsonlSessionCompactionComposer(),
          systemComposer: new SdkSessionSystemComposer({
            projectRoot: this.projectRoot,
            getStaticSystemPrompts: this.getStaticSystemPrompts,
            getServiceSystemPrompts: this.getServiceSystemPrompts,
            getPluginSystemPrompts: this.getPluginSystemPrompts,
          }),
          getTools: () => this.tools,
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
      const metadata = await readSdkSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
      });
      await writeSdkSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
        meta: {
          ...metadata,
          agentId: this.agentId,
          createdAt:
            typeof metadata.createdAt === "number" ? metadata.createdAt : Date.now(),
        },
      });
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
      this.coreSession.clearExecutor();
    }
    await patchSdkSessionModelLabel({
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
    await this.coreSession.appendUserMessage({
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
    await this.coreSession.appendAssistantMessage({
      fallbackText: String(input.text || "").trim(),
    });
    await this.touchMetadata();
  }

  /**
   * 读取完整消息历史。
   */
  async history(): Promise<SessionMessageV1[]> {
    return await this.historyComposer.list();
  }

  /**
   * 读取当前 session 生效的 system prompt 文本集合。
   *
   * 关键点（中文）
   * - 返回内容与实际 run 时使用的 SDK system composer 同源。
   * - 包含静态 system、显式注入 service system、显式注册 plugin system 与 runtime clock。
   * - 这里只返回文本数组，不把 system prompt 写入会话历史。
   */
  async system(): Promise<string[]> {
    const messages = await resolveSdkSessionSystemMessages({
      projectRoot: this.projectRoot,
      sessionId: this.id,
      getStaticSystemPrompts: this.getStaticSystemPrompts,
      getServiceSystemPrompts: this.getServiceSystemPrompts,
      getPluginSystemPrompts: this.getPluginSystemPrompts,
    });
    return messages
      .map((message) => String(message.content || ""))
      .filter((content) => content.trim().length > 0);
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.coreSession.isExecuting();
  }

  /**
   * 清理当前 session 的执行器缓存。
   */
  clearExecutor(): void {
    this.coreSession.clearExecutor();
  }

  /**
   * 执行一轮非流式请求。
   */
  async run(input: AgentSessionRunInput): Promise<AgentSessionRunResult> {
    const query = String(input.query || "").trim();
    if (!query) {
      throw new Error("session.run requires a non-empty query");
    }
    await this.appendUserMessage({ text: query });
    const result = await this.coreSession.run({
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
    const queue = new AsyncQueue<AgentSessionStreamEvent>();
    const toolNameByCallId = new Map<string, string>();
    await this.appendUserMessage({ text: query });

    const runPromise = (async () => {
      try {
        const result = await this.coreSession.run({
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
  async fork(input?: AgentSessionForkInput["messageId"]): Promise<SdkSession> {
    const messageId = String(input || "").trim() || undefined;
    const messages = await this.historyComposer.list();
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

    const forked = new SdkSession({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: `fork-${Date.now()}-${nanoid(8)}`,
      tools: this.tools,
      logger: this.logger,
      getStaticSystemPrompts: this.getStaticSystemPrompts,
      getServiceSystemPrompts: this.getServiceSystemPrompts,
      getPluginSystemPrompts: this.getPluginSystemPrompts,
    });
    await forked.initialize();
    if (this.sessionConfig.model) {
      await forked.set({
        model: this.sessionConfig.model,
      });
    }
    for (const message of forkMessages) {
      await forked.historyComposer.append(message);
    }
    await forked.touchMetadata();
    return forked;
  }

  /**
   * 生成当前 session 的元数据快照。
   */
  async toMetadata(): Promise<AgentSessionMetadata> {
    const meta = await readSdkSessionMetadata({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
    });
    const messageCount = await this.historyComposer.size();
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
    this.servicePort = createSdkSessionServicePort({
      sessionId: this.id,
      coreSession: this.coreSession,
      historyComposer: this.historyComposer,
      touchMetadata: async () => {
        await this.touchMetadata();
      },
    });
    return this.servicePort;
  }

  private async touchMetadata(): Promise<void> {
    await touchSdkSessionMetadata({
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
      coreSession: this.coreSession,
      assistantMessage,
    });
  }
}
