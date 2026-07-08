/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 对外保留稳定 Session facade，把状态、turn、view 逻辑下沉到独立 service。
 * - 内部继续复用 `Executor` / `JsonlSessionHistoryStore` / Composer 体系。
 */

import { Executor } from "@executor/Executor.js";
import type { Tool } from "ai";
import { JsonlSessionHistoryComposer } from "@executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { JsonlSessionHistoryStore } from "@/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import type {
  AgentSession,
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionRecordsInput,
  AgentSessionRecordsPage,
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
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";
import { SessionTurnService } from "@/session/services/SessionTurnService.js";
import { SessionViewService } from "@/session/services/SessionViewService.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import type {
  SessionComposerFactoryContext,
  SessionComposerInput,
  SessionComposerOptions,
} from "@/types/session/SessionComposerOptions.js";
import type { SessionCompactionComposer } from "@/executor/composer/compaction/SessionCompactionComposer.js";
import type { SessionContextComposer } from "@/executor/composer/context/SessionContextComposer.js";
import type { SessionHistoryComposer } from "@/executor/composer/history/SessionHistoryComposer.js";
import type { SessionSystemComposer } from "@/executor/composer/system/SessionSystemComposer.js";
import type { SessionOptions } from "@/types/session/SessionOptions.js";

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
  private readonly composers?: SessionComposerOptions;
  private readonly historyStore: JsonlSessionHistoryStore;
  private readonly historyComposer: SessionHistoryComposer;
  private readonly executor: Executor;
  private readonly eventHub = new SessionEventHub();
  private readonly localState: SessionLocalState;
  private readonly stateService: SessionStateService;
  private readonly turnService: SessionTurnService;
  private readonly viewService: SessionViewService<this>;
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
    this.composers = options.composers;
    if (!this.id) {
      throw new Error("Session requires a non-empty sessionId");
    }
    if (!this.agentId) {
      throw new Error("Session requires a non-empty agentId");
    }
    if (!this.projectRoot) {
      throw new Error("Session requires a non-empty projectRoot");
    }

    this.historyStore = this.create_history_store();
    this.localState = this.create_local_state();
    const composer_context = this.create_composer_context();
    this.historyComposer = this.create_history_composer(composer_context);
    const system_composer = this.create_system_composer(composer_context);
    const context_composer = this.create_context_composer(composer_context);
    const compaction_composer =
      this.create_compaction_composer(composer_context);
    this.executor = this.create_executor(
      system_composer,
      context_composer,
      compaction_composer,
    );
    this.stateService = new SessionStateService({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      history_store: this.historyStore,
      executor: this.executor,
      state: this.localState,
      logger: this.logger,
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
      project_root: this.projectRoot,
      executor: this.executor,
      state_service: this.stateService,
      event_hub: this.eventHub,
    });
    this.viewService = new SessionViewService<this>({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      history_store: this.historyStore,
      state_service: this.stateService,
      logger: this.logger,
      is_executing: () => this.isExecuting(),
      get_instruction_system_blocks: this.getInstructionSystemBlocks,
      get_managed_plugin_system_blocks: this.getManagedPluginSystemBlocks,
      get_plugin_system_blocks: this.getPluginSystemBlocks,
      ...(this.composers?.systemComposer
        ? { custom_system_composer: system_composer }
        : {}),
      create_fork_session: async (session_id) => {
        const session = this.create_fork_session(session_id);
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
   * 停止当前 turn，并取消尚未被吸收的排队 prompt。
   */
  async stop(): Promise<AgentSessionStopResult> {
    return await this.turnService.stop();
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
  async append_user_message(input: {
    text: string;
  }): Promise<void> {
    await this.stateService.append_user_message({
      text: String(input.text || "").trim(),
    });
  }

  /**
   * 追加一条 assistant 文本消息。
   */
  async append_assistant_message(input: {
    text: string;
  }): Promise<void> {
    await this.stateService.append_assistant_message({
      fallbackText: String(input.text || "").trim(),
    });
  }

  /**
   * 读取当前 session 详情。
   */
  async get_info(): Promise<AgentSessionInfo> {
    return await this.viewService.get_info();
  }

  /**
   * 读取当前 session records 分页。
   */
  async records(input?: AgentSessionRecordsInput): Promise<AgentSessionRecordsPage> {
    return await this.viewService.records(input);
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
  async fork(input?: AgentSessionForkInput | string): Promise<this> {
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
      stop: async () => await this.stop(),
      subscribe: (subscriber) => this.subscribe(subscriber),
      publishEvent: (event) => {
        this.eventHub.publish(event);
      },
      clearExecutor: () => {
        this.executor.clearExecutor();
      },
      afterSessionUpdatedAsync: async () => {
        await this.executor.afterSessionUpdatedAsync();
      },
      append_user_message: async (message_params) => {
        await this.stateService.append_user_message(message_params);
      },
      append_assistant_message: async (message_params) => {
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

  private create_fork_session(session_id: string): this {
    return this.create_child_session({
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: session_id,
      tools: this.tools,
      logger: this.logger,
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: this.getPluginSystemBlocks,
      ensureConfigured: this.ensureConfiguredHook,
      composers: this.composers,
    });
  }

  /**
   * 创建当前 Session 的同类子会话。
   *
   * 关键点（中文）
   * - 默认沿用当前实例的 class，避免自定义 Session 在 fork 后退回默认实现。
   * - 子类仍可覆盖该方法，接管更特殊的子会话创建逻辑。
   */
  protected create_child_session(options: SessionOptions): this {
    const SessionClass = this.constructor as new (
      options: SessionOptions,
    ) => Session;
    return new SessionClass(options) as this;
  }

  private create_history_store(): JsonlSessionHistoryStore {
    const session_dir_path = getSdkAgentSessionDirPath(
      this.projectRoot,
      this.agentId,
      this.id,
    );
    const messages_dir_path = `${session_dir_path}/messages`;
    return new JsonlSessionHistoryStore({
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
  }

  private create_local_state(): SessionLocalState {
    return {
      sessionConfig: {},
      createdAt: Date.now(),
      timezone: resolveSystemTimezone(),
      initializePromise: null,
      ensureConfiguredPromise: null,
    };
  }

  private create_composer_context(): SessionComposerFactoryContext {
    return {
      agentId: this.agentId,
      projectRoot: this.projectRoot,
      sessionId: this.id,
      historyStore: this.historyStore,
      getTools: () => this.tools,
      getInstructionSystemBlocks: this.getInstructionSystemBlocks,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: this.getPluginSystemBlocks,
      getSessionCreatedAt: () => this.localState.createdAt,
      getSessionTimezone: () => this.localState.timezone,
    };
  }

  private create_history_composer(
    context: SessionComposerFactoryContext,
  ): SessionHistoryComposer {
    return this.resolve_composer(this.composers?.historyComposer, context, () =>
      new JsonlSessionHistoryComposer({
        store: this.historyStore,
      }),
    );
  }

  private create_system_composer(
    context: SessionComposerFactoryContext,
  ): SessionSystemComposer {
    return this.resolve_composer(this.composers?.systemComposer, context, () =>
      new SessionSystemBuilder({
        agentId: this.agentId,
        projectRoot: this.projectRoot,
        getSessionCreatedAt: () => this.localState.createdAt,
        getSessionTimezone: () => this.localState.timezone,
        getInstructionSystemBlocks: this.getInstructionSystemBlocks,
        getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
        getPluginSystemBlocks: this.getPluginSystemBlocks,
      }),
    );
  }

  private create_context_composer(
    context: SessionComposerFactoryContext,
  ): SessionContextComposer | undefined {
    return this.resolve_optional_composer<SessionContextComposer>(
      this.composers?.contextComposer,
      context,
    );
  }

  private create_compaction_composer(
    context: SessionComposerFactoryContext,
  ): SessionCompactionComposer | undefined {
    return this.resolve_optional_composer<SessionCompactionComposer>(
      this.composers?.compactionComposer,
      context,
    );
  }

  private create_executor(
    system_composer: SessionSystemComposer,
    context_composer?: SessionContextComposer,
    compaction_composer?: SessionCompactionComposer,
  ): Executor {
    return new Executor({
      sessionId: this.id,
      historyStore: this.historyStore,
      historyComposer: this.historyComposer,
      getModel: () => this.localState.sessionConfig.model,
      logger: this.logger,
      systemComposer: system_composer,
      getTools: () => this.tools,
      ...(context_composer ? { contextComposer: context_composer } : {}),
      ...(compaction_composer
        ? { compactionComposer: compaction_composer }
        : {}),
    });
  }

  private resolve_composer<TComposer>(
    input: SessionComposerInput<TComposer> | undefined,
    context: SessionComposerFactoryContext,
    create_default: () => TComposer,
  ): TComposer {
    const composer = this.resolve_optional_composer(input, context);
    return composer || create_default();
  }

  private resolve_optional_composer<TComposer>(
    input: SessionComposerInput<TComposer> | undefined,
    context: SessionComposerFactoryContext,
  ): TComposer | undefined {
    if (!input) return undefined;
    if (typeof input === "function") {
      const create_composer = input as (
        context: SessionComposerFactoryContext,
      ) => TComposer;
      return create_composer(context);
    }
    return input;
  }
}
