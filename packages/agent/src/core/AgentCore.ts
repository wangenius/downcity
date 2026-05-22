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
import type { BaseService } from "@/service/builtins/BaseService.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { SessionPort } from "@/core/AgentContextTypes.js";
import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { JsonValue } from "@/types/common/Json.js";
import type { AgentPlatformRuntime } from "@/types/runtime/host/AgentHost.js";
import type {
  Plugin,
  PluginAvailability,
  PluginPort,
  PluginView,
} from "@/plugin/types/Plugin.js";
import type {
  AgentOptions,
  AgentSessionMetadata,
  AgentSessionSystemBlock,
} from "@/sdk/AgentSdkTypes.js";
import { Session } from "@/sdk/Session.js";
import { DEFAULT_SHIP_PROMPTS } from "@session/composer/system/default/SystemDomain.js";
import { getSdkAgentSessionsRootDirPath } from "@/sdk/session/index.js";
import {
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/runtime/host/AgentHostRuntime.js";
import { loadDowncityConfig } from "@/config/Config.js";
import { appendExecSessionMessage } from "@/service/builtins/chat/runtime/ChatIngressStore.js";
import { readChatMetaBySessionId } from "@/service/builtins/chat/runtime/ChatMetaStore.js";
import { resolveChatQueueStore } from "@/service/builtins/chat/runtime/ChatQueueStore.js";
import { HookRegistry } from "@/plugin/core/HookRegistry.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { isPluginEnabled } from "@/plugin/core/Activation.js";
import { PLUGINS } from "@/plugin/core/Plugins.js";
import { createRegisteredServiceInstances } from "@/service/core/ServiceClassRegistry.js";
import { setShellToolRuntime } from "@session/tools/shell/ShellToolDefinition.js";

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
  readonly services: Map<string, BaseService>;
  readonly plugins: PluginPort;

  private readonly logger: Logger;
  private readonly sessionsById = new Map<string, Session>();
  private readonly runtime: AgentRuntime;
  private readonly serviceContext: AgentContext;
  private readonly pluginRegistry: PluginRegistry;
  private readonly pluginSystemProviders: Plugin[];
  private readonly config: DowncityConfig;
  private readonly platform: AgentPlatformRuntime;
  private readonly env: Record<string, string>;
  private readonly globalEnv: Record<string, string>;
  private readonly defaultModel?: LanguageModel;
  private readonly configureSessionHook?: AgentOptions["configureSession"];
  private instruction: string[];
  private servicesStartPromise: Promise<void> | null = null;
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
    this.services = new Map<string, BaseService>();
    this.runtime = this.createRuntime();
    this.registerServices({
      explicitServices: options.services || [],
      useBuiltinServices: options.useBuiltinServices === true,
    });
    this.pluginSystemProviders = this.resolvePlugins({
      explicitPlugins: options.plugins,
      useBuiltinPlugins: options.useBuiltinPlugins === true,
    });
    this.pluginRegistry = this.createPluginRegistry(this.pluginSystemProviders);
    this.plugins = this.createPluginPort();
    this.serviceContext = this.createServiceContext();
    setShellToolRuntime(this.serviceContext.invoke);
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
    return this.serviceContext;
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
   * 获取或创建一个 session。
   */
  async session(sessionId?: string): Promise<Session> {
    const session = this.getOrCreateSession(sessionId);
    await session.initialize();
    await this.configureSession(session);
    return session;
  }

  /**
   * 列出当前 agent 的全部 session 元数据。
   */
  async sessions(): Promise<AgentSessionMetadata[]> {
    const rootDir = getSdkAgentSessionsRootDirPath(this.path, this.id);
    if (!(await fs.pathExists(rootDir))) return [];
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const items: AgentSessionMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let sessionId = "";
      try {
        sessionId = decodeURIComponent(entry.name);
      } catch {
        sessionId = entry.name;
      }
      if (!sessionId) continue;
      const session = await this.session(sessionId);
      items.push(await session.toMetadata());
    }
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return items;
  }

  /**
   * 确保显式注入的 services 已启动。
   */
  async ensureServicesStarted(): Promise<void> {
    if (this.servicesStartPromise) {
      await this.servicesStartPromise;
      return;
    }
    this.servicesStartPromise = (async () => {
      for (const service of this.services.values()) {
        await service.lifecycle?.start?.(this.serviceContext);
      }
    })();
    await this.servicesStartPromise;
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

  private registerServices(input: {
    explicitServices: BaseService[];
    useBuiltinServices: boolean;
  }): void {
    const explicitServices = input.explicitServices;
    const builtinServices = input.useBuiltinServices
      ? [...createRegisteredServiceInstances(this.runtime).values()]
      : [];
    for (const service of [...builtinServices, ...explicitServices]) {
      const name = String(service?.name || "").trim();
      if (!name) {
        throw new Error("Agent received a service without a valid name");
      }
      if (this.services.has(name)) {
        throw new Error(`Duplicate service registration: ${name}`);
      }
      service.bindAgent(this.runtime);
      this.services.set(name, service);
    }
  }

  private resolvePlugins(input: {
    explicitPlugins?: Plugin[];
    useBuiltinPlugins: boolean;
  }): Plugin[] {
    const plugins = input.useBuiltinPlugins ? [...PLUGINS] : [];
    if (Array.isArray(input.explicitPlugins)) {
      plugins.push(...input.explicitPlugins);
    }
    return plugins;
  }

  private createPluginRegistry(input: Plugin[]): PluginRegistry {
    let pluginRegistryRef: PluginRegistry | null = null;
    const hookRegistry = new HookRegistry({
      contextResolver: () => this.serviceContext,
      pluginEnabledChecker: (pluginName) => {
        const plugin = pluginRegistryRef?.get(pluginName);
        return plugin ? isPluginEnabled({ plugin, context: this.serviceContext }) : false;
      },
    });
    const registry = new PluginRegistry({
      contextResolver: () => this.serviceContext,
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
    for (const plugin of this.pluginSystemProviders) {
      if (typeof plugin.system !== "function") continue;
      try {
        if (!isPluginEnabled({ plugin, context: this.serviceContext })) continue;
        if (typeof plugin.availability === "function") {
          const availability = await plugin.availability(this.serviceContext);
          if (!availability.available) continue;
        }
        const text = String(await plugin.system(this.serviceContext)).trim();
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

  private async loadServiceSystemBlocks(): Promise<AgentSessionSystemBlock[]> {
    const out: AgentSessionSystemBlock[] = [];
    for (const service of this.services.values()) {
      if (typeof service.system !== "function") continue;
      try {
        const text = String(await service.system(this.serviceContext)).trim();
        if (!text) continue;
        out.push({
          source: "service",
          name: service.name,
          content: text,
        });
      } catch {
        // 单个 service system 失败不应阻断 SDK session 主链路。
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
      paths: createAgentPathRuntime(this.path),
      pluginConfig: createAgentPluginConfigRuntime(this.path),
      platform: this.platform,
      getSession: (sessionId: string): SessionPort =>
        this.getOrCreateSession(sessionId).getServicePort(),
      listExecutingSessionIds: () =>
        [...this.sessionsById.values()]
          .filter((session) => session.isExecuting())
          .map((session) => session.id),
      getExecutingSessionCount: () =>
        [...this.sessionsById.values()].filter((session) => session.isExecuting()).length,
      services: this.services,
    } satisfies AgentRuntime;
    return runtime;
  }

  private createServiceContext(): AgentContext {
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
        get: (sessionId) => this.getOrCreateSession(sessionId).getServicePort(),
        listExecutingSessionIds: () => this.runtime.listExecutingSessionIds(),
        getExecutingSessionCount: () => this.runtime.getExecutingSessionCount(),
        resolveModel: async (sessionId) => {
          const session = await this.session(sessionId);
          return session.config.model;
        },
      },
      invoke: {
        invoke: async (params: {
          service: string;
          action: string;
          payload?: JsonValue;
        }) => {
          const serviceName = String(params.service || "").trim();
          const actionName = String(params.action || "").trim();
          const service = this.services.get(serviceName);
          if (!service) {
            return {
              success: false,
              error: `Unknown service: ${serviceName}`,
            };
          }
          const action = service.actions[actionName];
          if (!action) {
            return {
              success: false,
              error: `Unknown action: ${serviceName}.${actionName}`,
            };
          }
          const result = await action.execute({
            context,
            payload: params.payload ?? null,
            serviceName,
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
        appendExecSessionMessage: async (params) => {
          await appendExecSessionMessage({
            context,
            sessionId: params.sessionId,
            text: params.text,
            extra: params.extra,
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
      getServiceSystemBlocks: () => this.loadServiceSystemBlocks(),
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
