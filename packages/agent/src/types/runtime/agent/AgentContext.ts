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
import type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/types/agent/AgentRuntimeAssembly.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentPlugins } from "@/types/plugin/PluginRuntime.js";
import type { Plugin } from "@/types/plugin/PluginDefinition.js";
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

/**
 * 跨 plugin runtime 调用参数。
 */
export interface InvokePluginParams {
  /**
   * 目标 plugin 名称。
   */
  plugin: string;
  /**
   * 目标 action 名称。
   */
  action: string;
  /**
   * 调用时附带的结构化 payload。
   */
  payload?: JsonValue;
}

/**
 * 跨 plugin runtime 调用结果。
 */
export interface InvokePluginResult {
  /**
   * 调用是否成功。
   */
  success: boolean;
  /**
   * 成功时返回的数据载荷。
   */
  data?: JsonValue;
  /**
   * 失败时的错误信息。
   */
  error?: string;
}

/**
 * 跨 plugin runtime 调用端口。
 */
export interface InvokePluginPort {
  /**
   * 调用指定 plugin action。
   */
  invoke(params: InvokePluginParams): Promise<InvokePluginResult>;
}

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
 * Session 集合入口。
 */
export interface SessionCollectionPort {
  /**
   * 获取指定 sessionId 对应的 Session 实例。
   */
  get(sessionId: string): SessionPort;
  /**
   * 返回当前所有执行中的 sessionId。
   */
  listExecutingSessionIds(): string[];
  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number;
}

/**
 * AgentContext 构造参数。
 *
 * 关键点（中文）
 * - 装配方负责把 session / plugins 等上层依赖注入进来。
 * - `env` 必须传入 agent 持有的 mutable 共享对象引用，不要在这里克隆。
 */
export interface AgentContextOptions {
  /** 当前命令工作目录。 */
  cwd: string;
  /** 当前项目根目录。 */
  rootPath: string;
  /** 统一日志器。 */
  logger: Logger;
  /** 当前运行时已解析配置。 */
  config: DowncityConfig;
  /**
   * 当前 agent env 共享对象引用。
   *
   * 关键点（中文）
   * - 必须是 Agent 持有的同一个 mutable 引用，不要克隆后再传入。
   * - Session step 内优先读取队列已经提交的 effective env。
   */
  env: Record<string, string>;
  /** 当前生效的 system 文本集合。 */
  systems: string[];
  /** 当前可见的路径能力集合。 */
  paths: AgentPathRuntime;
  /** 当前可见的 plugin 配置持久化能力集合。 */
  pluginConfig: AgentPluginConfigRuntime;
  /** 当前 agent 持有的插件实例集合。 */
  pluginInstances: Map<string, Plugin>;
  /** Session 能力入口。 */
  session: SessionCollectionPort;
  /** Plugin 调用入口。 */
  plugins: AgentPlugins;
}

/**
 * 统一执行上下文。
 *
 * 关键点（中文）
 * - 字段全部 readonly，构造一次后语义稳定，避免 plugin 误改。
 * - `env` 引用 agent 级共享 mutable 对象，`...ctx.env` / `ctx.env.FOO` 直接可用。
 * - `invoke` 是构造期组装的 plugin 调用端口，对外仍以 `InvokePluginPort` 形态暴露。
 */
export class AgentContext {
  /** 当前命令工作目录。 */
  readonly cwd: string;
  /** 当前项目根目录。 */
  readonly rootPath: string;
  /** 统一日志器。 */
  readonly logger: Logger;
  /** 当前运行时已解析配置。 */
  readonly config: DowncityConfig;
  /** 当前 Agent configured env 共享对象。 */
  private readonly configured_env: Record<string, string>;
  /** 当前 Agent configured system 文本。 */
  private readonly configured_systems: string[];
  /** 当前可见的路径能力集合。 */
  readonly paths: AgentPathRuntime;
  /** 当前可见的 plugin 配置持久化能力集合。 */
  readonly pluginConfig: AgentPluginConfigRuntime;
  /** 当前 agent 持有的插件实例集合。 */
  readonly pluginInstances: Map<string, Plugin>;
  /** Session 能力入口。 */
  readonly session: SessionCollectionPort;
  /** Plugin 调用入口。 */
  readonly plugins: AgentPlugins;
  /** 跨 plugin runtime 调用主入口。 */
  readonly invoke: InvokePluginPort;

  constructor(options: AgentContextOptions) {
    this.cwd = options.cwd;
    this.rootPath = options.rootPath;
    this.logger = options.logger;
    this.config = options.config;
    this.configured_env = options.env;
    this.configured_systems = options.systems;
    this.paths = options.paths;
    this.pluginConfig = options.pluginConfig;
    this.pluginInstances = options.pluginInstances;
    this.session = options.session;
    this.plugins = options.plugins;
    this.invoke = {
      invoke: (params) => this.invoke_plugin_action(params),
    };
  }

  /**
   * 读取 Agent 已配置的 env。
   *
   * 关键点（中文）
   * - Session step 的 effective env 由 Plugin action 参数 `run_context.agentEnv` 显式提供。
   * - 该 getter 不再根据异步调用链隐式切换结果。
   */
  get env(): Record<string, string> {
    return this.configured_env;
  }

  /**
   * 读取 Agent 已配置的 instruction。
   */
  get systems(): string[] {
    return this.configured_systems;
  }

  /**
   * 读取指定 sessionId 对应的 session 端口。
   *
   * 关键点（中文）
   * - 返回值是统一的 `SessionPort`，而不是裸 `Executor`。
   * - 这样 HTTP / plugin runtime / chat queue / contact 等入口都能复用同一层会话装配与执行兜底。
   */
  getSession(sessionId: string): SessionPort {
    return this.session.get(sessionId);
  }

  /**
   * 返回当前执行中的 sessionId 列表。
   */
  listExecutingSessionIds(): string[] {
    return this.session.listExecutingSessionIds();
  }

  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number {
    return this.session.getExecutingSessionCount();
  }

  /**
   * 跨 plugin runtime 调用 action 的内部实现。
   *
   * 关键点（中文）
   * - 统一把 `runAction` 的成功/失败结果归一化为 `InvokePluginResult`。
   * - 这里替代了原 `createAgentContext` 工厂里的胶水匿名函数。
   */
  private async invoke_plugin_action(
    params: InvokePluginParams,
  ): Promise<InvokePluginResult> {
    const result = await this.plugins.runAction({
      plugin: params.plugin,
      action: params.action,
      ...(params.payload !== undefined ? { payload: params.payload } : {}),
    });
    if (!result.success) {
      return {
        success: false,
        error: result.error || result.message || "plugin action failed",
      };
    }
    return {
      success: true,
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  }
}

/**
 * 允许 optional 字段的结构化配置对象。
 */
export type StructuredConfig = {
  [key: string]: JsonValue | undefined;
};
