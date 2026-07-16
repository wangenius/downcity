/**
 * SDK 本地 Session 封装。
 *
 * 关键点（中文）
 * - 面向 `new Agent(...)` 的本地会话使用场景。
 * - 对外保留稳定 Session facade，把状态、turn、view 逻辑下沉到独立 service。
 * - 内部使用 `SessionMessages` 统一管理 Active、Segment 与流式 Assistant 草稿。
 */

import { Executor } from "@executor/Executor.js";
import type { LanguageModel, Tool } from "ai";
import {
  normalizeAgentModel,
  read_agent_model_context_window,
  type AgentModel,
} from "@/agent/AgentModel.js";
import { JsonlSessionMessageStore } from "@/session/messages/JsonlSessionMessageStore.js";
import { SessionMessages } from "@/session/SessionMessages.js";
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
import { createRuntimeSessionPort } from "@/session/storage/RuntimeSessionPort.js";
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
import { SessionState } from "@/session/SessionState.js";
import { SessionTurn } from "@/session/SessionTurn.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import type {
  AgentSessionCommand,
  SessionQueueCommand,
} from "@/types/session/SessionQueue.js";
import type { SessionOptions } from "@/types/session/SessionOptions.js";
import type { AgentPluginExecutionRuntime } from "@/types/plugin/PluginRuntime.js";
import { SessionApprovalBroker } from "@/session/approval/SessionApprovalBroker.js";
import { DefaultSessionComposer } from "@/session/DefaultSessionComposer.js";
import type {
  SessionComposer,
  SessionCompactionPlan,
  SessionComposeInput,
  SessionStepInput,
} from "@/types/session/SessionComposer.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";
import { generateId } from "@/utils/Id.js";
import { nanoid } from "nanoid";
import { buildSessionInfo } from "@/session/browse/Browse.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";
import { readSessionMetadata } from "@/session/storage/Metadata.js";
import { to_executor_history } from "@/session/messages/SessionMessageCodec.js";
import type { SessionMessage } from "@/types/session/SessionMessage.js";
import type {
  SessionActionRecordInputV1,
  SessionActionRecordV1,
} from "@/executor/types/SessionRecords.js";

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
  private readonly ensureConfiguredHook?: SessionOptions["ensureConfigured"];
  private readonly composer: SessionComposer;
  private readonly messageStore: JsonlSessionMessageStore;
  private readonly session_messages: SessionMessages;
  private readonly executor: Executor;
  private readonly eventHub: SessionEventHub;
  private readonly approval_broker: SessionApprovalBroker;
  private readonly localState: SessionLocalState;
  private readonly getAgentEnv: SessionOptions["getAgentEnv"];
  private readonly getAgentModel: SessionOptions["getAgentModel"];
  private readonly get_agent_plugins: SessionOptions["get_agent_plugins"];
  private effective_instruction_system_blocks: AgentSessionSystemBlock[];
  private effective_agent_env: Record<string, string>;
  private effective_agent_plugins: AgentPluginExecutionRuntime;
  private readonly stateService: SessionState;
  private readonly session_turn: SessionTurn;
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
    this.ensureConfiguredHook = options.ensureConfigured;
    this.composer = options.composer || new DefaultSessionComposer();
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
    this.session_messages = new SessionMessages({
      session_id: this.id,
      store: this.messageStore,
      publish: (mutation) => {
        this.eventHub.publish(mutation);
      },
    });
    this.approval_broker = new SessionApprovalBroker({
      session_id: this.id,
      messages: this.session_messages,
    });
    this.localState = this.create_local_state();
    this.executor = this.create_executor();
    this.stateService = new SessionState({
      agent_id: this.agentId,
      project_root: this.projectRoot,
      session_id: this.id,
      messages: this.session_messages,
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
    this.session_turn = new SessionTurn({
      session_id: this.id,
      project_root: this.projectRoot,
      executor: this.executor,
      state: this.stateService,
      events: this.eventHub,
      messages: this.session_messages,
      approvals: this.approval_broker,
      apply_command: async (command, turn_id) =>
        await this.apply_queue_command(command, turn_id),
    });
  }

  /**
   * 初始化当前 session。
   */
  async initialize(): Promise<this> {
    await this.session_messages.initialize();
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
      this.session_turn.enqueue_command(configured.command);
    }
  }

  /**
   * 追加一条新的 Session prompt。
   */
  async prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle> {
    return await this.session_turn.prompt(input);
  }

  /**
   * 停止当前 turn，并取消尚未被吸收的排队 prompt。
   */
  async stop(): Promise<AgentSessionStopResult> {
    await this.approval_broker.expire_all();
    return this.session_turn.stop();
  }

  /**
   * 把一次显式历史压缩加入当前 Session 的有序输入队列。
   */
  async compact(): Promise<void> {
    await this.session_turn.compact();
  }

  /**
   * 把 Agent configured state command 加入当前 Session 的统一输入队列。
   */
  enqueue_agent_command(command: AgentSessionCommand): void {
    if (command.type === "instruction") {
      this.session_turn.enqueue_command({
        type: "agent_instruction",
        command_id: command.command_id,
        instruction_blocks: command.instruction_blocks,
      });
      return;
    }
    if (command.type === "env") {
      this.session_turn.enqueue_command({
        type: "agent_env",
        command_id: command.command_id,
        env: command.env,
      });
      return;
    }
    this.session_turn.enqueue_command({
      type: "agent_plugins",
      command_id: command.command_id,
      title: command.title,
      plugins: command.plugins,
    });
  }

  /** 在 Step 检查点提交明确的 Session/Agent 状态命令。 */
  private async apply_queue_command(
    command: Exclude<SessionQueueCommand, { type: "compact" }>,
    turn_id: string,
  ): Promise<void> {
    if (command.type === "session_model") {
      await this.stateService.apply_model_command(command);
      if (command.action_id && command.action_title) {
        await this.emit_config_action_event({
          id: command.action_id,
          title: command.action_title,
          state: "completed",
          turnId: turn_id,
        });
      }
      return;
    }
    if (command.type === "agent_instruction") {
      this.effective_instruction_system_blocks = command.instruction_blocks.map(
        (block) => ({ ...block }),
      );
      await this.emit_config_action_event({
        id: `agent-instruction:${this.id}:${command.command_id}`,
        title: "Agent instruction updated",
        state: "completed",
        turnId: turn_id,
      });
      return;
    }
    if (command.type === "agent_env") {
      this.effective_agent_env = { ...command.env };
      await this.emit_config_action_event({
        id: `agent-env:${this.id}:${command.command_id}`,
        title: "Agent environment updated",
        state: "completed",
        turnId: turn_id,
      });
      return;
    }
    this.effective_agent_plugins = command.plugins;
    await this.emit_config_action_event({
      id: `agent-plugins:${this.id}:${command.command_id}`,
      title: command.title,
      state: "completed",
      turnId: turn_id,
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
    const appended = await this.session_messages.append_external_user_message({
      text: String(input.text || "").trim(),
    });
    if (!appended) return;
    await this.stateService.ensure_title_from_history({ generate: true });
    await this.stateService.touch_metadata();
  }

  /**
   * 追加一条 assistant 文本消息。
   */
  async append_assistant_message(input: {
    text: string;
  }): Promise<void> {
    const appended = await this.session_messages.append_external_assistant_message({
      fallback_text: String(input.text || "").trim(),
    });
    if (appended) await this.stateService.touch_metadata();
  }

  /**
   * 读取当前 session 详情。
   */
  async get_info(): Promise<AgentSessionInfo> {
    const [metadata, snapshot] = await Promise.all([
      readSessionMetadata({
        projectRoot: this.projectRoot,
        agentId: this.agentId,
        sessionId: this.id,
      }),
      this.session_messages.context_snapshot(),
    ]);
    const records = to_executor_history(this.id, snapshot);
    const metadata_with_title = metadata.title
      ? metadata
      : await ensureSessionTitle({
          projectRoot: this.projectRoot,
          agentId: this.agentId,
          sessionId: this.id,
          messages: records,
          logger: this.logger,
        });
    return buildSessionInfo({
      projectRoot: this.projectRoot,
      agentId: this.agentId,
      sessionId: this.id,
      metadata: metadata_with_title,
      messages: records,
      executing: this.isExecuting(),
    });
  }

  /**
   * 读取当前 session records 分页。
   */
  async messages(input?: ListSessionMessagesInput): Promise<SessionMessagePage> {
    return await this.session_messages.list_messages(input);
  }

  /**
   * 读取当前 session 生效的 system 快照。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    const composed = await this.compose_for_view();
    const blocks = resolve_composed_system_blocks(composed);
    return {
      sessionId: this.id,
      session: {
        agentId: this.agentId,
        sessionId: this.id,
        projectRoot: this.projectRoot,
        createdAt: new Date(this.stateService.get_created_at()).toISOString(),
        timezone: this.stateService.get_timezone(),
      },
      blocks,
    };
  }

  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean {
    return this.session_turn.isActive() || this.executor.isExecuting();
  }

  /**
   * 从当前 session 创建一个分叉会话。
   */
  async fork(input?: AgentSessionForkInput | string): Promise<this> {
    const message_id = typeof input === "string"
      ? String(input || "").trim() || undefined
      : String(input?.messageId || "").trim() || undefined;
    const messages = await this.session_messages.list_history_messages();
    const fork_messages = message_id
      ? this.resolve_fork_messages(messages, message_id)
      : messages;
    const action_id = `history-forking:${this.id}:${Date.now()}:${nanoid(8)}`;
    await this.emit_action_event({
      id: action_id,
      title: "Forking session messages",
      description: `Preparing ${String(fork_messages.length)} messages for the new session.`,
      state: "running",
    });
    try {
      const forked = this.create_fork_session(
        `fork-${Date.now()}-${nanoid(8)}`,
      );
      await forked.initialize();
      const session_config = this.stateService.get_config();
      if (session_config.model) {
        await forked.stateService.set(
          { model: session_config.model },
          { emit_action: false },
        );
      }
      await forked.session_messages.import_messages(fork_messages);
      await this.emit_action_event({
        id: action_id,
        title: "Session messages forked",
        description: `Created ${forked.id} with ${String(fork_messages.length)} messages.`,
        state: "completed",
      });
      return forked;
    } catch (error) {
      await this.emit_action_event({
        id: action_id,
        title: "Session messages fork failed",
        description: error instanceof Error ? error.message : String(error),
        state: "failed",
      });
      throw error;
    }
  }

  /** 截取 Fork 目标 Message 及其之前的完整历史。 */
  private resolve_fork_messages(
    messages: SessionMessage[],
    message_id: string,
  ): SessionMessage[] {
    const target_index = messages.findIndex(
      (message) => message.message_id === message_id,
    );
    if (target_index < 0) {
      throw new Error(
        `Cannot fork session "${this.id}": messageId "${message_id}" not found.`,
      );
    }
    return messages.slice(0, target_index + 1);
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
        const appended = await this.session_messages.append_external_user_message(
          message_params,
        );
        if (!appended) return;
        await this.stateService.ensure_title_from_history({ generate: true });
        await this.stateService.touch_metadata();
      },
      append_assistant_message: async (message_params) => {
        const appended = await this.session_messages.append_external_assistant_message({
          message: message_params.message,
          fallback_text: message_params.fallbackText,
        });
        if (appended) await this.stateService.touch_metadata();
      },
      isExecuting: () => this.isExecuting(),
      context: async () => await this.session_messages.context_snapshot(),
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
      ensureConfigured: this.ensureConfiguredHook,
      getAgentModel: this.getAgentModel,
      composer: this.composer,
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

  /** 创建只依赖统一 Composer 的 Turn Executor。 */
  private create_executor(): Executor {
    return new Executor({
      sessionId: this.id,
      composer: this.composer,
      get_compose_input: async (run_context, retry_count) =>
        await this.create_compose_input(run_context, retry_count),
      commit_compaction: async (plan, run_context) =>
        await this.commit_compaction_plan(plan, run_context),
      getModel: () => this.get_model(),
      logger: this.logger,
      get_plugins: () => this.effective_agent_plugins,
    });
  }

  /** 为 Composer 创建当前 Step 的只读 Session 快照。 */
  private async create_compose_input(
    run_context: SessionRunContext,
    retry_count: number,
  ): Promise<SessionComposeInput> {
    const plugin_system_blocks = run_context.agentPlugins
      ? await run_context.agentPlugins.systemBlocks(run_context)
      : await this.effective_agent_plugins.systemBlocks(run_context);
    return {
      session: {
        agent_id: this.agentId,
        session_id: this.id,
        project_root: this.projectRoot,
        created_at: this.localState.createdAt,
        timezone: this.localState.timezone,
      },
      state: {
        model: this.get_model(),
        model_context_window: this.get_model_context_window(),
        env: Object.freeze({ ...this.effective_agent_env }),
        systems: Object.freeze(
          this.effective_instruction_system_blocks.map(
            (block) => block.content,
          ),
        ),
        tools: Object.freeze({ ...this.tools }),
        instruction_system_blocks:
          this.effective_instruction_system_blocks.map(
            (block) => ({ ...block }),
          ),
        managed_plugin_system_blocks:
          await this.getManagedPluginSystemBlocks(),
        plugin_system_blocks,
      },
      history: await this.session_messages.context_snapshot(),
      turn: {
        ...(run_context.turnId ? { turn_id: run_context.turnId } : {}),
        retry_count,
      },
    };
  }

  /** 使用统一 Composer 生成只读 system/history 查询结果。 */
  private async compose_for_view(): Promise<SessionStepInput> {
    const run_context: SessionRunContext = {
      sessionId: this.id,
      injectedUserMessages: [],
      deferredPersistedUserMessages: [],
      pendingAssistantFileParts: [],
    };
    return await this.composer.compose(
      await this.create_compose_input(run_context, 0),
    );
  }

  /** 提交 Composer 生成的 Segment 压缩计划。 */
  private async commit_compaction_plan(
    plan: SessionCompactionPlan,
    run_context: SessionRunContext,
  ): Promise<void> {
    const action_id = `compacting:${this.id}:${generateId()}`;
    await this.emit_action_event({
      id: action_id,
      title: "Compacting session messages",
      state: "running",
      ...(run_context.turnId ? { turnId: run_context.turnId } : {}),
    });
    try {
      await this.session_messages.compact_active({
        through_sequence: plan.through_sequence,
        summary: plan.summary,
      });
      await this.emit_action_event({
        id: action_id,
        title: "Session messages compacted",
        description: plan.used_fallback
          ? `Closed Active through Message ${plan.boundary_message_id} with deterministic fallback Summary.`
          : `Closed Active through Message ${plan.boundary_message_id}.`,
        state: "completed",
        ...(run_context.turnId ? { turnId: run_context.turnId } : {}),
      });
      await this.stateService.touch_metadata();
    } catch (error) {
      await this.emit_action_event({
        id: action_id,
        title: "Session messages compact failed",
        description: error instanceof Error ? error.message : String(error),
        state: "failed",
        ...(run_context.turnId ? { turnId: run_context.turnId } : {}),
      });
      throw error;
    }
  }

  /**
   * 返回当前 Session 实际使用的模型实例。
   *
   * 解析顺序固定为 Session 覆盖模型，其次回退到 Agent 模型。
   */
  get_model(): LanguageModel | undefined {
    const model = this.get_selected_model();
    return model ? normalizeAgentModel(model) : undefined;
  }

  /** 按 Session 优先、Agent 兜底规则读取当前配置的 AgentModel。 */
  private get_selected_model(): AgentModel | undefined {
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
      read_agent_model_context_window(this.get_selected_model())
    );
  }

  /** 持久化并发布一条 canonical Action Message。 */
  private async emit_action_event(input: SessionActionRecordInputV1): Promise<void> {
    const action_id = String(input.id || "").trim() ||
      `action:${this.id}:${Date.now()}`;
    await this.session_messages.persist_action_record({
      type: "action",
      id: action_id,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      state: input.state,
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId: this.id,
        ...(input.turnId ? { turnId: input.turnId } : {}),
      },
    });
    await this.stateService.touch_metadata();
  }

  /** 尽力记录配置 Action，不让 timeline 故障反向改变已提交配置。 */
  private async emit_config_action_event(
    input: SessionActionRecordInputV1 | SessionActionRecordV1,
  ): Promise<boolean> {
    try {
      await this.emit_action_event({
        id: input.id,
        title: input.title,
        description: input.description,
        state: input.state,
        turnId: "turnId" in input ? input.turnId : input.metadata?.turnId,
      });
      return true;
    } catch (error) {
      try {
        await this.logger.log("warn", "[agent] config action persistence failed", {
          sessionId: this.id,
          actionId: String(input.id || ""),
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // 配置已提交，日志失败也不能反向改变 effective state。
      }
      return false;
    }
  }

}

/** 把自定义 Composer 的 system content 转为可展示文本。 */
function stringify_system_content(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (content === null || content === undefined) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content || "").trim();
  }
}

/** 以实际模型输入为准，保留仍与其一致的 system block 来源信息。 */
function resolve_composed_system_blocks(
  composed: SessionStepInput,
): AgentSessionSystemBlock[] {
  const declared_blocks = composed.system_blocks || [];
  return composed.system.flatMap((message, index) => {
    const content = stringify_system_content(message.content);
    if (!content) return [];
    const declared = declared_blocks[index];
    if (declared && declared.content.trim() === content) {
      return [{ ...declared, content }];
    }
    return [{
      source: "session" as const,
      name: `custom_system:${index + 1}`,
      content,
    }];
  });
}
