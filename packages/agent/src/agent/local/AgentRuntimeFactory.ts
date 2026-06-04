/**
 * Agent runtime / context 装配工厂。
 *
 * 关键点（中文）
 * - 这里只创建长期 runtime 视图与执行期 context 视图。
 * - Agent 仍然持有 session/plugin 状态；这里通过函数参数读取状态。
 */

import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { LanguageModel } from "ai";
import type { JsonValue } from "@/types/common/Json.js";
import type {
  AgentContext,
  SessionPort,
} from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { PluginPort } from "@/plugin/types/Plugin.js";
import type { Session } from "@/session/Session.js";
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
  /** 当前环境变量快照。 */
  env: Record<string, string>;
  /** 当前静态 system 文本集合。 */
  systems: string[];
  /** 当前 plugin 实例集合。 */
  plugin_instances: Map<string, BasePlugin>;
  /** 获取或创建 session runtime port。 */
  get_session_port: (session_id: string) => SessionPort;
  /** 读取当前已缓存的 session 实例。 */
  list_cached_sessions: () => Session[];
}

/**
 * 创建 AgentContext 的参数。
 */
export interface CreateAgentContextOptions {
  /** 当前 AgentRuntime。 */
  runtime: AgentRuntime;
  /** 当前项目根目录。 */
  project_root: string;
  /** 统一日志器。 */
  logger: Logger;
  /** 当前解析后的配置。 */
  config: DowncityConfig;
  /** 当前环境变量快照。 */
  env: Record<string, string>;
  /** 当前静态 system 文本集合。 */
  systems: string[];
  /** 当前 plugin 实例集合。 */
  plugin_instances: Map<string, BasePlugin>;
  /** 对外 plugin 调用端口。 */
  plugins: PluginPort;
  /** 获取或创建 session runtime port。 */
  get_session_port: (session_id: string) => SessionPort;
  /** 解析 session 当前绑定的模型实例。 */
  resolve_session_model: (session_id: string) => Promise<LanguageModel | undefined>;
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

/**
 * 创建统一执行上下文。
 */
export function createAgentContext(
  options: CreateAgentContextOptions,
): AgentContext {
  let context!: AgentContext;
  context = {
    agent: options.runtime,
    cwd: options.project_root,
    rootPath: options.project_root,
    logger: options.logger,
    config: options.config,
    env: options.env,
    systems: options.systems,
    paths: options.runtime.paths,
    pluginConfig: options.runtime.pluginConfig,
    session: {
      get: (session_id) => options.get_session_port(session_id),
      listExecutingSessionIds: () => options.runtime.listExecutingSessionIds(),
      getExecutingSessionCount: () => options.runtime.getExecutingSessionCount(),
      resolveModel: async (session_id) =>
        await options.resolve_session_model(session_id),
    },
    invoke: {
      invoke: async (params: {
        plugin: string;
        action: string;
        payload?: JsonValue;
      }) => {
        const result = await options.plugins.runAction(params);
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
      },
    },
    plugins: options.plugins,
  };
  return context;
}
