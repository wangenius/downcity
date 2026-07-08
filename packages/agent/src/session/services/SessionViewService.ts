/**
 * SessionViewService：本地 Session 查询与派生视图服务。
 *
 * 关键点（中文）
 * - 统一管理 info/records/system/fork 这类读取型能力。
 * - 该服务只负责拼装查询结果，不负责编排 prompt turn。
 * - 需要写入持久化状态的地方仍委托给 SessionStateService。
 */

import { nanoid } from "nanoid";
import {
  buildSessionRecordsPage,
  buildSessionInfo,
  getSdkAgentSessionArchiveFilePath,
  ensureSessionTitle,
  loadSessionArchiveMessagesFromPath,
  readSessionMetadata,
} from "@/session/index.js";
import { buildSessionSystemBlocks } from "@/session/SessionSystemBuilder.js";
import type { JsonlSessionHistoryStore } from "@/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import type { SessionSystemComposer } from "@/executor/composer/system/SessionSystemComposer.js";
import type {
  AgentSessionForkInput,
  AgentSessionRecordsInput,
  AgentSessionRecordsPage,
  AgentSessionInfo,
  AgentSession,
  AgentSessionSystemBlock,
  AgentSessionSystemSnapshot,
} from "@/types/agent/AgentTypes.js";
import type { SessionRecordV1 } from "@/executor/types/SessionRecords.js";
import { SessionStateService } from "@/session/services/SessionStateService.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

type SessionViewServiceOptions<TSession extends Pick<AgentSession, "set">> = {
  /**
   * 当前 agent 稳定标识。
   */
  agent_id: string;

  /**
   * 当前项目根目录。
   */
  project_root: string;

  /**
   * 当前 session 标识。
   */
  session_id: string;

  /**
   * 当前 session 历史事实源。
   */
  history_store: JsonlSessionHistoryStore;

  /**
   * 当前 session 状态服务。
   */
  state_service: SessionStateService;

  /**
   * 判断当前 session 是否正在执行。
   */
  is_executing: () => boolean;

  /**
   * 读取 instruction system blocks。
   */
  get_instruction_system_blocks: () => AgentSessionSystemBlock[];

  /**
   * 读取受托管 plugin system blocks。
   */
  get_managed_plugin_system_blocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 读取显式注册 plugin system blocks。
   */
  get_plugin_system_blocks: () => Promise<AgentSessionSystemBlock[]>;

  /**
   * 可选自定义 system composer。
   *
   * 关键点（中文）
   * - 仅当调用方覆盖了 system composer 时传入。
   * - 默认 SDK system snapshot 仍保留 block 级来源信息。
   */
  custom_system_composer?: SessionSystemComposer;

  /**
   * 创建一个新的本地 Session 实例。
   */
  create_fork_session: (session_id: string) => Promise<{
    session: TSession;
    history_store: JsonlSessionHistoryStore;
    state_service: SessionStateService;
  }>;
};

/**
 * 本地 Session 查询与派生视图服务。
 */
export class SessionViewService<TSession extends Pick<AgentSession, "set">> {
  private readonly agent_id: string;
  private readonly project_root: string;
  private readonly session_id: string;
  private readonly history_store: JsonlSessionHistoryStore;
  private readonly state_service: SessionStateService;
  private readonly is_executing: SessionViewServiceOptions<TSession>["is_executing"];
  private readonly get_instruction_system_blocks: SessionViewServiceOptions<TSession>["get_instruction_system_blocks"];
  private readonly get_managed_plugin_system_blocks: SessionViewServiceOptions<TSession>["get_managed_plugin_system_blocks"];
  private readonly get_plugin_system_blocks: SessionViewServiceOptions<TSession>["get_plugin_system_blocks"];
  private readonly custom_system_composer?: SessionSystemComposer;
  private readonly create_fork_session: SessionViewServiceOptions<TSession>["create_fork_session"];

