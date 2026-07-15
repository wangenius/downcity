/**
 * Agent 执行上下文类型定义。
 *
 * 职责说明（中文）
 * - 这里定义 plugin runtime、plugin、prompt system 共用的统一执行上下文。
 * - `AgentContext` 是一个 class，表达"当前一次执行可见的能力面"，不是宿主状态本体。
 * - 同一 agent 实例全程共享同一个 context；plugin、session、executor 都基于它读写状态。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentPlugins } from "@/types/plugin/PluginRuntime.js";
import type {
  SessionMetadataV1,
  SessionRecordV1,
} from "@/executor/types/SessionRecords.js";
import type {
  SessionRunInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionStopResult } from "@/types/sdk/AgentSessionStop.js";
import type {
  SessionMutationSubscriber,
  SessionMutationUnsubscribe,
} from "@/types/session/SessionMutation.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";
import type { AgentSessions } from "@/agent/local/services/AgentSessions.js";

/**
 * 单个 Session 执行端口。
 */
export interface SessionExecutorPort {
  /**
   * 执行一次 session run。
   */
  run(params: SessionRunInput): Promise<SessionRunResult>;

  /**
   * 请求取消当前正在执行的 turn。
   *
   * 关键点（中文）
   * - 返回 `true` 表示已发出取消请求。
   * - 返回 `false` 表示当前没有可取消的执行。
   */
  stop(): boolean;
}

/**
 * 单个 Session 实例端口。
 */
export interface SessionPort {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;
  /** 获取当前 Session 优先解析后的运行时模型实例。 */
  getModel(): LanguageModel | undefined;
  /**
   * 获取当前 session 的执行端口。
   */
  getExecutor(): SessionExecutorPort;
  /**
   * 获取当前 session 的持久化端口。
   */
  getHistoryStore(): SessionHistoryStore;
  /**
   * 向当前 session actor 追加一条新的 prompt。
   *
   * 关键点（中文）
   * - 这是面向 SDK / transport 的统一交互输入入口。
   * - 返回值只有在当前输入被绑定到某个 turn 后才会兑现。
   */
  prompt(input: AgentSessionPromptInput): Promise<AgentSessionTurnHandle>;
  /**
   * 停止当前 turn，并取消尚未被吸收的排队 prompt。
   */
  stop(): Promise<AgentSessionStopResult>;
  /**
   * 订阅当前 session 后续产生的 future 事件。
   *
   * 关键点（中文）
   * - 只广播订阅之后产生的事件。
   * - 当前 Message snapshot 通过公开 SDK `session.messages()` 读取。
   */
  subscribe(
    subscriber: SessionMutationSubscriber,
  ): SessionMutationUnsubscribe;
  /**
   * 追加一条 user 消息。
   */
  append_user_message(params: {
    /**
     * 已构造好的完整消息。
     */
    message?: SessionRecordV1 | null;
    /**
     * 兜底文本内容。
     */
    text?: string;
    /**
     * 附加元数据。
     */
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  /**
   * 追加一条 assistant 消息。
   */
  append_assistant_message(params: {
    /**
     * 已构造好的完整消息。
     */
    message?: SessionRecordV1 | null;
    /**
     * 兜底文本内容。
     */
    fallbackText?: string;
    /**
     * 附加元数据。
     */
    extra?: SessionMetadataV1["extra"];
  }): Promise<void>;
  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting(): boolean;
}

/**
 * AgentContext 构造参数。
 *
 * 关键点（中文）
 * - 装配方负责把 session / plugins 等上层依赖注入进来。
 * - `env` 必须传入 agent 持有的 mutable 共享对象引用，不要在这里克隆。
 */
interface AgentContextOptions {
  /** 当前 Agent 稳定标识。 */
  agent_id: string;
  /** 当前项目根目录。 */
  rootPath: string;
  /** 统一日志器。 */
  logger: Logger;
  /**
   * 读取当前 Agent configured env。
   *
   * 关键点（中文）
   * - Agent 是 env 的唯一状态所有者，Context 只提供只读视图。
   * - Session step 内优先读取队列已经提交的 effective env。
   */
  get_env: () => Readonly<Record<string, string>>;
  /** 读取当前 Agent configured systems。 */
  get_systems: () => readonly string[];
  /** 当前 Agent 直接持有的 Session 集合。 */
  sessions: AgentSessions;
  /** Plugin 调用入口。 */
  plugins: AgentPlugins;
}

/**
 * 统一执行上下文。
 *
 * 关键点（中文）
 * - Context 不持有 Agent 状态，只投影 Plugin 与宿主需要的运行时能力。
 * - `env` 与 `systems` 每次都从 Agent 唯一状态源读取。
 */
export class AgentContext {
  /** 当前 Agent 稳定标识。 */
  readonly agent_id: string;
  /** 当前项目根目录。 */
  readonly rootPath: string;
  /** 统一日志器。 */
  readonly logger: Logger;
  /** 当前 Agent configured env 读取器。 */
  private readonly get_env: AgentContextOptions["get_env"];
  /** 当前 Agent configured systems 读取器。 */
  private readonly get_systems: AgentContextOptions["get_systems"];
  /** 当前 Agent 直接持有的 Session 集合。 */
  readonly sessions: AgentSessions;
  /** Plugin 调用入口。 */
  readonly plugins: AgentPlugins;

  constructor(options: AgentContextOptions) {
    this.agent_id = options.agent_id;
    this.rootPath = options.rootPath;
    this.logger = options.logger;
    this.get_env = options.get_env;
    this.get_systems = options.get_systems;
    this.sessions = options.sessions;
    this.plugins = options.plugins;
  }

  /**
   * 读取 Agent 已配置的 env。
   *
   * 关键点（中文）
   * - Session step 的 effective env 由 Plugin action 参数 `run_context.agentEnv` 显式提供。
   * - 该 getter 不再根据异步调用链隐式切换结果。
   */
  get env(): Readonly<Record<string, string>> {
    return this.get_env();
  }

  /**
   * 读取 Agent 已配置的 instruction。
   */
  get systems(): readonly string[] {
    return this.get_systems();
  }
}

/**
 * 允许 optional 字段的结构化配置对象。
 */
export type StructuredConfig = {
  [key: string]: JsonValue | undefined;
};
