/**
 * AgentCore 运行时类型定义。
 *
 * 关键点（中文）
 * - 这里表达的是单个 `AgentCore` 实例持有的长期运行状态。
 * - 它不再依赖 `runtime/*` 兼容层，而是作为实例级主类型来源。
 * - Session / Service / Plugin 这些长期对象都从这里挂出。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type {
  AgentPathRuntime,
  AgentPlatformRuntime,
  AgentPluginConfigRuntime,
} from "@/types/host/AgentHost.js";
import type { BaseService } from "@/service/builtins/BaseService.js";
import type { Executor } from "@session/Executor.js";

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
   * 当前统一执行模型实例。
   */
  model?: LanguageModel;
  /**
   * 读取指定 sessionId 对应的内部 Executor 实例。
   */
  getSession(sessionId: string): Executor;
  /**
   * 返回当前执行中的 sessionId 列表。
   */
  listExecutingSessionIds(): string[];
  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number;
  /**
   * 当前 agent 持有的 service instances。
   */
  services: Map<string, BaseService>;
}
