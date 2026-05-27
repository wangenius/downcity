/**
 * Agent SDK 本地入口。
 *
 * 关键点（中文）
 * - `Agent` 现在是实例外观层，长期运行状态下沉到 `AgentCore`。
 * - session、HTTP、RPC、plugin lifecycle 都按需异步初始化。
 * - `start/stop` 是唯一公开的长期运行生命周期入口。
 */

import type { Tool } from "ai";
import type {
  PluginPort,
} from "@/plugin/types/Plugin.js";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type {
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
} from "@/sdk/AgentSdkTypes.js";
import { AgentCore } from "@/core/AgentCore.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import { startServer } from "@/runtime/server/http/Server.js";
import { startLocalRpcServer } from "@/runtime/server/rpc/Server.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  private readonly core: AgentCore;
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly plugins: PluginPort;
  private pluginsStarted = false;
  private startPromise: Promise<AgentStartResult> | null = null;
  private httpBinding: AgentHttpBinding | null = null;
  private rpcBinding: AgentRpcBinding | null = null;
  private readonly sessionCollection: AgentSessionCollection;

  constructor(options: AgentOptions) {
    this.core = new AgentCore(options);
    this.id = this.core.id;
    this.path = this.core.path;
    this.tools = this.core.tools;
    this.plugins = this.core.plugins;
    this.sessionCollection = {
      createSession: async (input) => await this.core.createSession(input),
      getSession: async (sessionId) => await this.core.getSession(sessionId),
      listSessions: async (input) => await this.core.listSessions(input),
    };
  }

  /**
   * 新建一个 session。
   */
  async createSession(input?: AgentCreateSessionInput): Promise<AgentSession> {
    return await this.core.createSession(input);
  }

  /**
   * 获取一个已存在的 session。
   */
  async getSession(sessionId: string): Promise<AgentSession> {
    return await this.core.getSession(sessionId);
  }

  /**
   * 列出当前 agent 的 session 摘要页。
   */
  async listSessions(
    input?: AgentListSessionsInput,
  ): Promise<AgentSessionSummaryPage> {
    return await this.core.listSessions(input);
  }

  /**
   * 确保当前 plugins 已启动。
   */
  private async ensurePluginsStarted(): Promise<void> {
    if (this.pluginsStarted) return;
    const lifecycle = await startAllPlugins(this.core.getContext());
    this.pluginsStarted = true;
    for (const item of lifecycle.results) {
      if (!item.success) {
        this.core.getLogger().error(
          `Plugin start failed: ${item.plugin?.name || "unknown"} - ${item.error || "unknown error"}`,
        );
      }
    }
  }

  /**
   * 启动当前 agent 实例的长期运行能力。
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
   */
  async stop(): Promise<AgentStopResult> {
    const pluginsStarted = this.pluginsStarted;
    const rpcStarted = this.rpcBinding !== null;
    const httpStarted = this.httpBinding !== null;

    if (pluginsStarted) {
      await stopAllPlugins(this.core.getContext());
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
    this.core.setInstruction(input);
  }

  /**
   * 返回当前项目根目录解析后的配置快照。
   */
  getConfig(): DowncityConfig {
    return this.core.getConfig();
  }

  /**
   * 返回当前 agent 绑定的统一日志器。
   */
  getLogger(): Logger {
    return this.core.getLogger();
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
      getAgentRuntime: () => this.core.getRuntime(),
      getAgentContext: () => this.core.getContext(),
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
      context: this.core.getContext(),
      runtime: this.core.getRuntime(),
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
}
