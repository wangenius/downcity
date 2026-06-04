/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 对外保留稳定 Session facade，把状态、turn、view 逻辑下沉到独立 service。
 * - 内部继续复用 `Executor` / `JsonlSessionHistoryStore` / Composer 体系。
 */

import type { Tool } from "ai";
import { Executor } from "@executor/Executor.js";
import { JsonlSessionHistoryComposer } from "@executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionHistoryStore } from "@/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import type {
  AgentSession,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionHistoryInput,
  AgentSessionHistoryPage,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSystemBlock,
  AgentSessionSystemSnapshot,
} from "@/types/agent/AgentTypes.js";
import {
  getSdkAgentSessionArchiveDirPath,
  getSdkAgentSessionDirPath,
  getSdkAgentSessionInflightPath,
  resolveSystemTimezone,
  createRuntimeSessionPort,
} from "@/session/index.js";
import { SessionSystemBuilder } from "@/session/SessionSystemBuilder.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";
import { SessionTurnService } from "@/session/services/SessionTurnService.js";
import { SessionViewService } from "@/session/services/SessionViewService.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";

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
  private readonly localState: SessionLocalState;
  private readonly stateService: SessionStateService;
  private readonly turnService: SessionTurnService;
  private readonly viewService: SessionViewService<Session>;
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

    const session_dir_path = getSdkAgentSessionDirPath(
      this.projectRoot,
      this.agentId,
      this.id,
    );
    const messages_dir_path = `${session_dir_path}/messages`;
    this.historyStore = new JsonlSessionHistoryStore({
      rootPath: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      paths: {
        sessionDirPath: session_dir_path,
        messagesDirPath: messages_dir_path,
        messagesFilePath: `${messages_dir_path}/messages.jsonl`,
        metaFilePath: `${messages_dir_path}/meta.json`,
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
    this.localState = {
      sessionConfig: {},
      createdAt: Date.now(),
      timezone: resolveSystemTimezone(),
      initializePromise: null,
      ensureConfiguredPromise: null,
    };
    this.executor = new Executor({
      sessionId: this.id,
      historyStore: this.historyStore,
      historyComposer: this.historyComposer,
      getModel: () => this.localState.sessionConfig.model,
      logger: this.logger as never,
      systemComposer: new SessionSystemBuilder({
        agentId: this.agentId,
        projectRoot: this.projectRoot,
        getSessionCreatedAt: () => this.localState.createdAt,
        getSessionTimezone: () => this.localState.timezone,
        getInstructionSystemBlocks: this.getInstructionSystemBlocks,
        getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
        getPluginSystemBlocks: this.getPluginSystemBlocks,
      }),
      getTools: () => this.tools,
    });
    this.stateService = new SessionStateService({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      history_store: this.historyStore,
      executor: this.executor,
      state: this.localState,
      ensure_configured_hook: this.ensureConfiguredHook
        ? async () => {
            await this.ensureConfiguredHook?.(this);
          }
        : undefined,
      publish_event: (event) => {
        this.eventHub.publish(event);
      },
    });
    this.turnService = new SessionTurnService({
      session_id: this.id,
      executor: this.executor,
      state_service: this.stateService,
      event_hub: this.eventHub,
    });
    this.viewService = new SessionViewService<Session>({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      history_store: this.historyStore,
      state_service: this.stateService,
      is_executing: () => this.isExecuting(),
      get_instruction_system_blocks: this.getInstructionSystemBlocks,
      get_managed_plugin_system_blocks: this.getManagedPluginSystemBlocks,
      get_plugin_system_blocks: this.getPluginSystemBlocks,
      create_fork_session: async (session_id) => {
        const session = this.createChildSession(session_id);
        await session.initialize();
        return {
          session,
          history_store: session.historyStore,
          state_service: session.stateService,
        };
      },
    });
  }

  /**
   * 初始化当前 session。
   */
  async initialize(): Promise<this> {
    await this.stateService.initialize();
    return this;
  }

  /**
   * 读取当前 session 配置快照。
   */
  get config(): AgentSessionConfigSnapshot {
    return this.stateService.get_config();
  }

  /**
   * 写入当前 session 默认配置。
   */
  async set(input: AgentSessionSetInput): Promise<void> {
    await this.stateService.set(input);
  }

  /**
   * 追加一条新的 Session prompt。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    return await this.turnService.prompt(input);
  }

  /**
   * 订阅当前 Session 的未来事件。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe {
    return this.turnService.subscribe(subscriber);
  }

  /**
   * 追加一条 user 文本消息。
   */
  async appendUserMessage(input: {
    text: string;
  }): Promise<void> {
    await this.stateService.append_user_message({
      text: String(input.text || "").trim(),
    });
  }

  /**
   * 追加一条 assistant 文本消息。
   */
  async appendAssistantMessage(input: {
    text: string;
  }): Promise<void> {
    await this.stateService.append_assistant_message({
      fallbackText: String(input.text || "").trim(),
    });
  }

  /**
   * 读取当前 session 详情。
   */
  async getInfo(): Promise<AgentSessionInfo> {
    return await this.viewService.get_info();
  }

  /**
   * 读取当前 session 历史分页。
   */
  async history(input?: AgentSessionHistoryInput): Promise<AgentSessionHistoryPage> {
    return await this.viewService.history(input);
  }

  /**
   * 读取当前 session 生效的 system 快照。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    return await this.viewService.system();
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.turnService.is_prompt_runtime_active() || this.executor.isExecuting();
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
    return await this.viewService.fork(input);
  }

  /**
   * 返回供受托管 plugin 使用的 session 端口。
   */
  getRuntimePort(): SessionPort {
    if (this.runtimePort) return this.runtimePort;
    this.runtimePort = createRuntimeSessionPort({
      sessionId: this.id,
      getExecutor: () => this.executor.getExecutor(),
      prompt: async (input) => await this.prompt(input),
      subscribe: (subscriber) => this.subscribe(subscriber),
      clearExecutor: () => {
        this.executor.clearExecutor();
      },
      afterSessionUpdatedAsync: async () => {
        await this.executor.afterSessionUpdatedAsync();
      },
      appendUserMessage: async (message_params) => {
        await this.stateService.append_user_message(message_params);
      },
      appendAssistantMessage: async (message_params) => {
        await this.stateService.append_assistant_message(message_params);
      },
      isExecuting: () => this.isExecuting(),
      historyStore: this.historyStore,
      ensureReadyForExecution: async () => {
        await this.ensureReadyForExecution();
      },
      touchMetadata: async () => {
        await this.stateService.touch_metadata();
      },
    });
    return this.runtimePort;
  }

  /**
   * 在执行前确保 session 已完成初始化与宿主装配。
   */
  async ensureReadyForExecution(): Promise<void> {
    await this.stateService.ensure_ready_for_execution();
  }

  private createChildSession(session_id: string): Session {
    return new Session({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: session_id,
      tools: this.tools,
      logger: this.logger,
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: this.getPluginSystemBlocks,
    });
  }
}
