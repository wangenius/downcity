/**
 * Agent SDK 本地入口与实例装配中心。
 *
 * 职责说明（中文）
 * - 对外暴露 `Agent` 这一唯一的本地 SDK 实例类。
 * - 统一承接单个 agent 实例的配置加载、plugin 装配、session 创建、HTTP/RPC 启停。
 * - 把原先独立的实例内核装配逻辑收敛到 `Agent` 内部，避免 facade 与 core 双层跳转。
 *
 * 边界说明（中文）
 * - 这里负责“单个 agent 实例”的长期状态与装配，不负责平台级多 agent 管理。
 * - 这里不直接实现 session 执行细节，而是继续复用 `Session` / `Executor` 体系。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { LanguageModel, Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type {
  AgentContext,
  SessionPort,
} from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentPlatformRuntime } from "@/types/runtime/host/AgentHost.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginView,
} from "@/plugin/types/Plugin.js";
import type {
  AgentMode,
  AgentSession,
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentOptions,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
  AgentHttpBinding,
  AgentHttpStartOptions,
  AgentRpcBinding,
  AgentSessionCollection,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
} from "@/sdk/AgentSdkTypes.js";
import { Logger } from "@/utils/logger/Logger.js";
import { Session } from "@/sdk/Session.js";
import { DEFAULT_SHIP_PROMPTS } from "@executor/composer/system/default/SystemDomain.js";
import {
  getSdkAgentSessionDirPath,
  listAgentSessionSummaryPage,
} from "@/sdk/session/index.js";
import {
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/runtime/host/AgentHostRuntime.js";
import { loadDowncityConfig } from "@/config/Config.js";
import { readChatMetaBySessionId } from "@/plugin/builtins/chat/runtime/ChatMetaStore.js";
import { resolveChatQueueStore } from "@/plugin/builtins/chat/runtime/ChatQueueStore.js";
import { HookRegistry } from "@/plugin/core/HookRegistry.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { isPluginEnabled } from "@/plugin/core/Activation.js";
import { createRegisteredPluginInstances } from "@/plugin/core/PluginClassRegistry.js";
import { setShellToolRuntime } from "@executor/tools/shell/ShellToolDefinition.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import { startServer } from "@/runtime/server/http/Server.js";
import { startLocalRpcServer } from "@/runtime/server/rpc/Server.js";

const EMPTY_SDK_PLATFORM: AgentPlatformRuntime = {
  getGlobalEnv: () => ({}),
  getAgentEnv: () => ({}),
  listModels: () => [],
  listProviders: async () => [],
  getModel: () => null,
  getChannelAccount: () => null,
  readChatAuthorizationConfig: () => ({
    roles: {},
    channels: {},
  }),
  writeChatAuthorizationConfig: async (_projectRoot, nextConfig) => nextConfig,
  setChatAuthorizationUserRole: async () => ({
    roles: {},
    channels: {},
  }),
  isPluginEnabled: (pluginName) => pluginName === "auth",
};

function createFallbackSdkConfig(agentId: string): DowncityConfig {
  return {
    name: agentId,
    version: "0.0.0",
  } as DowncityConfig;
}

function normalizeInstructionInput(input: string | string[] | undefined): string[] {
  const items = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? [input]
      : [];
  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

function createCoreInstructionContent(projectRoot: string): string {
  const currentYear = String(new Date().getFullYear());
  return DEFAULT_SHIP_PROMPTS
    .replaceAll("{{project_path}}", projectRoot)
    .replaceAll("{{project_root}}", projectRoot)
    .replaceAll("{{current_year}}", currentYear);
}

function createInstructionSystemBlocks(
  instruction: string[],
  projectRoot: string,
): AgentSessionSystemBlock[] {
  if (instruction.length === 0) {
    return [
      {
        source: "core",
        name: "default",
        content: createCoreInstructionContent(projectRoot),
      },
    ];
  }
  return instruction.map((content, index) => ({
    source: "instruction" as const,
    name: instruction.length === 1 ? "agent" : `agent:${index + 1}`,
    content,
  }));
}

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
  private readonly platform: AgentPlatformRuntime;
  private readonly env: Record<string, string>;
  private readonly globalEnv: Record<string, string>;
  private readonly defaultModel?: LanguageModel;
  private readonly configureSessionHook?: AgentOptions["configureSession"];
  private readonly pluginInstances: Map<string, BasePlugin>;
  private readonly sessionCollection: AgentSessionCollection;

  private instruction: string[];
  private configuredSessionIds = new Set<string>();
  private pluginsStarted = false;
  private startPromise: Promise<AgentStartResult> | null = null;
  private httpBinding: AgentHttpBinding | null = null;
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
    this.platform = options.platform || EMPTY_SDK_PLATFORM;
    this.globalEnv = this.platform.getGlobalEnv?.() || {};
    this.env = this.platform.getAgentEnv?.(this.path) || {};
    this.instruction = normalizeInstructionInput(options.instruction);
    this.defaultModel = options.model;
    this.configureSessionHook = options.configureSession;
    this.config = this.loadConfig();
    this.pluginInstances = new Map<string, BasePlugin>();
    this.runtime = this.createRuntime();
    this.registerPlugins({
      explicitPlugins: options.plugins || [],
      mode: options.mode || "custom",
    });
    this.pluginRegistry = this.createPluginRegistry([
      ...this.pluginInstances.values(),
    ]);
    this.plugins = this.createPluginPort();
    this.agentContext = this.createAgentContext();
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
   * - session 初始化完成后会立即应用默认模型与宿主覆写配置。
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
    await this.configureSession(session);
    return session;
  }

  /**
   * 获取一个已存在的 session。
   *
   * 关键点（中文）
   * - 若缓存中没有该 session，会根据磁盘目录决定是否允许懒加载恢复。
   * - 返回前同样会兜底执行一次 session 配置装配。
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
    await this.configureSession(session);
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
   * - 多次并发调用会复用同一个启动 Promise，避免重复启动 plugins / server。
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

      const httpBinding =
        options?.http === false || options?.http === undefined
          ? undefined
          : await this.startHttp(options.http);
      const rpcBinding =
        options?.rpc === true
          ? await this.startRpc()
          : undefined;

      return {
        ...(httpBinding ? { http: httpBinding } : {}),
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
   * - 停止顺序保持为 plugins -> rpc -> http，与当前运行语义一致。
   * - 停止后会清空 `startPromise`，允许后续再次 `start()`。
   */
  async stop(): Promise<AgentStopResult> {
    const pluginsStarted = this.pluginsStarted;
    const rpcStarted = this.rpcBinding !== null;
    const httpStarted = this.httpBinding !== null;

    if (pluginsStarted) {
      await stopAllPlugins(this.agentContext);
      this.pluginsStarted = false;
    }

    if (rpcStarted) {
      await this.stopRpc();
    }

    if (httpStarted) {
      await this.stopHttp();
    }

    this.startPromise = null;

    return {
      httpStopped: httpStarted,
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
   * 确保当前 plugins 已启动。
   *
   * 关键点（中文）
   * - 这里只负责托管 plugin 的生命周期启动，不隐式启动 HTTP/RPC 能力。
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
  }

  /**
   * 启动当前 agent 的 HTTP server。
   */
  private async startHttp(
    options?: AgentHttpStartOptions,
  ): Promise<AgentHttpBinding> {
    if (this.httpBinding) {
      return this.httpBinding;
    }
    const host = String(options?.host || "127.0.0.1").trim() || "127.0.0.1";
    const port =
      typeof options?.port === "number" && Number.isInteger(options.port)
        ? options.port
        : 15314;
    const server = await startServer({
      host,
      port,
      getAgentRuntime: () => this.runtime,
      getAgentContext: () => this.agentContext,
      sessionCollection: this.sessionCollection,
    });
    this.httpBinding = {
      baseUrl: `http://${host}:${port}`,
      host,
      port,
      server,
    };
    return this.httpBinding;
  }

  /**
   * 停止当前 agent 的 HTTP server。
   */
  private async stopHttp(): Promise<void> {
    if (!this.httpBinding) return;
    const current = this.httpBinding;
    this.httpBinding = null;
    await current.server.stop();
  }

  /**
   * 启动当前 agent 的本地 RPC server。
   */
  private async startRpc(): Promise<AgentRpcBinding> {
    if (this.rpcBinding) {
      return this.rpcBinding;
    }
    const server = await startLocalRpcServer({
      context: this.agentContext,
      runtime: this.runtime,
    });
    this.rpcBinding = {
      endpoint: server.endpoint,
      server,
    };
    return this.rpcBinding;
  }

  /**
   * 停止当前 agent 的本地 RPC server。
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
      return loadDowncityConfig(this.path, {
        projectEnv: this.env,
        agentEnv: this.env,
        globalEnv: this.globalEnv,
      });
    } catch {
      return createFallbackSdkConfig(this.id);
    }
  }

  /**
   * 注册当前 agent 可见的 plugin 实例。
   *
   * 关键点（中文）
   * - `preset` 模式会先装配内建 plugin，再叠加显式传入 plugin。
   * - 所有 plugin 在注册前都会绑定到当前实例 runtime。
   */
  private registerPlugins(input: {
    explicitPlugins: BasePlugin[];
    mode: AgentMode;
  }): void {
    const presetPlugins =
      input.mode === "preset"
        ? [...createRegisteredPluginInstances(this.runtime).values()]
        : [];
    for (const plugin of [...presetPlugins, ...input.explicitPlugins]) {
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
   * 创建 plugin 注册表。
   *
   * 关键点（中文）
   * - registry 本身不直接持有静态上下文，而是通过 resolver 延迟读取当前 `agentContext`。
   * - 这样 hook 调度与 availability 判断都能复用同一份上下文视图。
   */
  private createPluginRegistry(input: BasePlugin[]): PluginRegistry {
    let pluginRegistryRef: PluginRegistry | null = null;
    const hookRegistry = new HookRegistry({
      contextResolver: () => this.agentContext,
      pluginEnabledChecker: (pluginName) => {
        const plugin = pluginRegistryRef?.get(pluginName);
        return plugin
          ? isPluginEnabled({ plugin, context: this.agentContext })
          : false;
      },
    });
    const registry = new PluginRegistry({
      contextResolver: () => this.agentContext,
      hookRegistry,
    });
    pluginRegistryRef = registry;

    for (const plugin of input) {
      registry.register(plugin);
    }
    return registry;
  }

  /**
   * 创建对外暴露的 plugin 调用门面。
   */
  private createPluginPort(): PluginPort {
    return {
      list: (): PluginView[] => this.pluginRegistry.list(),
      availability: async (pluginName: string): Promise<PluginAvailability> =>
        await this.pluginRegistry.availability(pluginName),
      runAction: async (params) => await this.pluginRegistry.runAction(params),
      pipeline: async <T>(pointName: string, value: T): Promise<T> =>
        await this.pluginRegistry.pipeline(pointName, value),
      guard: async <T>(pointName: string, value: T): Promise<void> => {
        await this.pluginRegistry.guard(pointName, value);
      },
      effect: async <T>(pointName: string, value: T): Promise<void> => {
        await this.pluginRegistry.effect(pointName, value);
      },
      resolve: async <TInput, TOutput>(
        pointName: string,
        value: TInput,
      ): Promise<TOutput> =>
        await this.pluginRegistry.resolve<TInput, TOutput>(pointName, value),
    };
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
   * 创建实例级 runtime 视图。
   *
   * 关键点（中文）
   * - runtime 描述的是当前 agent 实例持有的长期状态。
   * - 其他 server / plugin / transport 都通过这个视图读取统一状态。
   */
  private createRuntime(): AgentRuntime {
    const runtime = {
      cwd: this.path,
      rootPath: this.path,
      logger: this.logger,
      config: this.config,
      env: this.env,
      globalEnv: this.globalEnv,
      systems: this.instruction,
      paths: createAgentPathRuntime(this.path, this.id),
      pluginConfig: createAgentPluginConfigRuntime(this.path),
      platform: this.platform,
      getSession: (sessionId: string): SessionPort =>
        this.getOrCreateSession(sessionId).getRuntimePort(),
      listExecutingSessionIds: () =>
        [...this.sessionsById.values()]
          .filter((session) => session.isExecuting())
          .map((session) => session.id),
      getExecutingSessionCount: () =>
        [...this.sessionsById.values()].filter((session) => session.isExecuting()).length,
      pluginInstances: this.pluginInstances,
    } satisfies AgentRuntime;
    return runtime;
  }

  /**
   * 创建统一执行上下文。
   *
   * 关键点（中文）
   * - `AgentContext` 是执行期能力视图，不是状态实体本身。
   * - plugin runtime、chat runtime、shell tool 都通过这里消费能力。
   */
  private createAgentContext(): AgentContext {
    let context!: AgentContext;
    context = {
      agent: this.runtime,
      cwd: this.path,
      rootPath: this.path,
      logger: this.logger,
      config: this.config,
      env: this.env,
      globalEnv: this.globalEnv,
      systems: this.instruction,
      paths: this.runtime.paths,
      pluginConfig: this.runtime.pluginConfig,
      platform: this.platform,
      session: {
        get: (sessionId) => this.getOrCreateSession(sessionId).getRuntimePort(),
        listExecutingSessionIds: () => this.runtime.listExecutingSessionIds(),
        getExecutingSessionCount: () => this.runtime.getExecutingSessionCount(),
        resolveModel: async (sessionId) => {
          const session = await this.getSession(sessionId);
          return session.config.model;
        },
      },
      invoke: {
        invoke: async (params: {
          plugin: string;
          action: string;
          payload?: JsonValue;
        }) => {
          const pluginName = String(params.plugin || "").trim();
          const actionName = String(params.action || "").trim();
          const plugin = this.pluginInstances.get(pluginName);
          if (!plugin) {
            return {
              success: false,
              error: `Unknown plugin: ${pluginName}`,
            };
          }
          const action = plugin.actions[actionName];
          if (!action) {
            return {
              success: false,
              error: `Unknown action: ${pluginName}.${actionName}`,
            };
          }
          const result = await action.execute({
            context,
            payload: params.payload ?? null,
            pluginName,
            actionName,
          });
          if (!result.success) {
            return {
              success: false,
              ...(result.error ? { error: result.error } : {}),
            };
          }
          return {
            success: true,
            ...(result.data !== undefined ? { data: result.data } : {}),
          };
        },
      },
      chat: {
        readMetaBySessionId: async (sessionId: string) => {
          return await readChatMetaBySessionId({
            context,
            sessionId,
          });
        },
        enqueue: (params) => resolveChatQueueStore(context).enqueue(params),
      },
      plugins: this.plugins,
    };
    return context;
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
        await this.configureSession(session);
      },
    });
    this.sessionsById.set(resolvedSessionId, created);
    return created;
  }

  /**
   * 为 session 应用默认模型与宿主覆写配置。
   *
   * 关键点（中文）
   * - 同一个 session 在单个 Agent 实例中只会执行一次配置装配。
   * - 默认模型先应用，随后再执行宿主传入的 `configureSession` 钩子。
   */
  private async configureSession(session: Session): Promise<void> {
    if (this.configuredSessionIds.has(session.id)) return;
    if (this.defaultModel) {
      await session.set({
        model: this.defaultModel,
      });
    }
    if (this.configureSessionHook) {
      await this.configureSessionHook(session);
    }
    this.configuredSessionIds.add(session.id);
  }
}
