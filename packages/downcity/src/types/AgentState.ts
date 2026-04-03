/**
 * AgentState 类型定义。
 *
 * 关键点（中文）
 * - 这里表达的是“当前 agent 进程的长期运行状态”。
 * - 它不是抽象 host，也不是一次执行上下文。
 * - Session / Service / Plugin 这些长期对象都应从这里挂出。
 */

import type { LanguageModel } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/DowncityConfig.js";
import type {
  AgentAuthRuntime,
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/types/AgentHost.js";
import type { BaseService } from "@services/BaseService.js";
import type { SessionStore } from "@sessions/SessionStore.js";

/**
 * AgentState 启动早期的基础状态。
 */
export interface AgentStateBase {
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
   * 当前 console 级全局环境变量快照。
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
   * 当前 agent 可见的认证能力集合。
   */
  auth: AgentAuthRuntime;
  /**
   * 当前 agent 可见的 plugin 配置持久化能力集合。
   */
  pluginConfig: AgentPluginConfigRuntime;
}

/**
 * Agent 进程完整运行状态。
 */
export interface AgentState extends AgentStateBase {
  /**
   * 当前统一执行模型实例。
   */
  model?: LanguageModel;
  /**
   * 当前 agent 持有的 session store。
   */
  sessionStore: SessionStore;
  /**
   * 当前 agent 持有的 service instances。
   */
  services: Map<string, BaseService>;
}
