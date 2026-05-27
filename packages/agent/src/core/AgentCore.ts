/**
 * AgentCore：单个 Agent 实例的运行内核。
 *
 * 关键点（中文）
 * - 一个 `AgentCore` 只服务一个 agent 实例，不依赖进程级 singleton runtime。
 * - SDK `Agent`、实例绑定式 HTTP server、实例绑定式 local RPC 都应基于它工作。
 * - 宿主若需要统一 session 默认配置，应通过 `model` / `configureSession` 注入，而不是把策略写死在 SDK 中。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { LanguageModel, Tool } from "ai";
import { Logger } from "@/utils/logger/Logger.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { SessionPort } from "@/core/AgentContextTypes.js";
import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
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
  AgentCreateSessionInput,
  AgentListSessionsInput,
  AgentOptions,
  AgentSessionSummaryPage,
  AgentSessionSystemBlock,
} from "@/sdk/AgentSdkTypes.js";
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
  const items = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
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
 * SDK / server 共用的实例级 Agent 内核。
 */
export class AgentCore {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly pluginInstances: Map<string, BasePlugin>;
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
  private instruction: string[];
  private pluginsStartPromise: Promise<void> | null = null;
  private configuredSessionIds = new Set<string>();

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
    this.pluginRegistry = this.createPluginRegistry([...this.pluginInstances.values()]);
    this.plugins = this.createPluginPort();
    this.agentContext = this.createAgentContext();
    setShellToolRuntime(this.agentContext.invoke);
  }

  /**
   * 返回实例级 runtime 视图。
   */
  getRuntime(): AgentRuntime {
    return this.runtime;
  }

  /**
   * 返回实例级执行上下文。
   */
  getContext(): AgentContext {
    return this.agentContext;
  }

  /**
   * 返回当前项目根目录解析后的配置快照。
   */
  getConfig(): DowncityConfig {
    return this.config;
  }

  /**
   * 返回统一日志器。
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * 新建一个 session。
   */
  async createSession(input?: AgentCreateSessionInput): Promise<Session> {
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
   */
  async getSession(sessionId: string): Promise<Session> {
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
   * 确保当前 plugins 已启动。
   */
  async ensurePluginsStarted(): Promise<void> {
    if (this.pluginsStartPromise) {
      await this.pluginsStartPromise;
      return;
    }
    this.pluginsStartPromise = (async () => {
      for (const plugin of this.pluginInstances.values()) {
        await plugin.lifecycle?.start?.(this.agentContext);
      }
    })();
    await this.pluginsStartPromise;
  }

  /**
   * 更新当前 Agent 的静态基础指令。
   */
  setInstruction(input: string | string[]): void {
    this.instruction = normalizeInstructionInput(input);
  }

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

  private registerPlugins(input: {
    explicitPlugins: BasePlugin[];
    mode: AgentMode;
  }): void {
    const presetPlugins = input.mode === "preset"
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

  private createPluginRegistry(input: BasePlugin[]): PluginRegistry {
    let pluginRegistryRef: PluginRegistry | null = null;
    const hookRegistry = new HookRegistry({
      contextResolver: () => this.agentContext,
      pluginEnabledChecker: (pluginName) => {
        const plugin = pluginRegistryRef?.get(pluginName);
        return plugin ? isPluginEnabled({ plugin, context: this.agentContext }) : false;
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

  private loadInstructionSystemBlocks(): AgentSessionSystemBlock[] {
    return createInstructionSystemBlocks(this.instruction, this.path);
  }

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
