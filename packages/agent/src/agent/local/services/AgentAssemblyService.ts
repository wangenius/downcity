/**
 * AgentAssemblyService：本地 Agent 装配服务。
 *
 * 关键点（中文）
 * - 统一装配 logger、config、env、runtime、context、plugin registry 与 plugin port。
 * - 该服务只负责一次性长期对象装配，不负责 session 缓存和生命周期启动。
 * - session/lifecycle service 通过它暴露的长期对象协作，避免在 facade 中重复拼装。
 */

import type { LanguageModel, Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { PluginPort } from "@/plugin/types/Plugin.js";
import type { AgentOptions } from "@/types/agent/AgentTypes.js";
import { Logger } from "@/utils/logger/Logger.js";
import { loadDowncityConfig, resolveAgentEnv } from "@/config/Config.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import {
  createFallbackSdkConfig,
  normalizeInstructionInput,
} from "@/agent/local/AgentInstructions.js";
import {
  createAgentPluginPort,
  createAgentPluginRegistry,
} from "@/agent/local/AgentPluginFactory.js";
import {
  createAgentContext,
  createAgentRuntime,
} from "@/agent/local/AgentRuntimeFactory.js";
import { setShellToolRuntime } from "@executor/tools/shell/ShellToolDefinition.js";
import {
  plugin_tools,
  setPluginToolRuntime,
} from "@executor/tools/plugin/PluginToolDefinition.js";
import type { AgentManagedSession } from "@/types/agent/AgentTypes.js";
import type { SessionPort } from "@/types/runtime/agent/AgentContext.js";

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
  plugin_instances: Map<string, BasePlugin>;

  /**
   * 当前 plugin 注册表。
   */
  plugin_registry: PluginRegistry;

  /**
   * 当前对外 plugin 调用端口。
   */
  plugins: PluginPort;

  /**
   * 当前 agent runtime。
   */
  runtime: AgentRuntime;

  /**
   * 当前 agent context。
   */
  agent_context: AgentContext;
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
    const env = resolveAgentEnv(path, this.options.env);
    const instruction = normalizeInstructionInput(this.options.instruction);
    const config = this.load_config(id, path);
    const plugin_instances = new Map<string, BasePlugin>();

    const runtime = createAgentRuntime({
      agent_id: id,
      project_root: path,
      logger,
      config,
      env,
      systems: instruction,
      plugin_instances,
      get_session_port: this.get_session_port,
      list_cached_sessions: this.list_cached_sessions,
    });

    this.register_plugins(plugin_instances, runtime, this.options.plugins || []);

    let agent_context!: AgentContext;
    const plugin_registry = createAgentPluginRegistry({
      plugins: [...plugin_instances.values()],
      get_context: () => agent_context,
    });
    const plugins = createAgentPluginPort(plugin_registry);
    if (this.should_register_plugin_call_tool(plugin_instances)) {
      tools.plugin_call = tools.plugin_call || plugin_tools.plugin_call;
    }
    agent_context = createAgentContext({
      runtime,
      project_root: path,
      logger,
      config,
      env,
      systems: instruction,
      plugin_instances,
      plugins,
      get_session_port: this.get_session_port,
      resolve_session_model: async (session_id) =>
        await this.resolve_session_model(session_id),
    });
    setShellToolRuntime(agent_context.invoke);
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
      runtime,
      agent_context,
    };
  }

  private load_config(agent_id: string, project_root: string): DowncityConfig {
    try {
      return loadDowncityConfig(project_root);
    } catch {
      return createFallbackSdkConfig(agent_id);
    }
  }

  private register_plugins(
    plugin_instances: Map<string, BasePlugin>,
    runtime: AgentRuntime,
    plugins: BasePlugin[],
  ): void {
    for (const plugin of plugins) {
      const name = String(plugin?.name || "").trim();
      if (!name) {
        throw new Error("Agent received a plugin without a valid name");
      }
      if (plugin_instances.has(name)) {
        throw new Error(`Duplicate plugin registration: ${name}`);
      }
      plugin.bindAgent(runtime);
      plugin_instances.set(name, plugin);
    }
  }

  /**
   * 判断是否需要自动注册 plugin_call tool。
   */
  private should_register_plugin_call_tool(
    plugin_instances: Map<string, BasePlugin>,
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
