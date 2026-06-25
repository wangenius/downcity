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
  touchSessionMetadata,
  writeSessionMetadata,
} from "@/session/index.js";
import { ensureSessionTitle } from "@/session/SessionTitle.js";
import { persistSdkAssistantResult } from "@/session/storage/Persistence.js";
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
  SessionMessageV1,
  SessionUserMessageV1,
} from "@/executor/types/SessionMessages.js";
import type { SessionLocalState } from "@/types/session/SessionLocalState.js";
import { generateId } from "@/utils/Id.js";

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
   * 在执行前补齐宿主级配置。
   */
  ensure_configured_hook?: () => Promise<void>;

  /**
   * 发布 session 事件。
   */
  publish_event: (event: AgentSessionEvent) => void;
};

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
  private readonly ensure_configured_hook?: SessionStateServiceOptions["ensure_configured_hook"];
  private readonly publish_event: SessionStateServiceOptions["publish_event"];

  constructor(options: SessionStateServiceOptions) {
    this.agent_id = options.agent_id;
    this.project_root = options.project_root;
    this.session_id = options.session_id;
    this.history_store = options.history_store;
    this.executor = options.executor;
    this.state = options.state;
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
      throw new Error(
        `Session "${this.session_id}" requires a configured model. Pass model to new Agent({ model }) or call session.set({ model }) first.`,
      );
    }
  }

  /**
   * 写入当前 session 配置。
   */
  async set(input: AgentSessionSetInput): Promise<void> {
    if (input.model) {
      this.state.sessionConfig.model = normalizeAgentModel(input.model);
      this.state.sessionConfig.modelLabel = inferAgentModelLabel(input.model);
      this.executor.clearExecutor();
    }
    await patchSessionModelLabel({
      projectRoot: this.project_root,
      agentId: this.agent_id,
      sessionId: this.session_id,
      model: this.state.sessionConfig.model,
    });
  }

  /**
   * 追加一条 user 消息并刷新标题与 metadata。
   */
  async append_user_message(params: {
    message?: SessionMessageV1 | null;
    text?: string;
  }): Promise<void> {
    await this.executor.appendUserMessage(params);
    await this.ensure_title_from_history({ generate: true });
    await this.touch_metadata();
  }

  /**
   * 追加一条 assistant 消息并刷新 metadata。
   */
  async append_assistant_message(params: {
    message?: SessionMessageV1 | null;
    fallbackText?: string;
  }): Promise<void> {
    await this.executor.appendAssistantMessage(params);
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
    const messages = await this.history_store.list();
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
    assistant_message?: SessionMessageV1 | null,
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
      await this.executor.appendUserMessage({
        message,
      });
      await this.ensure_title_from_history({ generate: true });
      await this.touch_metadata();
      return message;
    }

    // query 是 parts 数组，直接用其构造 user 消息
    const parts = Array.isArray(query) ? query : [];
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
    await this.executor.appendUserMessage({
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
      await this.executor.appendUserMessage({
        message,
      });
    }
    await this.touch_metadata();
  }
}
