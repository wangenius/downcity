/**
 * Agent runtime / context 装配工厂。
 *
 * 关键点（中文）
 * - 这里只创建长期 runtime 视图。
 * - `AgentContext` 已经收敛为 class，调用方直接 `new AgentContext(...)`，不再走工厂。
 * - Agent 仍然持有 session/plugin 状态；这里通过函数参数读取状态。
 */

import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { AgentManagedSession } from "@/types/agent/AgentTypes.js";
import {
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/agent/local/AgentRuntimeAssembly.js";

/**
 * 创建 AgentRuntime 的参数。
 */
export interface CreateAgentRuntimeOptions {
  /** 当前 agent id。 */
  agent_id: string;
  /** 当前项目根目录。 */
  project_root: string;
  /** 统一日志器。 */
  logger: Logger;
  /** 当前解析后的配置。 */
  config: DowncityConfig;
  /**
   * 当前 agent 共享 env 对象。
   *
   * 关键点（中文）
   * - 必须传入 Agent 持有的同一份 mutable 对象，runtime / context 直接复用同一引用。
   */
  env: Record<string, string>;
  /** 当前静态 system 文本集合。 */
  systems: string[];
  /** 当前 plugin 实例集合。 */
  plugin_instances: Map<string, BasePlugin>;
  /** 获取或创建 session runtime port。 */
  get_session_port: (session_id: string) => SessionPort;
  /** 读取当前已缓存的 session 实例。 */
  list_cached_sessions: () => AgentManagedSession[];
}

/**
 * 创建实例级 runtime 视图。
 */
export function createAgentRuntime(
  options: CreateAgentRuntimeOptions,
): AgentRuntime {
  return {
    cwd: options.project_root,
    rootPath: options.project_root,
    logger: options.logger,
    config: options.config,
    env: options.env,
    systems: options.systems,
    paths: createAgentPathRuntime(options.project_root, options.agent_id),
    pluginConfig: createAgentPluginConfigRuntime(options.project_root),
    getSession: (session_id: string): SessionPort =>
      options.get_session_port(session_id),
    listExecutingSessionIds: () =>
      options
        .list_cached_sessions()
        .filter((session) => session.isExecuting())
        .map((session) => session.id),
    getExecutingSessionCount: () =>
      options
        .list_cached_sessions()
        .filter((session) => session.isExecuting()).length,
    pluginInstances: options.plugin_instances,
  };
}
