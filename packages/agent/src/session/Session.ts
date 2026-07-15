/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 对外保留稳定 Session facade，把状态、turn、view 逻辑下沉到独立 service。
 * - 内部使用 `SessionRecorder` 统一管理 Active、Segment 与流式 Assistant 草稿。
 */

import { Executor } from "@executor/Executor.js";
import type { LanguageModel, Tool } from "ai";
import { JsonlSessionHistoryComposer } from "@executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { SessionRecorderHistoryStore } from "@/session/recorder/SessionRecorderHistoryStore.js";
import { JsonlSessionMessageStore } from "@/session/recorder/JsonlSessionMessageStore.js";
import { SessionRecorder } from "@/session/recorder/SessionRecorder.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionForkInput,
  AgentSessionInfo,
  AgentSessionSetInput,
  AgentSessionSystemBlock,
  AgentSessionSystemSnapshot,
} from "@/types/agent/SessionTypes.js";
import type { AgentSession } from "@/types/agent/SessionActor.js";
import {
  getSdkAgentSessionAssistantMessagePath,
  getSdkAgentSessionDirPath,
} from "@/session/storage/Paths.js";
import { resolveSystemTimezone } from "@/session/storage/Metadata.js";
import { read_agent_model_context_window } from "@/model/CityModelAdapter.js";
import { createRuntimeSessionPort } from "@/session/storage/RuntimeSessionPort.js";
import { SessionSystemBuilder } from "@/session/SessionSystemBuilder.js";
import type { SessionPort } from "@/types/session/SessionPort.js";
import type {
  SessionMutationSubscriber,
  SessionMutationUnsubscribe,
} from "@/types/session/SessionMutation.js";
import type {
  ResolveSessionApprovalInput,
  SessionApproval,
  SessionApprovalModeSnapshot,
  SessionApprovalResult,
  SetSessionApprovalModeInput,
} from "@/types/session/SessionApproval.js";
import type {
  ListSessionMessagesInput,
  SessionMessagePage,
} from "@/types/session/SessionMessage.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import { SessionEventHub } from "@/session/runtime/SessionEventHub.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";
import { SessionTurnService } from "@/session/services/SessionTurnService.js";
import { SessionViewService } from "@/session/services/SessionViewService.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import type { AgentSessionCommand } from "@/types/session/SessionQueueCommand.js";
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
import type { AgentPluginExecutionRuntime } from "@/types/plugin/PluginRuntime.js";
import { SessionToolRuntime } from "@/session/tool/SessionToolRuntime.js";
import { SessionApprovalBroker } from "@/session/approval/SessionApprovalBroker.js";

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
  private readonly historyStore: SessionRecorderHistoryStore;
  private readonly messageStore: JsonlSessionMessageStore;
  private readonly recorder: SessionRecorder;
  private readonly historyComposer: SessionHistoryComposer;
  private readonly executor: Executor;
  private readonly eventHub: SessionEventHub;
  private readonly tool_runtime: SessionToolRuntime;
  private readonly approval_broker: SessionApprovalBroker;
  private readonly localState: SessionLocalState;
  private readonly getAgentEnv: SessionOptions["getAgentEnv"];
  private readonly getAgentModel: SessionOptions["getAgentModel"];
  private readonly get_agent_plugins: SessionOptions["get_agent_plugins"];
  private effective_instruction_system_blocks: AgentSessionSystemBlock[];
  private effective_agent_env: Record<string, string>;
  private effective_agent_plugins: AgentPluginExecutionRuntime;
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
    this.getAgentEnv = options.getAgentEnv;
    this.getAgentModel = options.getAgentModel;
    this.get_agent_plugins = options.get_agent_plugins;
    this.effective_instruction_system_blocks = options
      .getInstructionSystemBlocks()
      .map((block) => ({ ...block }));
    this.effective_agent_env = { ...options.getAgentEnv() };
    this.effective_agent_plugins = options.get_agent_plugins();
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

    this.eventHub = new SessionEventHub();
    this.messageStore = this.create_message_store();
    this.recorder = new SessionRecorder({
      session_id: this.id,
      store: this.messageStore,
      publish: (mutation) => {
        this.eventHub.publish(mutation);
      },
    });
    this.tool_runtime = new SessionToolRuntime(this.recorder);
    this.approval_broker = new SessionApprovalBroker({
      session_id: this.id,
      tool_runtime: this.tool_runtime,
    });
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
      recorder: this.recorder,
      executor: this.executor,
      state: this.localState,
      logger: this.logger,
      ensure_configured_hook: this.ensureConfiguredHook
        ? async () => {
            await this.ensureConfiguredHook?.(this);
          }
        : undefined,
      get_model: () => this.get_model(),
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
      recorder: this.recorder,
      tool_runtime: this.tool_runtime,
      approval_broker: this.approval_broker,
    });
    this.viewService = new SessionViewService<this>({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      history_store: this.historyStore,
      recorder: this.recorder,
      state_service: this.stateService,
      logger: this.logger,
      is_executing: () => this.isExecuting(),
      get_instruction_system_blocks: () =>
        this.effective_instruction_system_blocks.map((block) => ({ ...block })),
      get_managed_plugin_system_blocks: this.getManagedPluginSystemBlocks,
      get_plugin_system_blocks: async () =>
        await this.effective_agent_plugins.systemBlocks(),
      ...(this.composers?.systemComposer
        ? { custom_system_composer: system_composer }
        : {}),
      create_fork_session: async (session_id) => {
        const session = this.create_fork_session(session_id);
        await session.initialize();
        return {
          session,
          history_store: session.historyStore,
          recorder: session.recorder,
          state_service: session.stateService,
        };
      },
    });
  }

  /**
   * 初始化当前 session。
   */
  async initialize(): Promise<this> {
    await this.recorder.initialize();
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
    const configured = await this.stateService.set(input);
    if (configured.command) {
      this.turnService.enqueue_command(configured.command);
    }
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
    await this.approval_broker.expire_all();
    return await this.turnService.stop();
  }

  /**
   * 把一次显式历史压缩加入当前 Session 的有序输入队列。
   */
  async compact(): Promise<void> {
    await this.turnService.compact();
  }

  /**
   * 把 Agent configured state command 加入当前 Session 的统一输入队列。
   */
  enqueue_agent_command(command: AgentSessionCommand): void {
    this.turnService.enqueue_command({
      type: "command",
      command_id: command.command_id,
      scope: "agent",
      execute: async ({ turn_id }) => {
        if (command.type === "instruction") {
          this.effective_instruction_system_blocks = command
            .instruction_blocks
            .map((block) => ({ ...block }));
          await this.stateService.emit_config_action_event({
            id: `agent-instruction:${this.id}:${command.command_id}`,
            title: "Agent instruction updated",
            state: "completed",
            turnId: turn_id,
          });
          return;
        }
        if (command.type === "env") {
          this.effective_agent_env = { ...command.env };
          await this.stateService.emit_config_action_event({
            id: `agent-env:${this.id}:${command.command_id}`,
            title: "Agent environment updated",
            state: "completed",
            turnId: turn_id,
          });
          return;
        }
        this.effective_agent_plugins = command.plugins;
        await this.stateService.emit_config_action_event({
          id: `agent-plugins:${this.id}:${command.command_id}`,
          title: command.title,
          state: "completed",
          turnId: turn_id,
        });
      },
    });
  }

  /**
   * 订阅当前 Session 的未来事件。
   */
  subscribe(
    subscriber: SessionMutationSubscriber,
  ): SessionMutationUnsubscribe {
    return this.eventHub.subscribe(subscriber);
  }

  /** 列出当前 Session 的 pending 工具审批。 */
  async approvals(): Promise<SessionApproval[]> {
    return this.approval_broker.list();
  }

  /** 读取当前 Session 的工具审批模式。 */
  async approval_mode(): Promise<SessionApprovalModeSnapshot> {
    return this.approval_broker.get_mode();
  }

  /** 更新当前 Session 的工具审批模式。 */
  async set_approval_mode(input: SetSessionApprovalModeInput): Promise<SessionApprovalModeSnapshot> {
    return this.approval_broker.set_mode(input.mode);
  }

  /** 处理当前 Session 的 pending 工具审批。 */
  async resolve_approval(input: ResolveSessionApprovalInput): Promise<SessionApprovalResult> {
    return await this.approval_broker.resolve(input);
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
  async messages(input?: ListSessionMessagesInput): Promise<SessionMessagePage> {
    return await this.recorder.list_messages(input);
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
      getModel: () => this.get_model(),
      getExecutor: () => this.executor.getExecutor(),
      prompt: async (input) => await this.prompt(input),
      stop: async () => await this.stop(),
      subscribe: (subscriber) => this.subscribe(subscriber),
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
      getAgentEnv: this.getAgentEnv,
      get_agent_plugins: this.get_agent_plugins,
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: async () =>
        await this.effective_agent_plugins.systemBlocks(),
      ensureConfigured: this.ensureConfiguredHook,
      getAgentModel: this.getAgentModel,
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

  private create_message_store(): JsonlSessionMessageStore {
    const session_dir_path = getSdkAgentSessionDirPath(
      this.projectRoot,
      this.agentId,
      this.id,
    );
    const messages_dir_path = `${session_dir_path}/messages`;
    return new JsonlSessionMessageStore({
      session_id: this.id,
      file_path: `${messages_dir_path}/active.jsonl`,
      assistant_message_file_path: getSdkAgentSessionAssistantMessagePath(
        this.projectRoot,
        this.agentId,
        this.id,
      ),
    });
  }

  private create_history_store(): SessionRecorderHistoryStore {
    return new SessionRecorderHistoryStore({
      session_id: this.id,
      recorder: this.recorder,
    });
  }

  private create_local_state(): SessionLocalState {
    return {
      sessionConfig: {},
      effective_session_config: {},
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
      getInstructionSystemBlocks: () =>
        this.effective_instruction_system_blocks.map((block) => ({ ...block })),
      getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
      getPluginSystemBlocks: async () =>
        await this.effective_agent_plugins.systemBlocks(),
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
        getInstructionSystemBlocks: () =>
          this.effective_instruction_system_blocks.map((block) => ({ ...block })),
        getManagedPluginSystemBlocks: this.getManagedPluginSystemBlocks,
        getPluginSystemBlocks: async () =>
          await this.effective_agent_plugins.systemBlocks(),
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
      getModel: () => this.get_model(),
      get_model_context_window: () => this.get_model_context_window(),
      logger: this.logger,
      systemComposer: system_composer,
      getTools: () => this.tools,
      getEnv: () => ({ ...this.effective_agent_env }),
      get_systems: () =>
        this.effective_instruction_system_blocks.map((block) => block.content),
      get_plugins: () => this.effective_agent_plugins,
      ...(context_composer ? { contextComposer: context_composer } : {}),
      ...(compaction_composer
        ? { compactionComposer: compaction_composer }
        : {}),
    });
  }

  /**
   * 返回当前 Session 实际使用的模型实例。
   *
   * 解析顺序固定为 Session 覆盖模型，其次回退到 Agent 模型。
   */
  get_model(): LanguageModel | undefined {
    return (
      this.localState.effective_session_config.model ||
      this.localState.sessionConfig.model ||
      this.getAgentModel()
    );
  }

  /** 读取当前有效模型对应的上下文窗口。 */
  private get_model_context_window(): number | undefined {
    return (
      this.localState.effective_session_config.model_context_window ||
      this.localState.sessionConfig.model_context_window ||
      read_agent_model_context_window(this.get_model())
    );
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
