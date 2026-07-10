/**
 * SessionStateService：本地 Session 状态与持久化服务。
 *
 * 关键点（中文）
 * - 统一管理本地 Session 的初始化、配置、标题、metadata 与消息持久化。
 * - 该服务只关心状态事实源与持久化副作用，不负责 turn 编排。
 * - `Session` facade 与 turn/view service 都通过它访问可变 session 运行态。
 */

import {
  inferAgentModelLabel,
  normalizeAgentModel,
} from "@/model/CityModelAdapter.js";
import {
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "@/session/storage/Metadata.js";
import { touchSessionMetadata } from "@/session/storage/Persistence.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";
import { persistSdkAssistantResult } from "@/session/storage/Persistence.js";
import { hydrateUserPromptFileParts } from "@executor/messages/SessionAttachmentMapper.js";
import type { Executor } from "@executor/Executor.js";
import type { JsonlSessionHistoryStore } from "@/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionSetInput,
} from "@/types/agent/AgentTypes.js";
import type {
  AgentSessionEvent,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  SessionActionRecordInputV1,
  SessionActionRecordV1,
  SessionRecordV1,
  SessionMessageRecordV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionRecords.js";
import { to_session_action_record } from "@/executor/types/SessionRecords.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import { generateId } from "@/utils/Id.js";
import type { Logger } from "@/utils/logger/Logger.js";

type SessionStateServiceOptions = {
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
   * 当前 session 执行器。
   */
  executor: Executor;

  /**
   * 当前 session 可变运行态。
   */
  state: SessionLocalState;

  /**
   * 当前 session 运行日志器。
   */
  logger: Logger;

  /**
   * 在执行前补齐宿主级配置。
   */
  ensure_configured_hook?: () => Promise<void>;

  /**
   * 发布 session 事件。
   */
  publish_event: (event: AgentSessionEvent) => void;
};

type SessionSetOptions = {
  /**
   * 是否写入并发布 model-switching action。
   *
   * 说明（中文）
   * - 公开 `session.set()` 应保持默认开启。
   * - fork 内部复制模型配置时关闭，避免污染 forked session 历史。
   */
  emit_action?: boolean;
};

type EmitActionInput = SessionActionRecordInputV1 | SessionActionRecordV1;

/**
 * 本地 Session 状态与持久化服务。
 */
export class SessionStateService {
  private readonly agent_id: string;
  private readonly project_root: string;
  private readonly session_id: string;
  private readonly history_store: JsonlSessionHistoryStore;
  private readonly executor: Executor;
  private readonly state: SessionLocalState;
  private readonly logger: Logger;
  private readonly ensure_configured_hook?: SessionStateServiceOptions["ensure_configured_hook"];
  private readonly publish_event: SessionStateServiceOptions["publish_event"];

  constructor(options: SessionStateServiceOptions) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.session_id = options.session_id;
    this.history_store = options.history_store;
    this.executor = options.executor;
    this.state = options.state;
    this.logger = options.logger;
    this.ensure_configured_hook = options.ensure_configured_hook;
    this.publish_event = options.publish_event;
  }

  /**
   * 读取当前 session 配置快照。
   */
  get_config(): AgentSessionConfigSnapshot {
    return {
      ...this.state.sessionConfig,
    };
  }

  /**
   * 读取当前 session 创建时间。
   */
  get_created_at(): number {
    return this.state.createdAt;
  }

  /**
   * 读取当前 session 参考时区。
   */
  get_timezone(): string {
    return this.state.timezone;
  }

  /**
   * 初始化当前 session metadata 与内存快照。
   */
  async initialize(): Promise<void> {
    if (this.state.initializePromise) {
      await this.state.initializePromise;
      return;
    }
    this.state.initializePromise = (async () => {
      const metadata = await readSessionMetadata({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
      });
      const created_at =
        typeof metadata.createdAt === "number" ? metadata.createdAt : Date.now();
      const timezone =
        typeof metadata.timezone === "string" && metadata.timezone.trim()
          ? metadata.timezone.trim()
          : resolveSystemTimezone();
      await writeSessionMetadata({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
        meta: {
          ...metadata,
          agentId: this.agent_id,
          createdAt: created_at,
          timezone,
        },
      });
      this.state.createdAt = created_at;
      this.state.timezone = timezone;
      this.state.sessionConfig = {
        ...(metadata.modelLabel
          ? { modelLabel: metadata.modelLabel }
          : {}),
      };
    })();
    await this.state.initializePromise;
  }

  /**
   * 在执行前确保当前 session 已完成初始化与宿主装配。
   */
  async ensure_ready_for_execution(): Promise<void> {
    await this.initialize();
    if (this.state.ensureConfiguredPromise) {
      await this.state.ensureConfiguredPromise;
      return;
    }
    this.state.ensureConfiguredPromise = (async () => {
      if (!this.ensure_configured_hook) return;
      await this.ensure_configured_hook();
    })();
    try {
      await this.state.ensureConfiguredPromise;
    } catch (error) {
      this.state.ensureConfiguredPromise = null;
      throw error;
    }
  }

  /**
   * 在 prompt 执行前确保当前 session 已可运行。
   */
  async ensure_runnable(): Promise<void> {
    await this.ensure_ready_for_execution();
    if (!this.state.sessionConfig.model) {
      throw new Error("requires a configured model.");
    }
  }

  /**
   * 写入当前 session 配置。
   */
  async set(input: AgentSessionSetInput, options?: SessionSetOptions): Promise<void> {
    const should_emit_action = options?.emit_action !== false;
    const previous_model_label = this.state.sessionConfig.modelLabel;
    const next_model_label = input.model
      ? inferAgentModelLabel(input.model)
      : undefined;
    const should_emit_model_switch_action = Boolean(
      input.model &&
        should_emit_action &&
        this.state.sessionConfig.model &&
        previous_model_label &&
        next_model_label &&
        previous_model_label !== next_model_label,
    );
    const action_id = `model-switching:${this.session_id}:${Date.now()}:${generateId()}`;

    if (should_emit_model_switch_action) {
      await this.emit_action_event({
        id: action_id,
        title: "Switching session model",
        description: next_model_label
          ? `Switching to ${next_model_label}.`
          : undefined,
        state: "running",
      });
    }

    try {
      if (input.model) {
        this.state.sessionConfig.model = normalizeAgentModel(input.model);
        this.state.sessionConfig.modelLabel = next_model_label;
      }
      await patchSessionModelLabel({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
        model: this.state.sessionConfig.model,
      });
    } catch (error) {
      if (should_emit_model_switch_action) {
        await this.emit_action_event({
          id: action_id,
          title: "Session model switch failed",
          description: error instanceof Error ? error.message : String(error),
          state: "failed",
        });
      }
      throw error;
    }

    if (should_emit_model_switch_action) {
      await this.emit_action_event({
        id: action_id,
        title: "Session model switched",
        description: this.state.sessionConfig.modelLabel
          ? `Using ${this.state.sessionConfig.modelLabel}.`
          : undefined,
        state: "completed",
      });
    }
  }

  /**
   * 追加一条 user 消息并刷新标题与 metadata。
   */
  async append_user_message(params: {
    message?: SessionRecordV1 | null;
    text?: string;
  }): Promise<void> {
    await this.executor.append_user_message(params);
    await this.ensure_title_from_history({ generate: true });
    await this.touch_metadata();
  }

  /**
   * 追加一条 assistant 消息并刷新 metadata。
   */
  async append_assistant_message(params: {
    message?: SessionRecordV1 | null;
    fallbackText?: string;
  }): Promise<void> {
    await this.executor.append_assistant_message(params);
    await this.touch_metadata();
  }

  /**
   * 仅刷新当前 session metadata。
   */
  async touch_metadata(): Promise<void> {
    await touchSessionMetadata({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      sessionConfig: this.state.sessionConfig,
    });
  }

  /**
   * 确保当前 session 已持久化 title。
   */
  async ensure_title_from_history(input?: {
    /**
     * 是否允许调用模型生成标题。
     */
    generate?: boolean;
  }): Promise<void> {
    const messages = await this.history_store.list_records();
    const before_metadata = await readSessionMetadata({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
    });
    const before_title = String(before_metadata.title || "").trim();
    const next_metadata = await ensureSessionTitle({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      messages,
      ...(input?.generate ? { model: this.state.sessionConfig.model } : {}),
      ...(this.state.sessionConfig.modelLabel
        ? { modelLabel: this.state.sessionConfig.modelLabel }
        : {}),
      logger: this.logger,
      generate: input?.generate === true,
    });
    const next_title = String(next_metadata.title || "").trim();
    if (!next_title || next_title === before_title) return;
    this.publish_event({
      type: "session-title",
      sessionId: this.session_id,
      title: next_title,
    });
  }

  /**
   * 持久化最终 assistant 结果。
   */
  async persist_assistant_result(
    assistant_message?: SessionMessageRecordV1 | null,
  ): Promise<void> {
    await persistSdkAssistantResult({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      sessionConfig: this.state.sessionConfig,
      executor: this.executor,
      assistantMessage: assistant_message,
    });
  }

  /**
   * 持久化一条 action record。
   */
  async persist_action_event(
    event: SessionActionRecordV1,
  ): Promise<void> {
    const message = to_session_action_record(event, this.session_id);
    await this.history_store.write_record(message);
    await this.touch_metadata();
  }

  /**
   * 写入并发布一条 action。
   */
  async emit_action_event(input: EmitActionInput): Promise<void> {
    const event = to_session_action_record(
      {
        ...input,
        id:
          String(input.id || "").trim() ||
          `action:${this.session_id}:${Date.now()}:${generateId()}`,
      },
      this.session_id,
    );
    try {
      await this.persist_action_event(event);
    } catch {
      // action 持久化失败不应阻断宿主操作。
    }
    this.publish_event(event);
  }

  /**
   * 构造并持久化一条 prompt user 消息。
   */
  async create_and_persist_user_prompt_message(
    input: AgentSessionPromptInput,
  ): Promise<SessionUserMessageV1> {
    const query = input.query;
    if (typeof query === "string") {
      const message = this.history_store.userText({
        text: query.trim(),
        metadata: {
          sessionId: this.session_id,
        },
      }) as SessionUserMessageV1;
      await this.executor.append_user_message({
        message,
      });
      await this.ensure_title_from_history({ generate: true });
      await this.touch_metadata();
      return message;
    }

    // query 是 parts 数组，先把本地图片附件转换为模型可消费的 data URL。
    const parts = await hydrateUserPromptFileParts(
      Array.isArray(query) ? query : [],
      this.project_root,
    );
    const message: SessionUserMessageV1 = {
      id: `u:${this.session_id}:${generateId()}`,
      role: "user",
      parts,
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId: this.session_id,
        source: "ingress",
        kind: "normal",
      },
    };
    await this.executor.append_user_message({
      message,
    });
    await this.ensure_title_from_history({ generate: true });
    await this.touch_metadata();
    return message;
  }

  /**
   * 持久化本轮执行期间延迟写入的 user 消息。
   */
  async persist_deferred_user_messages(
    deferred_messages?: SessionUserMessageV1[],
  ): Promise<void> {
    const normalized_messages = Array.isArray(deferred_messages)
      ? deferred_messages
      : [];
    if (normalized_messages.length <= 0) return;
    for (const message of normalized_messages) {
      await this.executor.append_user_message({
        message,
      });
    }
    await this.touch_metadata();
  }
}
