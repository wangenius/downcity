/**
 * SessionState：本地 Session 配置与 Metadata 状态。
 *
 * 关键点（中文）
 * - 统一管理本地 Session 的初始化、配置、标题与 metadata。
 * - Message 持久化统一交给 `SessionMessages`，这里仅读取 Message 快照更新 metadata。
 * - 不负责 Turn 编排、Message 创建或 Action 生命周期。
 */

import {
  inferAgentModelLabel,
  read_agent_model_context_window,
} from "@/agent/AgentModel.js";
import {
  patchSessionModelLabel,
  readSessionMetadata,
  resolveSystemTimezone,
  writeSessionMetadata,
} from "@/session/storage/Metadata.js";
import { touchSessionMetadata } from "@/session/storage/Metadata.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";
import type {
  AgentSessionConfigSnapshot,
  AgentSessionSetInput,
} from "@/types/agent/SessionTypes.js";
import type { SessionMutation } from "@/types/session/SessionMutation.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import type {
  SessionModelQueueCommand,
  SessionQueueCommand,
} from "@/types/session/SessionQueue.js";
import { generateId } from "@/utils/Id.js";
import type { Logger } from "@/utils/logger/Logger.js";
import { SessionMessages } from "@/session/SessionMessages.js";
import { to_executor_history } from "@/session/messages/SessionMessageCodec.js";
import type { SessionMessage } from "@/types/session/SessionMessage.js";
import type { LanguageModel } from "ai";

type SessionStateOptions = {
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

  /** 当前 Session Message SessionMessages。 */
  messages: SessionMessages;

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

  /** 按 Session 优先、Agent 兜底规则读取当前运行时模型。 */
  get_model: () => LanguageModel | undefined;

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

/**
 * Session 配置成功写入后的队列提交结果。
 */
export interface SessionConfiguredCommandResult {
  /**
   * 等待在下一 Session step 检查点执行的 command。
   *
   * 说明（中文）
   * - 输入未产生实际配置变化时为空。
   * - fork 等内部初始化路径可以选择立即提交而不返回 command。
   */
  command?: SessionQueueCommand;
}

/**
 * 本地 Session 状态与持久化服务。
 */
export class SessionState {
  private readonly agent_id: string;
  private readonly project_root: string;
  private readonly session_id: string;
  private readonly messages: SessionMessages;
  private readonly state: SessionLocalState;
  private readonly logger: Logger;
  private readonly ensure_configured_hook?: SessionStateOptions["ensure_configured_hook"];
  private readonly get_model: SessionStateOptions["get_model"];
  private readonly publish_event: SessionStateOptions["publish_event"];

  constructor(options: SessionStateOptions) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.session_id = options.session_id;
    this.messages = options.messages;
    this.state = options.state;
    this.logger = options.logger;
    this.ensure_configured_hook = options.ensure_configured_hook;
    this.get_model = options.get_model;
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
      this.state.sessionConfig = {};
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
    if (!this.get_model()) {
      throw new Error("requires a configured model.");
    }
  }

  /**
   * 写入当前 session 配置。
   */
  async set(
    input: AgentSessionSetInput,
    options?: SessionSetOptions,
  ): Promise<SessionConfiguredCommandResult> {
    const should_emit_action = options?.emit_action !== false;
    const previous_model_label = this.state.sessionConfig.modelLabel;
    const next_model = input.model;
    const next_model_label = next_model
      ? inferAgentModelLabel(next_model)
      : undefined;
    const previous_model_name = String(previous_model_label || "").trim();
    const next_model_name = String(next_model_label || "").trim();
    const should_emit_model_switch_action = Boolean(
      next_model &&
        should_emit_action &&
        this.state.sessionConfig.model &&
        previous_model_name &&
        next_model_name &&
        previous_model_name !== next_model_name,
    );
    const action_id = `model-switching:${this.session_id}:${Date.now()}:${generateId()}`;

    try {
      const next_config: AgentSessionConfigSnapshot = {
        ...this.state.sessionConfig,
      };
      if (next_model) {
        next_config.model = next_model;
        next_config.modelLabel = next_model_label;
        next_config.model_context_window =
          read_agent_model_context_window(next_model);
      }
      await patchSessionModelLabel({
        projectRoot: this.project_root,
        agentId: this.agent_id,
        sessionId: this.session_id,
        model: next_config.model,
      });
      this.state.sessionConfig = next_config;

      if (options?.emit_action === false) {
        await this.apply_model_command({
          type: "session_model",
          command_id: generateId(),
          config: next_config,
        });
        return {};
      }

      const command_id = generateId();
      return {
        command: {
          type: "session_model",
          command_id,
          config: next_config,
          ...(should_emit_model_switch_action
            ? {
                action_id,
                action_title:
                  `Session model switched from ${previous_model_name} to ${next_model_name}`,
              }
            : {}),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  /** 在 Session Step 检查点提交模型配置。 */
  async apply_model_command(
    command: SessionModelQueueCommand,
  ): Promise<void> {
    this.state.effective_session_config = {
      ...command.config,
    };
  }

  /**
   * 仅刷新当前 session metadata。
   */
  async touch_metadata(): Promise<void> {
    const stats = await this.messages.storage_stats();
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
    const messages = to_executor_history(
      this.session_id,
      await this.messages.context_snapshot(),
    );
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
      ...(input?.generate
        ? {
            model: this.get_model(),
          }
        : {}),
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
