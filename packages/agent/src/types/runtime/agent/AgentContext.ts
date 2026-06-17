/**
 * Agent 执行上下文类型定义。
 *
 * 职责说明（中文）
 * - 这里定义 plugin runtime、plugin、prompt system 共用的统一执行上下文。
 * - `AgentContext` 是一个 class，表达“当前一次执行可见的能力面”，不是宿主状态本体。
 * - 同一 agent 实例全程共享同一个 context；plugin、session、executor 都基于它读写状态。
 *
 * 边界说明（中文）
 * - `AgentRuntime` 负责保存长期状态；`AgentContext` 负责把这些状态暴露成执行接口。
 * - 这里同时声明类型协议与默认实现；plugin 作者拿到的就是这个 class 的实例。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/types/agent/AgentRuntimeAssembly.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentPlugins } from "@/plugin/types/Plugin.js";
import type {
  SessionMetadataV1,
  SessionMessageV1,
} from "@/executor/types/SessionMessages.js";
import type {
  SessionRunInput,
  SessionRunResult,
} from "@/executor/types/SessionRun.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  AgentSessionEvent,
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
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
   * - 对普通本地 runtime 可不实现。
   * - ACP runtime 可借此向远端发送 `session/cancel`。
   */
}

/**
 * 单个 Session 实例端口。
 */
export interface SessionPort {
  /**
   * 当前 session 标识。
   */
  readonly sessionId: string;
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
   * 订阅当前 session 后续产生的 future 事件。
   *
   * 关键点（中文）
   * - 只广播订阅之后产生的事件。
   * - 历史消息仍通过 `getHistoryStore()` / SDK `history()` 读取。
   */
  subscribe(subscriber: AgentSessionSubscriber): AgentSessionUnsubscribe;
  /**
   * 发布一条 session runtime 事件。
   *
   * 关键点（中文）
   * - plugin runtime 用它把审批、外部进度等非模型 chunk 事件推送给订阅方。
   * - 历史消息持久化仍由 appendUserMessage / appendAssistantMessage 负责。
   */
  publishEvent(event: AgentSessionEvent): void;
  /**
   * 清理当前 session 的 executor 缓存。
   */
  clearExecutor(): void;
  /**
   * 当前 session 更新后的异步通知钩子。
   */
  afterSessionUpdatedAsync(): Promise<void>;
  /**
   * 追加一条 user 消息。
   */
  appendUserMessage(params: {
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
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
  appendAssistantMessage(params: {
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
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
  /**
   * 解析指定 session 当前绑定的模型实例。
   *
   * 关键点（中文）
   * - 模型归属于 session，而不是 agent 全局运行时。
   * - 这里会触发 session 初始化/宿主配置，适合 task 等后台链路按 session 读取模型。
   */
  resolveModel(sessionId: string): Promise<LanguageModel | undefined>;
}

/**
 * AgentContext 构造参数。
 *
 * 关键点（中文）
 * - 装配方负责把 runtime / session / plugins 等上层依赖注入进来。
 * - `env` 必须传入 agent 持有的 mutable 共享对象引用，不要在这里克隆。
 */
export interface AgentContextOptions {
  /** 当前执行上下文对应的 agent 状态。 */
  agent: AgentRuntime;
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
   * - 通过 `agent.setEnv` / `agent.patchEnv` 原地更新会被本 context 立即感知。
   */
  env: Record<string, string>;
  /** 当前生效的 system 文本集合。 */
  systems: string[];
  /** 当前可见的路径能力集合。 */
  paths: AgentPathRuntime;
  /** 当前可见的 plugin 配置持久化能力集合。 */
  pluginConfig: AgentPluginConfigRuntime;
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
  /** 当前执行上下文对应的 agent 状态。 */
  readonly agent: AgentRuntime;
  /** 当前命令工作目录。 */
  readonly cwd: string;
  /** 当前项目根目录。 */
  readonly rootPath: string;
  /** 统一日志器。 */
  readonly logger: Logger;
  /** 当前运行时已解析配置。 */
  readonly config: DowncityConfig;
  /** 当前项目环境变量共享视图。 */
  readonly env: Record<string, string>;
  /** 当前生效的 system 文本集合。 */
  readonly systems: string[];
  /** 当前可见的路径能力集合。 */
  readonly paths: AgentPathRuntime;
  /** 当前可见的 plugin 配置持久化能力集合。 */
  readonly pluginConfig: AgentPluginConfigRuntime;
  /** Session 能力入口。 */
  readonly session: SessionCollectionPort;
  /** Plugin 调用入口。 */
  readonly plugins: AgentPlugins;
  /** 跨 plugin runtime 调用主入口。 */
  readonly invoke: InvokePluginPort;

  constructor(options: AgentContextOptions) {
    this.agent = options.agent;
    this.cwd = options.cwd;
    this.rootPath = options.rootPath;
    this.logger = options.logger;
    this.config = options.config;
    this.env = options.env;
    this.systems = options.systems;
    this.paths = options.paths;
    this.pluginConfig = options.pluginConfig;
    this.session = options.session;
    this.plugins = options.plugins;
    this.invoke = {
      invoke: (params) => this.invoke_plugin_action(params),
    };
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