  constructor(options: SessionViewServiceOptions<TSession>) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.session_id = options.session_id;
    this.history_store = options.history_store;
    this.state_service = options.state_service;
    this.is_executing = options.is_executing;
    this.get_instruction_system_blocks = options.get_instruction_system_blocks;
    this.get_managed_plugin_system_blocks =
      options.get_managed_plugin_system_blocks;
    this.get_plugin_system_blocks = options.get_plugin_system_blocks;
    this.custom_system_composer = options.custom_system_composer;
    this.create_fork_session = options.create_fork_session;
  }

  /**
   * 读取当前 session 详情。
   */
  async get_info(): Promise<AgentSessionInfo> {
    const [metadata, messages] = await Promise.all([
      readSessionMetadata({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
      }),
      this.history_store.list_records(),
    ]);
    return await this.build_info({
      metadata,
      messages,
    });
  }

  private async build_info(input: {
    /**
     * 当前 session metadata。
     */
    metadata: Awaited<ReturnType<typeof readSessionMetadata>>;

    /**
     * 当前 session 消息列表。
     */
    messages: SessionRecordV1[];
  }): Promise<AgentSessionInfo> {
    const metadata_with_title = input.metadata.title
      ? input.metadata
      : await ensureSessionTitle({
          projectRoot: this.project_root,
          agentId: this.agent_id,
          sessionId: this.session_id,
          messages: input.messages,
        });
    return buildSessionInfo({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      metadata: metadata_with_title,
      messages: input.messages,
      executing: this.is_executing(),
    });
  }

  /**
   * 读取当前 session records 分页。
   */
  async records(
    input?: AgentSessionRecordsInput,
  ): Promise<AgentSessionRecordsPage> {
    const archive_id = String(input?.archive_id || "").trim();
    const [metadata, current_messages] = await Promise.all([
      readSessionMetadata({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
      }),
      this.history_store.list_records(),
    ]);
    const page_messages = archive_id
      ? await loadSessionArchiveMessagesFromPath(
          getSdkAgentSessionArchiveFilePath(
            this.project_root,
            this.agent_id,
            this.session_id,
            archive_id,
          ),
        )
      : current_messages;
    const session = await this.build_info({
      metadata,
      messages: current_messages,
    });
    return buildSessionRecordsPage({
      session,
      messages: page_messages,
      input,
    });
  }

  /**
   * 读取当前 session 生效的 system 快照。
   */
  async system(): Promise<AgentSessionSystemSnapshot> {
    const blocks = this.custom_system_composer
      ? await this.resolve_custom_system_blocks(this.custom_system_composer)
      : await buildSessionSystemBlocks({
          agentId: this.agent_id,
          projectRoot: this.project_root,
          sessionId: this.session_id,
          createdAt: this.state_service.get_created_at(),
          timezone: this.state_service.get_timezone(),
          getInstructionSystemBlocks: this.get_instruction_system_blocks,
          getManagedPluginSystemBlocks: this.get_managed_plugin_system_blocks,
          getPluginSystemBlocks: this.get_plugin_system_blocks,
        });
    return {
      sessionId: this.session_id,
      session: {
        agentId: this.agent_id,
        sessionId: this.session_id,
        projectRoot: this.project_root,
        createdAt: new Date(this.state_service.get_created_at()).toISOString(),
        timezone: this.state_service.get_timezone(),
      },
      blocks,
    };
  }

  private async resolve_custom_system_blocks(
    composer: SessionSystemComposer,
  ): Promise<AgentSessionSystemBlock[]> {
    const run_context: SessionRunContext = {
      sessionId: this.session_id,
      injectedUserMessages: [],
      deferredPersistedUserMessages: [],
      pendingAssistantFileParts: [],
    };
    const messages = await composer.resolve(run_context);
    const blocks: AgentSessionSystemBlock[] = [];
    messages.forEach((message, index) => {
      const content = this.stringify_system_content(
        (message as { content?: unknown }).content,
      );
      if (!content) return;
      blocks.push({
        source: "session",
        name: `${composer.name || "custom_system"}:${index + 1}`,
        content,
      });
    });
    return blocks;
  }

  /**
   * 从当前 session 创建一个分叉会话。
   */
  async fork(input?: AgentSessionForkInput | string): Promise<TSession> {
    const message_id =
      typeof input === "string"
        ? String(input || "").trim() || undefined
        : String(input?.messageId || "").trim() || undefined;
    const messages = await this.history_store.list_records();
    const fork_messages =
      !message_id
        ? messages
        : this.resolve_fork_messages(messages, message_id);
    const action_id = `history-forking:${this.session_id}:${Date.now()}:${nanoid(8)}`;

    await this.state_service.emit_action_event({
      id: action_id,
      title: "Forking session records",
      description: `Preparing ${String(fork_messages.length)} messages for the new session.`,
      state: "running",
    });

    try {
      const forked_bundle = await this.create_fork_session(
        `fork-${Date.now()}-${nanoid(8)}`,
      );
      const forked = forked_bundle.session;
      const session_config = this.state_service.get_config();
      if (session_config.model) {
        await forked_bundle.state_service.set(
          {
            model: session_config.model,
          },
          { emit_action: false },
        );
      }
      await this.append_fork_messages(forked_bundle, fork_messages);
      await this.state_service.emit_action_event({
        id: action_id,
        title: "Session records forked",
        description: `Created ${String((forked as { id?: unknown }).id || "")} with ${String(fork_messages.length)} messages.`,
        state: "completed",
      });
      return forked;
    } catch (error) {
      await this.state_service.emit_action_event({
        id: action_id,
        title: "Session records fork failed",
        description: error instanceof Error ? error.message : String(error),
        state: "failed",
      });
      throw error;
    }
  }

  private resolve_fork_messages(
    messages: SessionRecordV1[],
    message_id: string,
  ): SessionRecordV1[] {
    const target_index = messages.findIndex(
      (message) => String(message.id || "").trim() === message_id,
    );
    if (target_index < 0) {
      throw new Error(
        `Cannot fork session "${this.session_id}": messageId "${message_id}" not found.`,
      );
    }
    return messages.slice(0, target_index + 1);
  }

  private async append_fork_messages(
    forked_bundle: {
      history_store: JsonlSessionHistoryStore;
      state_service: SessionStateService;
    },
    messages: SessionRecordV1[],
  ): Promise<void> {
    await forked_bundle.history_store.write_records(messages);
  }

  private stringify_system_content(content: unknown): string {
    if (typeof content === "string") return content.trim();
    if (content === null || content === undefined) return "";
    try {
      return JSON.stringify(content);
    } catch {
      return String(content || "").trim();
    }
  }
}
