/**
 * AgentAssemblyService：本地 Agent 装配服务。
 *
 * 关键点（中文）
 * - 统一装配 logger、config、env、context 与 plugin registry。
 * - 该服务只负责一次性长期对象装配，不负责 session 缓存和生命周期启动。
 * - session/lifecycle service 通过它暴露的长期对象协作，避免在 facade 中重复拼装。
 */

import type { LanguageModel, Tool } from "ai";
import type { Plugin } from "@/types/plugin/PluginDefinition.js";
import { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { AgentPlugins } from "@/plugin/types/Plugin.js";
import type { AgentOptions } from "@/types/agent/AgentTypes.js";
import { Logger } from "@/utils/logger/Logger.js";
import { loadDowncityConfig, resolveAgentEnv } from "@/config/Config.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import {
  createFallbackSdkConfig,
  normalizeInstructionInput,
} from "@/agent/local/AgentInstructions.js";
import {
  createAgentPluginRegistry,
} from "@/agent/local/AgentPluginFactory.js";
import {
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/agent/local/AgentRuntimeAssembly.js";
import {
  plugin_tools,
  setPluginToolRuntime,
} from "@executor/tools/plugin/PluginToolDefinition.js";
import type { AgentManagedSession } from "@/types/agent/AgentTypes.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";

type AgentAssemblyServiceOptions = {
  /**
   * 当前 agent 构造参数。
   */
  options: AgentOptions;

  /**
   * 读取当前已缓存的 session 实例。
   */
  list_cached_sessions: () => AgentManagedSession[];

  /**
   * 获取或创建 session runtime port。
   */
  get_session_port: (session_id: string) => SessionPort;

  /**
   * 解析指定 session 当前绑定的模型实例。
   */
  resolve_session_model: (
    session_id: string,
  ) => Promise<LanguageModel | undefined>;
};

/**
 * 本地 Agent 装配结果。
 */
export interface AgentAssemblyResult {
  /**
   * 当前 agent 稳定标识。
   */
  id: string;

  /**
   * 当前项目根目录。
   */
  path: string;

  /**
   * 当前 agent 默认工具集合。
   */
  tools: Record<string, Tool>;

  /**
   * 当前 agent 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 agent 环境变量快照。
   */
  env: Record<string, string>;

  /**
   * 当前 agent 静态 instruction。
   */
  instruction: string[];

  /**
   * 当前解析后的项目配置。
   */
  config: DowncityConfig;

  /**
   * 当前 plugin 实例集合。
   */
  plugin_instances: Map<string, Plugin>;

  /**
   * 当前 plugin 注册表。
   */
  plugin_registry: PluginRegistry;

  /**
   * 当前 agent plugin 调用面。
   */
  plugins: AgentPlugins;

  /**
   * 当前 agent context。
   */
  agent_context: AgentContext;

  /**
   * 当前 agent 挂载的内建 shell。
   */
  shell?: AgentOptions["shell"];
}

/**
 * 本地 Agent 装配服务。
 */
export class AgentAssemblyService {
  private readonly options: AgentOptions;
  private readonly list_cached_sessions: AgentAssemblyServiceOptions["list_cached_sessions"];
  private readonly get_session_port: AgentAssemblyServiceOptions["get_session_port"];
  private readonly resolve_session_model: AgentAssemblyServiceOptions["resolve_session_model"];

  constructor(options: AgentAssemblyServiceOptions) {
    this.options = options.options;
    this.list_cached_sessions = options.list_cached_sessions;
    this.get_session_port = options.get_session_port;
    this.resolve_session_model = options.resolve_session_model;
  }

  /**
   * 执行一次性长期对象装配。
   */
  assemble(): AgentAssemblyResult {
    const id = String(this.options.id || "").trim();
    const path = String(this.options.path || "").trim();
    const tools =
      this.options.tools && typeof this.options.tools === "object"
        ? { ...this.options.tools }
        : {};
    if (!id) {
      throw new Error("Agent requires a non-empty id");
    }
    if (!path) {
      throw new Error("Agent requires a non-empty path");
    }

    const logger = new Logger();
    logger.bindProjectRoot(path);
    // 关键点（中文）
    // - 这里产出的 env 是 agent 全生命周期共享的 mutable 对象引用。
    // - context / shell 都持有同一引用；后续 `agent.setEnv()` 会原地修改它。
    const env = resolveAgentEnv(path, this.options.env);
    const instruction = normalizeInstructionInput(this.options.instruction);
    const config = this.load_config(id, path);
    const plugin_instances = new Map<string, Plugin>();

    // 关键点（中文）
    // - plugin_registry 仍然延迟读取 agent_context（避免循环依赖）。
    // - context 一构造完就赋值，registry 第一次读 get_context 时已经是非空。
    let agent_context: AgentContext | undefined;
    const plugin_registry = createAgentPluginRegistry({
      plugins: this.options.plugins || [],
      plugin_instances,
      get_context: () => {
        if (!agent_context) {
          throw new Error("AgentContext is not assembled yet");
        }
        return agent_context;
      },
    });
    const plugins = plugin_registry;
    if (this.should_register_plugin_call_tool(plugin_instances)) {
      tools.plugin_read = tools.plugin_read || plugin_tools.plugin_read;
      tools.plugin_call = tools.plugin_call || plugin_tools.plugin_call;
    }
    const resolve_session_model = this.resolve_session_model;
    const paths = createAgentPathRuntime(path, id);
    const pluginConfig = createAgentPluginConfigRuntime(path);
    agent_context = new AgentContext({
      cwd: path,
      rootPath: path,
      logger,
      config,
      env,
      systems: instruction,
      paths,
      pluginConfig,
      pluginInstances: plugin_instances,
      session: {
        get: (session_id) => this.get_session_port(session_id),
        listExecutingSessionIds: () =>
          this.list_cached_sessions()
            .filter((session) => session.isExecuting())
            .map((session) => session.id),
        getExecutingSessionCount: () =>
          this.list_cached_sessions()
            .filter((session) => session.isExecuting()).length,
        resolveModel: async (session_id) =>
          await resolve_session_model(session_id),
      },
      plugins,
    });
    const shell = this.options.shell;
    if (shell) {
      shell.configure({
        root_path: path,
        env,
        agent_id: id,
        logger,
        emit_event: (event) => {
          const session_id = String(event.session_id || "").trim();
          if (!session_id) return;
      agent_context!.session.get(session_id).publishEvent(event as unknown as AgentSessionEvent);
        },
      });
      Object.assign(tools, shell.tools);
    }
    setPluginToolRuntime(plugins);

    return {
      id,
      path,
      tools,
      logger,
      env,
      instruction,
      config,
      plugin_instances,
      plugin_registry,
      plugins,
      agent_context: agent_context!,
      ...(shell ? { shell } : {}),
    };
  }

  private load_config(agent_id: string, project_root: string): DowncityConfig {
    if (this.options.config) {
      return {
        ...this.options.config,
        id: String(this.options.config.id || "").trim() || agent_id,
        version: String(this.options.config.version || "").trim() || "1.0.0",
      };
    }
    try {
      return loadDowncityConfig(project_root);
    } catch {
      return createFallbackSdkConfig(agent_id);
    }
  }

  /**
   * 判断是否需要自动注册 plugin_call tool。
   */
  private should_register_plugin_call_tool(
    plugin_instances: Map<string, Plugin>,
  ): boolean {
    for (const plugin of plugin_instances.values()) {
      if (
        plugin.actions &&
        Object.keys(plugin.actions).some((action_name) =>
          Boolean(String(action_name || "").trim()),
        )
      ) {
        return true;
      }
    }
    return false;
  }
}
