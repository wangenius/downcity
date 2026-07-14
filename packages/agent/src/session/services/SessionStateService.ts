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
  read_agent_model_context_window,
} from "@/model/CityModelAdapter.js";
import {
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "@/session/storage/Metadata.js";
import { touchSessionMetadata } from "@/session/storage/Persistence.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";
import { hydrateUserPromptFileParts } from "@executor/messages/SessionAttachmentMapper.js";
import type { Executor } from "@executor/Executor.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionSetInput,
} from "@/types/agent/SessionTypes.js";
import type { SessionMutation } from "@/types/session/SessionMutation.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  SessionActionRecordInputV1,
  SessionActionRecordV1,
  SessionRecordV1,
  SessionMessageRecordV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import type { SessionRuntimeConfigMutation } from "@/types/session/SessionConfigMutation.js";
import { generateId } from "@/utils/Id.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { AgentModel } from "@/model/CityModelAdapter.js";
import { SessionRecorder } from "@/session/recorder/SessionRecorder.js";
import { normalize_session_user_parts } from "@/session/recorder/SessionRecorder.js";
import {
  from_ui_assistant_parts,
  from_ui_user_parts,
  to_executor_ui_message,
} from "@/session/recorder/SessionMessageCodec.js";
import type { SessionMessage } from "@/types/session/SessionMessage.js";

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
  history_store: SessionHistoryStore;

  /** 当前 Session Message Recorder。 */
  recorder: SessionRecorder;

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

  /** 按稳定 ID 解析当前 Session 的运行时模型。 */
  resolve_model?: (model_id: string) => Promise<AgentModel>;

  /**
   * 发布 session 事件。
   */
  publish_event: (mutation: SessionMutation) => void;
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
 * Session 配置成功写入后的队列提交结果。
 */
export interface SessionConfiguredMutationResult {
  /**
   * 等待在下一 Session step 检查点提交的 mutation。
   *
   * 说明（中文）
   * - 输入未产生实际配置变化时为空。
   * - fork 等内部初始化路径可以选择立即提交而不返回 mutation。
   */
  mutation?: SessionRuntimeConfigMutation;
}

/**
 * 本地 Session 状态与持久化服务。
 */
export class SessionStateService {
  private readonly agent_id: string;
  private readonly project_root: string;
  private readonly session_id: string;
  private readonly history_store: SessionHistoryStore;
  private readonly recorder: SessionRecorder;
  private readonly executor: Executor;
  private readonly state: SessionLocalState;
  private readonly logger: Logger;
  private readonly ensure_configured_hook?: SessionStateServiceOptions["ensure_configured_hook"];
  private readonly resolve_model?: SessionStateServiceOptions["resolve_model"];
  private readonly publish_event: SessionStateServiceOptions["publish_event"];

