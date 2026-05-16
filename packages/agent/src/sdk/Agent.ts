/**
 * Agent SDK 本地入口。
 *
 * 关键点（中文）
 * - `new Agent({ id, path, tools, services })` 只做同步装配，不在构造阶段启动任何 I/O。
 * - session、HTTP、RPC、service lifecycle 都按需异步初始化。
 * - SDK Agent 通过最小 `AgentContext` 适配层复用现有 service/chat runtime，而不是重复实现一套执行链。
 */

import fs from "fs-extra";
import { nanoid } from "nanoid";
import type { Tool } from "ai";
import { Logger } from "@shared/utils/logger/Logger.js";
import type { BaseService } from "@services/BaseService.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { JsonValue } from "@/shared/types/Json.js";
import type {
  AgentOptions,
  AgentSessionMetadata,
} from "@/types/sdk/AgentSdk.js";
import { SdkSession } from "@/sdk/Session.js";
import { loadStaticSystemPrompts } from "@session/composer/system/default/StaticPromptCatalog.js";
import { getSdkAgentSessionsRootDirPath } from "@/sdk/Paths.js";
import { SdkAgentHttpServer } from "@/sdk/HttpServer.js";
import { SdkAgentRpcServer } from "@/sdk/RpcServer.js";
import { createAgentPathRuntime } from "@/runtime/AgentHostRuntime.js";
import { loadDowncityConfig } from "@/config/Config.js";
import { appendExecSessionMessage } from "@services/chat/runtime/ChatIngressStore.js";
import { readChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";
import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueueStore.js";

function createFallbackSdkConfig(agentId: string): DowncityConfig {
  return {
    name: agentId,
    version: "0.0.0",
  } as DowncityConfig;
}

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly http: SdkAgentHttpServer;
  readonly rpc: SdkAgentRpcServer;
  readonly services: Map<string, BaseService>;

  private readonly logger: Logger;
  private readonly sessionsById = new Map<string, SdkSession>();
  private readonly runtime: AgentRuntime;
  private readonly serviceContext: AgentContext;
  private readonly config: DowncityConfig;
  private systems: string[];
  private servicesStartPromise: Promise<void> | null = null;

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
    this.systems = loadStaticSystemPrompts(this.path);
    this.config = this.loadConfig();
    this.services = this.createServiceMap(options.services || []);
    this.runtime = this.createRuntime();
    for (const service of this.services.values()) {
      service.bindAgent(this.runtime);
    }
    this.serviceContext = this.createServiceContext();
    this.http = new SdkAgentHttpServer(this);
    this.rpc = new SdkAgentRpcServer(this);
  }

  /**
   * 获取或创建一个 session。
   */
  async session(sessionId?: string): Promise<SdkSession> {
    const session = this.getOrCreateSession(sessionId);
    await session.initialize();
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
   * 刷新静态 system 文本集合。
   */
  reloadStaticPrompts(): void {
    this.systems = loadStaticSystemPrompts(this.path);
  }

  private loadConfig(): DowncityConfig {
    try {
      return loadDowncityConfig(this.path, {
        projectEnv: {},
        agentEnv: {},
        globalEnv: {},
      });
    } catch {
      return createFallbackSdkConfig(this.id);
    }
  }

  private createServiceMap(input: BaseService[]): Map<string, BaseService> {
    const services = new Map<string, BaseService>();
    for (const service of input) {
      const name = String(service?.name || "").trim();
      if (!name) {
        throw new Error("Agent received a service without a valid name");
      }
      if (services.has(name)) {
        throw new Error(`Duplicate service registration: ${name}`);
      }
      services.set(name, service);
    }
    return services;
  }

  private createRuntime(): AgentRuntime {
    const runtime = {
      cwd: this.path,
      rootPath: this.path,
      logger: this.logger,
      config: this.config,
      env: {},
      globalEnv: {},
      systems: this.systems,
      paths: createAgentPathRuntime(this.path),
      pluginConfig: {
        async persistProjectPlugins(): Promise<string> {
          return "";
        },
      },
      model: undefined,
      getSession: (sessionId: string) => {
        return this.getOrCreateSession(sessionId).getServicePort() as never;
      },
      listExecutingSessionIds: () =>
        [...this.sessionsById.values()]
          .filter((session) => session.isExecuting())
          .map((session) => session.id),
      getExecutingSessionCount: () =>
        [...this.sessionsById.values()].filter((session) => session.isExecuting()).length,
      services: this.services,
    } satisfies Omit<AgentRuntime, "getSession"> & {
      getSession(sessionId: string): never;
    };
    return runtime as unknown as AgentRuntime;
  }

  private createServiceContext(): AgentContext {
    let context!: AgentContext;
    context = {
      agent: this.runtime,
      cwd: this.path,
      rootPath: this.path,
      logger: this.logger,
      config: this.config,
      env: {},
      globalEnv: {},
      systems: this.systems,
      paths: this.runtime.paths,
      pluginConfig: this.runtime.pluginConfig,
      session: {
        get: (sessionId) => this.getOrCreateSession(sessionId).getServicePort(),
        listExecutingSessionIds: () => this.runtime.listExecutingSessionIds(),
        getExecutingSessionCount: () => this.runtime.getExecutingSessionCount(),
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
      plugins: {
        list: () => [],
        availability: async () => ({
          enabled: false,
          available: false,
          reasons: ["SDK Agent plugin runtime is not configured"],
        }),
        runAction: async () => ({
          success: false,
          error: "SDK Agent plugin runtime is not configured",
        }),
        pipeline: async <T>(_: string, value: T): Promise<T> => value,
        guard: async (): Promise<void> => {},
        effect: async (): Promise<void> => {},
        resolve: async () => {
          throw new Error("SDK Agent plugin resolve is not configured");
        },
      },
    };
    return context;
  }

  private getOrCreateSession(sessionId?: string): SdkSession {
    const resolvedSessionId =
      String(sessionId || "").trim() || `session-${Date.now()}-${nanoid(8)}`;
    const cached = this.sessionsById.get(resolvedSessionId);
    if (cached) return cached;

    const created = new SdkSession({
      agentId: this.id,
      projectRoot: this.path,
      sessionId: resolvedSessionId,
      tools: this.tools,
      logger: this.logger,
      getStaticSystemPrompts: () => this.systems,
    });
    this.sessionsById.set(resolvedSessionId, created);
    return created;
  }
}
