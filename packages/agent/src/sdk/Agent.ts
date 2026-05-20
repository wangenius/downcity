/**
 * Agent SDK 本地入口。
 *
 * 关键点（中文）
 * - `Agent` 现在是实例外观层，长期运行状态下沉到 `AgentCore`。
 * - session、HTTP、RPC、service lifecycle 都按需异步初始化。
 * - `start/stop` 负责统一收口当前 agent 实例的生命周期。
 */

import type { Tool } from "ai";
import type { BaseService } from "@/service/builtins/BaseService.js";
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
  AgentSessionMetadata,
} from "@/sdk/AgentSdkTypes.js";
import { Session } from "@/sdk/Session.js";
import { SdkAgentHttpServer } from "@/sdk/HttpServer.js";
import { SdkAgentRpcServer } from "@/sdk/RpcServer.js";
import { AgentCore } from "@/core/AgentCore.js";
import { startAllServices, stopAllServices } from "@/service/core/Manager.js";

/**
 * SDK 本地 Agent。
 */
export class Agent {
  readonly core: AgentCore;
  readonly id: string;
  readonly path: string;
  readonly tools: Record<string, Tool>;
  readonly http: SdkAgentHttpServer;
  readonly rpc: SdkAgentRpcServer;
  readonly services: Map<string, BaseService>;
  readonly plugins: PluginPort;
  private servicesStarted = false;
  private startPromise: Promise<AgentStartResult> | null = null;

  constructor(options: AgentOptions) {
    this.core = new AgentCore(options);
    this.id = this.core.id;
    this.path = this.core.path;
    this.tools = this.core.tools;
    this.services = this.core.services;
    this.plugins = this.core.plugins;
    this.http = new SdkAgentHttpServer(this);
    this.rpc = new SdkAgentRpcServer(this);
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
   * 确保显式注入的 services 已启动。
   */
  async ensureServicesStarted(): Promise<void> {
    if (this.servicesStarted) return;
    const lifecycle = await startAllServices(this.getContext());
    this.servicesStarted = true;
    for (const item of lifecycle.results) {
      if (!item.success) {
        this.getRuntime().logger.error(
          `Service start failed: ${item.service?.name || "unknown"} - ${item.error || "unknown error"}`,
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
      const shouldStartServices = options?.services !== false;

      if (shouldStartServices) {
        await this.ensureServicesStarted();
      }

      const httpBinding =
        options?.http === false || options?.http === undefined
          ? undefined
          : await this.http.start(options.http);
      const rpcBinding =
        options?.rpc === true
          ? await this.rpc.start()
          : undefined;

      return {
        ...(httpBinding ? { http: httpBinding } : {}),
        ...(rpcBinding ? { rpc: rpcBinding } : {}),
        servicesStarted: this.servicesStarted,
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
    const servicesStarted = this.servicesStarted;
    const rpcStarted = this.rpc.isStarted();
    const httpStarted = this.http.isStarted();

    if (servicesStarted) {
      await stopAllServices(this.getContext());
      this.servicesStarted = false;
    }

    if (rpcStarted) {
      await this.rpc.stop();
    }

    if (httpStarted) {
      await this.http.stop();
    }

    this.startPromise = null;

    return {
      httpStopped: httpStarted,
      rpcStopped: rpcStarted,
      servicesStopped: servicesStarted,
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
}
