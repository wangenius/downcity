/**
 * Agent local：本地入口与实例装配中心。
 *
 * 职责说明（中文）
 * - 对外暴露 `Agent` 这一唯一的本地实例类。
 * - 统一承接单个 agent 实例的配置加载、plugin 装配、session 创建、RPC 启停。
 * - 把原先独立的实例内核装配逻辑收敛到 `Agent` 内部，避免 facade 与 core 双层跳转。
 *
 * 边界说明（中文）
 * - 这里负责“单个 agent 实例”的长期状态与装配，不负责平台级多 agent 管理。
 * - 这里不直接实现 session 执行细节，而是继续复用 `Session` / `Executor` 体系。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { PluginPort } from "@/plugin/types/Plugin.js";
import type {
  AgentSession,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentOptions,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
  AgentRpcBinding,
  AgentRpcStartOptions,
  AgentSessionCollection,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
} from "@/types/agent/AgentTypes.js";
import type { AgentModel } from "@/model/CityModelAdapter.js";
import { Logger } from "@/utils/logger/Logger.js";
import { Session } from "@/session/Session.js";
import {
  getSdkAgentSessionDirPath,
  listAgentSessionSummaryPage,
} from "@/session/index.js";
import { loadDowncityConfig, resolveAgentEnv } from "@/config/Config.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { isPluginEnabled } from "@/plugin/core/Activation.js";
import { setShellToolRuntime } from "@executor/tools/shell/ShellToolDefinition.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import type { ActionScheduleRuntimeHandle } from "@/plugin/core/ActionScheduleRuntime.js";
import { startActionScheduleRuntime } from "@/plugin/core/ActionScheduleRuntime.js";
import { startRpcServer } from "@/rpc/Server.js";
import {
  createFallbackSdkConfig,
  createInstructionSystemBlocks,
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

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly plugins: PluginPort;

  private readonly logger: Logger;
  private readonly sessionsById = new Map<string, Session>();
  private readonly runtime: AgentRuntime;
  private readonly agentContext: AgentContext;
  private readonly pluginRegistry: PluginRegistry;
  private readonly config: DowncityConfig;
  private readonly env: Record<string, string>;
  private readonly defaultModel?: AgentModel;
  private readonly pluginInstances: Map<string, BasePlugin>;
  private readonly sessionCollection: AgentSessionCollection;

  private instruction: string[];
  private configuredSessionIds = new Set<string>();
  private pluginsStarted = false;
  private actionScheduleRuntime: ActionScheduleRuntimeHandle | null = null;
  private startPromise: Promise<AgentStartResult> | null = null;
  private rpcBinding: AgentRpcBinding | null = null;

  constructor(options: AgentOptions) {
    this.id = String(options.id || "").trim();
    this.path = String(options.path || "").trim();
    this.tools = options.tools && typeof options.tools === "object"
      ? { ...options.tools }
      : {};
    if (!this.id) {
      throw new Error("Agent requires a non-empty id");
    }
    if (!this.path) {
      throw new Error("Agent requires a non-empty path");
    }

    this.logger = new Logger();
    this.logger.bindProjectRoot(this.path);
    this.env = resolveAgentEnv(this.path, options.env);
    this.instruction = normalizeInstructionInput(options.instruction);
    this.defaultModel = options.model;
    this.config = this.loadConfig();
    this.pluginInstances = new Map<string, BasePlugin>();
    this.runtime = createAgentRuntime({
      agent_id: this.id,
      project_root: this.path,
      logger: this.logger,
      config: this.config,
      env: this.env,
      systems: this.instruction,
      plugin_instances: this.pluginInstances,
      get_session_port: (session_id) =>
        this.getOrCreateSession(session_id).getRuntimePort(),
      list_cached_sessions: () => [...this.sessionsById.values()],
    });
    this.registerPlugins(options.plugins || []);
    this.pluginRegistry = createAgentPluginRegistry({
      plugins: [...this.pluginInstances.values()],
      get_context: () => this.agentContext,
    });
    this.plugins = createAgentPluginPort(this.pluginRegistry);
    this.agentContext = createAgentContext({
      runtime: this.runtime,
      project_root: this.path,
      logger: this.logger,
      config: this.config,
      env: this.env,
      systems: this.instruction,
      plugin_instances: this.pluginInstances,
      plugins: this.plugins,
      get_session_port: (session_id) =>
        this.getOrCreateSession(session_id).getRuntimePort(),
      resolve_session_model: async (session_id) => {
        const session = await this.getSession(session_id);
        return session.config.model;
      },
    });
    setShellToolRuntime(this.agentContext.invoke);

    this.sessionCollection = {
      createSession: async (input) => await this.createSession(input),
      getSession: async (sessionId) => await this.getSession(sessionId),
      listSessions: async (input) => await this.listSessions(input),
    };
  }

  /**
   * 新建一个 session。
   *
   * 关键点（中文）
   * - 若调用方显式传入 `sessionId`，这里会先检查缓存与磁盘目录，避免重复创建。
   * - session 初始化完成后会立即应用默认模型。
   */
  async createSession(input?: AgentCreateSessionInput): Promise<AgentSession> {
    const explicitSessionId = String(input?.sessionId || "").trim() || undefined;
    if (
      explicitSessionId &&
      (this.sessionsById.has(explicitSessionId) ||
        (await fs.pathExists(
          getSdkAgentSessionDirPath(this.path, this.id, explicitSessionId),
        )))
    ) {
      throw new Error(`Session "${explicitSessionId}" already exists`);
    }
    const session = this.getOrCreateSession(explicitSessionId);
    await session.initialize();
    await this.applySessionDefaults(session);
    return session;
  }

  /**
   * 获取一个已存在的 session。
   *
   * 关键点（中文）
   * - 若缓存中没有该 session，会根据磁盘目录决定是否允许懒加载恢复。
   * - 返回前同样会兜底执行一次默认配置装配。
   */
  async getSession(sessionId: string): Promise<AgentSession> {
    const resolvedSessionId = String(sessionId || "").trim();
    if (!resolvedSessionId) {
      throw new Error("getSession requires a non-empty sessionId");
    }
    const sessionDirPath = getSdkAgentSessionDirPath(
      this.path,
      this.id,
      resolvedSessionId,
    );
    if (
      !this.sessionsById.has(resolvedSessionId) &&
      !(await fs.pathExists(sessionDirPath))
    ) {
      throw new Error(`Session "${resolvedSessionId}" not found`);
    }
    const session = this.getOrCreateSession(resolvedSessionId);
    await session.initialize();
    await this.applySessionDefaults(session);
    return session;
  }

  /**
   * 列出当前 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await listAgentSessionSummaryPage({
      projectRoot: this.path,
      agentId: this.id,
      input,
      executingSessionIds: new Set(this.runtime.listExecutingSessionIds()),
    });
  }

  /**
   * 启动当前 agent 实例的长期运行能力。
   *
   * 关键点（中文）
   * - `start()` 是唯一公开的长期运行生命周期入口。
   * - 多次并发调用会复用同一个启动 Promise，避免重复启动 plugins / rpc。
   */
  async start(options?: AgentStartOptions): Promise<AgentStartResult> {
    if (this.startPromise) {
      return await this.startPromise;
    }
    this.startPromise = (async () => {
      const shouldStartPlugins = options?.plugins !== false;

      if (shouldStartPlugins) {
        await this.ensurePluginsStarted();
      }

      const rpcBinding =
        options?.rpc === false || options?.rpc === undefined
          ? undefined
          : await this.startRpc(options.rpc);

      return {
        ...(rpcBinding ? { rpc: rpcBinding } : {}),
        pluginsStarted: this.pluginsStarted,
      };
    })();
    try {
      return await this.startPromise;
    } catch (error) {
      this.startPromise = null;
      throw error;
    }
  }

  /**
   * 停止当前 agent 实例的长期运行能力。
   *
   * 关键点（中文）
   * - 停止顺序保持为 plugins -> rpc，与当前运行语义一致。
   * - 停止后会清空 `startPromise`，允许后续再次 `start()`。
   */
  async stop(): Promise<AgentStopResult> {
    const pluginsStarted = this.pluginsStarted;
    const rpcStarted = this.rpcBinding !== null;

    if (pluginsStarted) {
      await this.stopActionScheduleRuntime();
      await stopAllPlugins(this.agentContext);
      this.pluginsStarted = false;
    }

    if (rpcStarted) {
      await this.stopRpc();
    }

    this.startPromise = null;

    return {
      rpcStopped: rpcStarted,
      pluginsStopped: pluginsStarted,
    };
  }

  /**
   * 更新当前 SDK Agent 的静态基础指令。
   *
   * 关键点（中文）
   * - instruction 不做动态变量替换。
   * - 已创建的 session 后续 run 会读取最新 instruction blocks。
   */
  setInstruction(input: string | string[]): void {
    this.instruction = normalizeInstructionInput(input);
  }

  /**
   * 返回当前项目根目录解析后的配置快照。
   */
  getConfig(): DowncityConfig {
    return this.config;
  }

  /**
   * 返回当前 agent 绑定的统一日志器。
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 返回当前 agent runtime。
   *
   * 关键点（中文）
   * - 供宿主在 agent 外部装配 transport（例如 Town HTTP gateway）时复用。
   * - 不暴露启动语义，只暴露运行时访问口。
   */
  getRuntime(): AgentRuntime {
    return this.runtime;
  }

  /**
   * 返回当前 agent context。
   *
   * 关键点（中文）
   * - 供宿主装配 plugin/control 相关外层协议面。
   */
  getContext(): AgentContext {
    return this.agentContext;
  }

  /**
   * 返回当前 session collection。
   *
   * 关键点（中文）
   * - 供宿主在外层挂载 RemoteAgent transport 时复用。
   */
  getSessionCollection(): AgentSessionCollection {
    return this.sessionCollection;
  }

  /**
   * 确保当前 plugins 已启动。
   *
   * 关键点（中文）
   * - 这里只负责托管 plugin 的生命周期启动，不隐式启动 RPC 能力。
   * - 启动失败的 plugin 会记录日志，但保留与原行为一致的整体启动流程。
   */
  private async ensurePluginsStarted(): Promise<void> {
    if (this.pluginsStarted) return;
    const lifecycle = await startAllPlugins(this.agentContext);
    this.pluginsStarted = true;
    for (const item of lifecycle.results) {
      if (!item.success) {
        this.logger.error(
          `Plugin start failed: ${item.plugin?.name || "unknown"} - ${item.error || "unknown error"}`,
        );
      }
    }
    await this.ensureActionScheduleRuntimeStarted();
  }

  /**
   * 确保 ActionSchedule runtime 已随 Agent 长期生命周期启动。
   *
   * 关键点（中文）
   * - ActionSchedule 不作为 plugin 注册，但它依赖 plugin action 执行能力。
   * - 因此这里放在普通 plugins 启动之后，避免到期任务执行到尚未启动的 plugin。
   */
  private async ensureActionScheduleRuntimeStarted(): Promise<void> {
    if (this.actionScheduleRuntime) return;
    try {
      this.actionScheduleRuntime = await startActionScheduleRuntime(
        this.agentContext,
      );
    } catch (error) {
      this.logger.error(
        `ActionSchedule start failed: ${String(error)}`,
      );
    }
  }

  /**
   * 停止 ActionSchedule runtime。
   *
   * 关键点（中文）
   * - Agent 停止时先停 ActionSchedule，再停普通 plugin，避免关停期间继续触发 action。
   */
  private async stopActionScheduleRuntime(): Promise<void> {
    const runtime = this.actionScheduleRuntime;
    this.actionScheduleRuntime = null;
    runtime?.stop();
  }

  /**
   * 启动当前 agent 的本机 RPC server。
   */
  private async startRpc(
    options?: AgentRpcStartOptions,
  ): Promise<AgentRpcBinding> {
    if (this.rpcBinding) {
      return this.rpcBinding;
    }
    const host = String(options?.host || "127.0.0.1").trim() || "127.0.0.1";
    const port =
      typeof options?.port === "number" && Number.isInteger(options.port)
        ? options.port
        : 15314;
    const server = await startRpcServer({
      host,
      port,
      sessionCollection: this.sessionCollection,
      getAgentContext: () => this.agentContext,
      getAgentRuntime: () => this.getRuntime(),
    });
    this.rpcBinding = {
      url: `rpc://${host}:${port}`,
      host,
      port,
      server,
    };
    return this.rpcBinding;
  }

  /**
   * 停止当前 agent 的本机 RPC server。
   */
  private async stopRpc(): Promise<void> {
    if (!this.rpcBinding) return;
    const current = this.rpcBinding;
    this.rpcBinding = null;
    await current.server.stop();
  }

  /**
   * 读取当前项目配置。
   *
   * 关键点（中文）
   * - 若项目根目录尚未存在合法 `downcity.json`，会退回最小 SDK 占位配置。
   * - 这样可以允许纯 SDK 场景在尚未初始化项目时继续装配本地 Agent。
   */
  private loadConfig(): DowncityConfig {
    try {
      return loadDowncityConfig(this.path);
    } catch {
      return createFallbackSdkConfig(this.id);
    }
  }

  /**
   * 注册当前 agent 可见的 plugin 实例。
   *
   * 关键点（中文）
   * - SDK 只注册宿主显式传入的 plugin 实例，不再隐式装配 built-in 集合。
   * - 所有 plugin 在注册前都会绑定到当前实例 runtime。
   */
  private registerPlugins(plugins: BasePlugin[]): void {
    for (const plugin of plugins) {
      const name = String(plugin?.name || "").trim();
      if (!name) {
        throw new Error("Agent received a plugin without a valid name");
      }
      if (this.pluginInstances.has(name)) {
        throw new Error(`Duplicate plugin registration: ${name}`);
      }
      plugin.bindAgent(this.runtime);
      this.pluginInstances.set(name, plugin);
    }
  }

  /**
   * 读取当前 agent 静态 instruction blocks。
   */
  private loadInstructionSystemBlocks(): AgentSessionSystemBlock[] {
    return createInstructionSystemBlocks(this.instruction, this.path);
  }

  /**
   * 读取当前可用 plugin 暴露的 system blocks。
   *
   * 关键点（中文）
   * - 单个 plugin system 失败不会阻断 session 主链路。
   * - 这里只加载当前启用且可用的 plugin system 文本。
   */
  private async loadPluginSystemBlocks(): Promise<AgentSessionSystemBlock[]> {
    const out: AgentSessionSystemBlock[] = [];
    for (const plugin of this.pluginInstances.values()) {
      if (typeof plugin.system !== "function") continue;
      try {
        if (!isPluginEnabled({ plugin, context: this.agentContext })) continue;
        if (typeof plugin.availability === "function") {
          const availability = await plugin.availability(this.agentContext);
          if (!availability.available) continue;
        }
        const text = String(await plugin.system(this.agentContext)).trim();
        if (!text) continue;
        out.push({
          source: "plugin",
          name: plugin.name,
          content: text,
        });
      } catch {
        // 单个 plugin system 失败不应阻断 SDK session 主链路。
      }
    }
    return out;
  }

  /**
   * 获取或创建一个本地 Session 实例。
   *
   * 关键点（中文）
   * - 同一个 `sessionId` 在单个 Agent 实例内只会装配一次。
   * - 新建 session 时会把 instruction 与 plugin system 读取能力注入进去。
   */
  private getOrCreateSession(sessionId?: string): Session {
    const resolvedSessionId =
      String(sessionId || "").trim() || `session-${Date.now()}-${nanoid(8)}`;
    const cached = this.sessionsById.get(resolvedSessionId);
    if (cached) return cached;

    const created = new Session({
      agentId: this.id,
      projectRoot: this.path,
      sessionId: resolvedSessionId,
      tools: this.tools,
      logger: this.logger,
      getInstructionSystemBlocks: () => this.loadInstructionSystemBlocks(),
      getManagedPluginSystemBlocks: async () => [],
      getPluginSystemBlocks: () => this.loadPluginSystemBlocks(),
      ensureConfigured: async (session) => {
        await this.applySessionDefaults(session);
      },
    });
    this.sessionsById.set(resolvedSessionId, created);
    return created;
  }

  /**
   * 为 session 应用默认模型。
   *
   * 关键点（中文）
   * - 同一个 session 在单个 Agent 实例中只会执行一次配置装配。
   * - 默认模型会在首次访问/首次执行前写入当前 session。
   */
  private async applySessionDefaults(session: Session): Promise<void> {
    if (this.configuredSessionIds.has(session.id)) return;
    if (this.defaultModel) {
      await session.set({
        model: this.defaultModel,
      });
    }
    this.configuredSessionIds.add(session.id);
  }
}
