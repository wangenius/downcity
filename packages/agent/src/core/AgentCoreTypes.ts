/**
 * AgentCore 运行时类型定义。
 *
 * 关键点（中文）
 * - 这里表达的是单个 `AgentCore` 实例持有的长期运行状态。
 * - 它不再依赖 `runtime/*` 兼容层，而是作为实例级主类型来源。
 * - Session / plugin 这些长期对象都从这里挂出。
 */

import type { Logger } from "@/utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type {
  AgentPathRuntime,
  AgentPlatformRuntime,
  AgentPluginConfigRuntime,
} from "@/types/runtime/host/AgentHost.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { SessionPort } from "@/core/AgentContextTypes.js";

/**
 * AgentCore 启动早期的基础状态。
 */
export interface AgentRuntimeBase {
  /**
   * 当前命令工作目录。
   */
  cwd: string;
  /**
   * 当前 agent 项目根目录。
   */
  rootPath: string;
  /**
   * 当前统一日志器。
   */
  logger: Logger;
  /**
   * 当前解析后的项目配置。
   */
  config: DowncityConfig;
  /**
   * 当前 agent 局部环境变量快照。
   */
  env: Record<string, string>;
  /**
   * 当前平台级全局环境变量快照。
   */
  globalEnv: Record<string, string>;
  /**
   * 当前生效的静态 system 文本集合。
   */
  systems: string[];
  /**
   * 当前 agent 可见的路径能力集合。
   */
  paths: AgentPathRuntime;
  /**
   * 当前 agent 可见的 plugin 配置持久化能力集合。
   */
  pluginConfig: AgentPluginConfigRuntime;
  /**
   * 当前 agent 可见的平台能力集合。
   */
  platform: AgentPlatformRuntime;
}

/**
 * AgentCore 完整运行状态。
 */
export interface AgentRuntime extends AgentRuntimeBase {
  /**
   * 读取指定 sessionId 对应的 session 端口。
   *
   * 关键点（中文）
   * - 返回值是统一的 `SessionPort`，而不是裸 `Executor`。
   * - 这样 HTTP / plugin runtime / chat queue / contact 等入口都能复用同一层会话装配与执行兜底。
   */
  getSession(sessionId: string): SessionPort;
  /**
   * 返回当前执行中的 sessionId 列表。
   */
  listExecutingSessionIds(): string[];
  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number;
  /**
   * 当前 agent 持有的插件实例集合。
   */
  pluginInstances: Map<string, BasePlugin>;
}
