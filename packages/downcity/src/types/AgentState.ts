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
import type { JsonValue } from "@/types/Json.js";
import type { BaseService } from "@services/BaseService.js";
import type { SessionStore } from "@sessions/SessionStore.js";
import type {
  PluginActionResult,
  PluginAvailability,
  PluginView,
} from "@/types/Plugin.js";

/**
 * AgentState 持有的插件注册表能力。
 */
export interface AgentPluginRegistry {
  /**
   * 列出当前已注册的插件概览视图。
   */
  list(): PluginView[];
  /**
   * 查询指定插件可用性。
   */
  availability(pluginName: string): Promise<PluginAvailability>;
  /**
   * 执行显式插件 action。
   */
  runAction(params: {
    /**
     * 插件名称。
     */
    plugin: string;
    /**
     * action 名称。
     */
    action: string;
    /**
     * 可选 payload。
     */
    payload?: JsonValue;
  }): Promise<PluginActionResult<JsonValue>>;
  /**
   * 运行 pipeline hook。
   */
  pipeline<T = JsonValue>(pointName: string, value: T): Promise<T>;
  /**
   * 运行 guard hook。
   */
  guard<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /**
   * 运行 effect hook。
   */
  effect<T = JsonValue>(pointName: string, value: T): Promise<void>;
  /**
   * 运行 resolve hook。
   */
  resolve<TInput = JsonValue, TOutput = JsonValue>(
    pointName: string,
    value: TInput,
  ): Promise<TOutput>;
}

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
   * 当前生效的静态 system 文本集合。
   */
  systems: string[];
}

/**
 * Agent 进程完整运行状态。
 */
export interface AgentState extends AgentStateBase {
  /**
   * 当前统一执行模型实例。
   */
  model: LanguageModel;
  /**
   * 当前 agent 持有的 session store。
   */
  sessionStore: SessionStore;
  /**
   * 当前 agent 持有的 service instances。
   */
  services: Map<string, BaseService>;
  /**
   * 当前 agent 持有的 plugin registry。
   */
  pluginRegistry: AgentPluginRegistry;
}
