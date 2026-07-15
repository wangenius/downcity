/**
 * Agent local：本地入口与 facade。
 *
 * 职责说明（中文）
 * - 对外暴露 `Agent` 这一唯一的本地实例类。
 * - Agent 直接持有自身状态与长期运行时对象，避免额外 Assembly 复制同一批字段。
 * - Session 管理与后台生命周期仍由独立对象负责具体行为。
 */

import type { LanguageModel, Tool } from "ai";
import { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentOptions } from "@/types/agent/AgentOptions.js";
import type { Shell } from "@downcity/shell";
import { Logger } from "@/utils/logger/Logger.js";
import { resolve_agent_env } from "@/config/AgentEnv.js";
import { normalizeInstructionInput } from "@/agent/local/AgentInstructions.js";
import { AgentSessions } from "@/agent/local/services/AgentSessions.js";
import { AgentBackgroundService } from "@/agent/local/services/AgentBackgroundService.js";
import { createAgentPluginRegistry } from "@/agent/local/AgentPluginFactory.js";
import {
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/agent/local/AgentRuntimePorts.js";
import { createPluginTools } from "@executor/tools/plugin/PluginToolDefinition.js";
import { generateId } from "@/utils/Id.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  /** 当前 Agent 的稳定标识，用于区分 Session 存储目录与运行时归属。 */
  readonly id: string;

  /** 当前 Agent 绑定的项目根目录绝对路径。 */
  readonly path: string;

  /** 当前 Agent 向所有 Session 提供的工具集合。 */
  readonly tools: Record<string, Tool>;

  /** 当前 Agent 已装配的 Plugin 调用与注册入口。 */
  readonly plugins: PluginRegistry;

  /** 当前 Agent 的本地 Session 创建、恢复、查询与归档入口。 */
  readonly sessions: AgentSessions;

  /**
   * 当前 Agent 持有的默认运行时模型实例。
   *
   * 关键点（中文）
   * - Agent 只持有调用方传入的实例，不负责模型选择、持久化或恢复。
   * - Session 未设置自己的模型时，执行会回退使用该实例。
   */
  readonly model?: LanguageModel;

  /** 当前 Agent 独享的运行日志器。 */
  private readonly logger: Logger;

  /** 提供给 Plugin、Session 与宿主集成层共享的 Agent 执行上下文。 */
  private readonly agentContext: AgentContext;

  /** 当前 Agent configured env 的可变共享对象。 */
  private readonly env: Record<string, string>;

  /** 调用方提供的自定义 Session 类；省略时使用 SDK 默认实现。 */
  private readonly SessionClass: AgentOptions["Session"];

  /** 负责 Plugin lifecycle、ActionSchedule 与 Shell 等后台能力的生命周期服务。 */
  private readonly backgroundService: AgentBackgroundService;

  /** 当前 Agent 可选的内建 Shell 实例。 */
  private readonly shell?: AgentOptions["shell"];

  /** 当前 Agent configured instruction 的可变有序集合。 */
  private instruction: string[];

  constructor(options: AgentOptions) {
    this.id = String(options.id || "").trim();
    this.path = String(options.path || "").trim();
    if (!this.id) throw new Error("Agent requires a non-empty id");
    if (!this.path) throw new Error("Agent requires a non-empty path");

    this.SessionClass = options.Session;
    this.model = options.model;
    this.tools = options.tools && typeof options.tools === "object"
      ? { ...options.tools }
      : {};
    this.logger = new Logger();
    this.logger.bindProjectRoot(this.path);
    this.env = resolve_agent_env(this.path, options.env);
    this.instruction = normalizeInstructionInput(options.instruction);
    this.shell = options.shell;

    let context_ref: AgentContext | undefined;
    this.plugins = createAgentPluginRegistry({
      plugins: options.plugins || [],
      get_context: () => {
        if (!context_ref) {
          throw new Error("AgentContext is not initialized");
        }
        return context_ref;
      },
    });
    if (options.plugins?.some((plugin) =>
      plugin.actions && Object.keys(plugin.actions).length > 0
    )) {
      const plugin_tools = createPluginTools({ plugins: this.plugins });
      this.tools.plugin_read = this.tools.plugin_read || plugin_tools.plugin_read;
      this.tools.plugin_call = this.tools.plugin_call || plugin_tools.plugin_call;
    }
    if (this.shell) {
      this.shell.configure({
        root_path: this.path,
        env: this.env,
        agent_id: this.id,
        logger: this.logger,
      });
      Object.assign(this.tools, this.shell.tools);
    }

    this.sessions = this.create_sessions();
    const paths = createAgentPathRuntime(this.path, this.id);
    this.agentContext = new AgentContext({
      agent_id: this.id,
      rootPath: this.path,
      logger: this.logger,
      get_env: () => this.env,
      get_systems: () => this.instruction,
      paths,
      pluginConfig:
        options.plugin_config || createAgentPluginConfigRuntime(this.path),
      sessions: {
        get: (session_id) => this.sessions.get_session_port(session_id),
        listExecutingSessionIds: () =>
          this.sessions.list_executing_session_ids(),
        getExecutingSessionCount: () =>
          this.sessions.get_executing_session_count(),
      },
      plugins: this.plugins,
    });
    context_ref = this.agentContext;

    // 关键点（中文）：构造完成即触发后台能力启动；调用方可 `await agent.ready()` 等待。
    this.backgroundService = new AgentBackgroundService({
      logger: this.logger,
      agent_context: this.agentContext,
      get_shell: () => this.shell,
    });
    this.plugins.set_change_listener(({ type, plugin_name }) => {
      const verb = type === "register" ? "registered" : "unregistered";
      this.sessions.broadcast_plugins({
        command_id: generateId(),
        title: `Agent plugin ${plugin_name} ${verb}`,
        plugins: this.plugins.execution_view(),
      });
    });
  }

  /**
   * 等待 Agent 后台能力启动完成。
   *
   * 关键点（中文）
   * - Agent 构造完成即开始启动 plugin lifecycle 与 ActionSchedule。
   * - 调用方在需要确认后台能力就绪时使用，例如启动后立刻读取 plugin 状态。
   */
  async ready(): Promise<void> {
    await this.backgroundService.ready();
  }

  /**
   * 释放当前 Agent 的后台能力。
   *
   * 关键点（中文）
   * - 关闭 plugin lifecycle、ActionSchedule、shell 等后台资源。
   * - 不负责任何 transport（RPC / HTTP）；transport 由 `@downcity/server` 自行管理。
   */
  async dispose(): Promise<void> {
    await this.backgroundService.dispose();
  }

  /**
   * 更新当前 SDK Agent 的静态基础指令。
   */
  setInstruction(input: string | string[]): void {
    const next_instruction = normalizeInstructionInput(input);
    this.instruction.splice(0, this.instruction.length, ...next_instruction);
    this.sessions.broadcast_instruction(this.instruction, generateId());
  }

  /**
   * 返回当前 agent env 的浅拷贝快照。
   *
   * 关键点（中文）
   * - 返回的是拷贝，调用方修改它不会影响 agent 真实状态。
   * - 想改 env 请使用 `setEnv` / `patchEnv`。
   */
  getEnv(): Record<string, string> {
    return { ...this.env };
  }

  /**
   * 整体覆盖 agent env。
   *
   * 关键点（中文）
   * - 直接清空当前共享 env 对象，再写入新值，保证 plugin / runtime / shell 看到的是同一引用。
   * - 仅写入字符串值，`null` / `undefined` 表示删除该 key。
   */
  setEnv(next: Record<string, string | null | undefined>): void {
    for (const key of Object.keys(this.env)) {
      delete this.env[key];
    }
    this.apply_env_patch(next);
    this.sessions.broadcast_env(this.env, generateId());
  }

  /**
   * 增量合并 agent env。
   *
   * 关键点（中文）
   * - `null` / `undefined` 表示删除该 key；其他值会强制转字符串后写入。
   * - configured env 原地更新；已有 Session 在下一 step 检查点提交 effective env。
   */
  patchEnv(patch: Record<string, string | null | undefined>): void {
    this.apply_env_patch(patch);
    this.sessions.broadcast_env(this.env, generateId());
  }

  /**
   * 原地应用一次 env patch，不触发重复广播。
   */
  private apply_env_patch(
    patch: Record<string, string | null | undefined>,
  ): void {
    if (!patch || typeof patch !== "object") return;
    for (const [raw_key, raw_value] of Object.entries(patch)) {
      const key = String(raw_key || "").trim();
      if (!key) continue;
      if (raw_value === null || raw_value === undefined) {
        delete this.env[key];
        continue;
      }
      this.env[key] = String(raw_value);
    }
  }

  /**
   * 返回当前 agent 绑定的统一日志器。
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 返回当前 agent context。
   */
  getContext(): AgentContext {
    return this.agentContext;
  }

  /**
   * 返回当前 agent 挂载的 Shell。
   */
  getShell(): Shell | undefined {
    return this.shell;
  }

  private create_sessions(): AgentSessions {
    return new AgentSessions({
      agent_id: this.id,
      project_root: this.path,
      tools: this.tools,
      logger: this.logger,
      get_instruction: () => this.instruction,
      get_agent_env: () => this.getEnv(),
      get_agent_plugins: () => this.plugins.execution_view(),
      ensure_agent_ready: async () => {
        await this.backgroundService.ready();
      },
      get_agent_model: () => this.model,
      SessionClass: this.SessionClass,
    });
  }
}