  constructor(options: SessionStateServiceOptions) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.session_id = options.session_id;
    this.history_store = options.history_store;
    this.recorder = options.recorder;
    this.executor = options.executor;
    this.state = options.state;
    this.logger = options.logger;
    this.ensure_configured_hook = options.ensure_configured_hook;
    this.resolve_model = options.resolve_model;
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
        ...(metadata.modelId ? { modelId: metadata.modelId } : {}),
      };
      await this.restore_persisted_model();
      this.state.effective_session_config = {
        ...this.state.sessionConfig,
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
  async set(
    input: AgentSessionSetInput,
    options?: SessionSetOptions,
  ): Promise<SessionConfiguredMutationResult> {
    const should_emit_action = options?.emit_action !== false;
    const previous_model_label = this.state.sessionConfig.modelLabel;
    const previous_model_id = String(
      this.state.sessionConfig.modelId || previous_model_label || "",
    ).trim();
    const requested_model_id = String(input.modelId || "").trim();
    const next_model = input.model || (requested_model_id
      ? await this.resolve_model_by_id(requested_model_id)
      : undefined);
    const next_model_label = next_model
      ? inferAgentModelLabel(next_model)
      : undefined;
    const next_model_id = requested_model_id || next_model_label || "";
    const should_emit_model_switch_action = Boolean(
      next_model &&
        should_emit_action &&
        this.state.sessionConfig.model &&
        previous_model_id &&
        next_model_id &&
        previous_model_id !== next_model_id,
    );
    const previous_model_name = previous_model_label || previous_model_id;
    const next_model_name = next_model_label || next_model_id;
    const action_id = `model-switching:${this.session_id}:${Date.now()}:${generateId()}`;

    try {
      const next_config: AgentSessionConfigSnapshot = {
        ...this.state.sessionConfig,
      };
      if (next_model) {
        next_config.model = normalizeAgentModel(next_model);
        next_config.modelLabel = next_model_label;
        next_config.model_context_window =
          read_agent_model_context_window(next_model);
      }
      if (next_model_id) {
        next_config.modelId = next_model_id;
      }
      await patchSessionModelLabel({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
        model: next_config.model,
        modelId: next_config.modelId,
      });
      this.state.sessionConfig = next_config;

      const apply_effective_config = async (turn_id?: string): Promise<void> => {
        this.state.effective_session_config = {
          ...next_config,
        };
        if (!should_emit_model_switch_action) return;
        await this.emit_config_action_event({
          id: action_id,
          title: `Session model switched from ${previous_model_name} to ${next_model_name}`,
          state: "completed",
          ...(turn_id ? { turnId: turn_id } : {}),
        });
      };

      if (options?.emit_action === false) {
        await apply_effective_config();
        return {};
      }

      const mutation_id = generateId();
      return {
        mutation: {
          mutation_id,
          scope: "session",
          apply: async ({ turn_id }) => {
            await apply_effective_config(turn_id);
          },
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /** 恢复 metadata 中持久化的模型覆盖。 */
  private async restore_persisted_model(): Promise<void> {
    const model_id = String(this.state.sessionConfig.modelId || "").trim();
    if (!model_id || this.state.sessionConfig.model) return;
    const model = await this.resolve_model_by_id(model_id);
    this.state.sessionConfig.model = normalizeAgentModel(model);
    this.state.sessionConfig.modelLabel = inferAgentModelLabel(model);
    this.state.sessionConfig.model_context_window =
      read_agent_model_context_window(model);
  }

  /** 使用宿主 resolver 解析稳定模型 ID。 */
  private async resolve_model_by_id(model_id: string): Promise<AgentModel> {
    if (!this.resolve_model) {
      throw new Error("Session model resolver is not configured.");
    }
    return await this.resolve_model(model_id);
  }

  /**
   * 追加一条 user 消息并刷新标题与 metadata。
   */
  async append_user_message(params: {
    message?: SessionRecordV1 | null;
    text?: string;
  }): Promise<void> {
    const parts = params.message && "role" in params.message
      ? from_ui_user_parts(params.message.parts)
      : [{
          part_id: `external-user-text:${Date.now()}`,
          type: "text" as const,
          text: String(params.text || "").trim(),
          state: "done" as const,
        }];
    if (parts.length === 0) return;
    await this.recorder.append_user_message({
      turn_id: `external:${this.session_id}:${Date.now()}`,
      input_type: "prompt",
      parts,
    });
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
    const parts = params.message && "role" in params.message
      ? from_ui_assistant_parts(params.message.parts)
      : [{
          part_id: `external-assistant-text:${Date.now()}`,
          sequence: 1,
          type: "text" as const,
          text: String(params.fallbackText || "").trim(),
          state: "done" as const,
        }];
    if (parts.length === 0) return;
    await this.recorder.append_completed_assistant_message({ parts });
    await this.touch_metadata();
  }

  /**
   * 仅刷新当前 session metadata。
   */
  async touch_metadata(): Promise<void> {
    const stats = await this.recorder.storage_stats();
    const preview_text = resolve_message_preview(
      stats.latest_message || undefined,
    ).slice(0, 180);
    await touchSessionMetadata({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      sessionConfig: this.state.sessionConfig,
      message_count: stats.message_count,
      history_bytes: stats.history_bytes,
      ...(preview_text ? { preview_text } : {}),
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
      mutation_id: generateId(),
      variant: "session",
      type: "title",
      session_id: this.session_id,
      created_at: Date.now(),
      title: next_title,
    });
  }

  /**
   * 持久化最终 assistant 结果。
   */
  async persist_assistant_result(
    assistant_message?: SessionMessageRecordV1 | null,
  ): Promise<void> {
    void assistant_message;
    await this.touch_metadata();
  }

  /**
   * 持久化一条 action record。
   */
  async persist_action_event(
    event: SessionActionRecordV1,
  ): Promise<void> {
    const existing = this.recorder.get_message(event.id);
    if (!existing) {
      const writer = await this.recorder.open_action_message({
        message_id: event.id,
        turn_id: event.metadata.turnId,
        action_type: infer_action_type(event.id),
        title: event.title,
        description: event.description,
      });
      if (event.state === "completed") await writer.complete();
      if (event.state === "failed") await writer.fail(event.description || event.title);
    } else if (existing.type === "action" && event.state !== "running") {
      await this.recorder.update_action_message(event.id, event.state, {
        title: event.title,
        description: event.description,
      });
    }
    await this.touch_metadata();
  }

  /**
   * 写入并发布一条 action。
   */
  async emit_action_event(input: EmitActionInput): Promise<void> {
    const action_id = String(input.id || "").trim() ||
      `action:${this.session_id}:${Date.now()}`;
    const turn_id = "turnId" in input
      ? input.turnId
      : input.metadata?.turnId;
    await this.persist_action_event({
      type: "action",
      id: action_id,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      state: input.state,
      metadata: {
        v: 1,
        ts: input.metadata?.ts || Date.now(),
        sessionId: this.session_id,
        ...(turn_id
          ? { turnId: turn_id }
          : {}),
      },
    });
  }

  /**
   * 尽力写入配置生效 action，不让 timeline 故障改变 effective state。
   */
  async emit_config_action_event(input: EmitActionInput): Promise<boolean> {
    try {
      await this.emit_action_event(input);
      return true;
    } catch (error) {
      try {
        await this.logger.log("warn", "[agent] config action persistence failed", {
          sessionId: this.session_id,
          actionId: String(input.id || ""),
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // 配置已经提交，日志失败也不能反向改变 effective state。
      }
      return false;
    }
  }

  /**
   * 构造并持久化一条 prompt user 消息。
   */
  async create_and_persist_user_prompt_message(
    input: AgentSessionPromptInput,
    turn_id: string,
    input_type: "prompt" | "steer" = "prompt",
  ): Promise<SessionUserMessageV1> {
    const query = input.query;
    const ui_parts = typeof query === "string"
      ? [{ type: "text" as const, text: query.trim() }]
      : await hydrateUserPromptFileParts(
          Array.isArray(query) ? query : [],
          this.project_root,
        );
    const canonical = await this.recorder.append_user_message({
      turn_id,
      input_type,
      parts: normalize_session_user_parts(ui_parts),
    });
    const message = to_executor_ui_message(canonical) as SessionUserMessageV1;
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
      await this.recorder.append_user_message({
        turn_id: String(message.metadata?.turnId || `deferred:${this.session_id}:${Date.now()}`),
        input_type: "steer",
        parts: from_ui_user_parts(message.parts),
      });
    }
    await this.touch_metadata();
  }
}

function resolve_message_preview(message: SessionMessage | undefined): string {
  if (!message) return "";
  if (message.type === "user") {
    return message.parts
      .flatMap((part) => part.type === "text" ? [part.text] : [])
      .join("")
      .trim();
  }
  if (message.type === "assistant") {
    return message.parts
      .flatMap((part) => part.type === "text" ? [part.text] : [])
      .join("")
      .trim();
  }
  if (message.type === "action") {
    return [message.title, message.description].filter(Boolean).join("\n");
  }
  return message.message.trim();
}

function infer_action_type(message_id: string): string {
  return String(message_id || "").split(":")[0] || "action";
}
