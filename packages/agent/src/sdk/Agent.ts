/**
 * Agent SDK 本地入口。
 *
 * 关键点（中文）
 * - `Agent` 现在是实例外观层，长期运行状态下沉到 `AgentCore`。
 * - session、HTTP、RPC、runtime plugin lifecycle 都按需异步初始化。
 * - `start/stop` 是唯一公开的长期运行生命周期入口。
 */

import type { Tool } from "ai";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type {
  PluginPort,
} from "@/plugin/types/Plugin.js";
import type {
  AgentOptions,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
  AgentHttpBinding,
  AgentHttpStartOptions,
  AgentRpcBinding,
  AgentSessionMetadata,
} from "@/sdk/AgentSdkTypes.js";
import { Session } from "@/sdk/Session.js";
import { AgentCore } from "@/core/AgentCore.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import { startServer } from "@/runtime/server/http/Server.js";
import { startLocalRpcServer } from "@/runtime/server/rpc/Server.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly core: AgentCore;
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly runtimePlugins: Map<string, BasePlugin>;
  readonly plugins: PluginPort;
  private runtimePluginsStarted = false;
  private startPromise: Promise<AgentStartResult> | null = null;
  private httpBinding: AgentHttpBinding | null = null;
  private rpcBinding: AgentRpcBinding | null = null;

  constructor(options: AgentOptions) {
    this.core = new AgentCore(options);
    this.id = this.core.id;
    this.path = this.core.path;
    this.tools = this.core.tools;
    this.runtimePlugins = this.core.runtimePlugins;
    this.plugins = this.core.plugins;
  }

  /**
   * 获取或创建一个 session。
   */
  async session(sessionId?: string): Promise<Session> {
    return await this.core.session(sessionId);
  }

  /**
   * 列出当前 agent 的全部 session 元数据。
   */
  async sessions(): Promise<AgentSessionMetadata[]> {
    return await this.core.sessions();
  }

  /**
   * 确保显式注入的 runtime plugins 已启动。
   */
  async ensureRuntimePluginsStarted(): Promise<void> {
    if (this.runtimePluginsStarted) return;
    const lifecycle = await startAllPlugins(this.getContext());
    this.runtimePluginsStarted = true;
    for (const item of lifecycle.results) {
      if (!item.success) {
        this.getRuntime().logger.error(
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
      const shouldStartRuntimePlugins = options?.runtimePlugins !== false;

      if (shouldStartRuntimePlugins) {
        await this.ensureRuntimePluginsStarted();
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
        runtimePluginsStarted: this.runtimePluginsStarted,
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
    const runtimePluginsStarted = this.runtimePluginsStarted;
    const rpcStarted = this.rpcBinding !== null;
    const httpStarted = this.httpBinding !== null;

    if (runtimePluginsStarted) {
      await stopAllPlugins(this.getContext());
      this.runtimePluginsStarted = false;
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
      runtimePluginsStopped: runtimePluginsStarted,
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
   * 返回实例级 runtime 视图。
   */
  getRuntime(): AgentRuntime {
    return this.core.getRuntime();
  }

  /**
   * 返回实例级执行上下文。
   */
  getContext(): AgentContext {
    return this.core.getContext();
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
      core: this.core,
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
      core: this.core,
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
