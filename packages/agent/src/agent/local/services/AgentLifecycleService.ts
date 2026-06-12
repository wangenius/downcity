/**
 * AgentLifecycleService：本地 Agent 生命周期服务。
 *
 * 关键点（中文）
 * - 统一管理 plugins、ActionSchedule 与本机 RPC 的启动/停止。
 * - 该服务只负责长期后台能力生命周期，不负责 session 构造与运行时装配。
 * - facade 通过它暴露 `start()` / `stop()` 语义，避免生命周期状态散落在 Agent 主类中。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type {
  AgentRpcBinding,
  AgentRpcStartOptions,
  AgentSessionCollection,
  AgentStartOptions,
  AgentStartResult,
  AgentStopResult,
} from "@/types/agent/AgentTypes.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { ActionScheduleRuntimeHandle } from "@/plugin/core/ActionScheduleRuntime.js";
import { startActionScheduleRuntime } from "@/plugin/core/ActionScheduleRuntime.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import { startRpcServer } from "@/rpc/Server.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { Shell } from "@downcity/shell";

type AgentLifecycleServiceOptions = {
  /**
   * 当前统一日志器。
   */
  logger: Logger;

  /**
   * 当前 agent context。
   */
  agent_context: AgentContext;

  /**
   * 当前 session collection。
   */
  session_collection: AgentSessionCollection;

  /**
   * 读取当前 agent runtime。
   */
  get_runtime: () => AgentRuntime;

  /**
   * 读取当前 agent 挂载的 Shell。
   */
  get_shell?: () => Shell | undefined;
};

/**
 * 本地 Agent 生命周期服务。
 */
export class AgentLifecycleService {
  private readonly logger: Logger;
  private readonly agent_context: AgentContext;
  private readonly session_collection: AgentSessionCollection;
  private readonly get_runtime: AgentLifecycleServiceOptions["get_runtime"];
  private readonly get_shell: AgentLifecycleServiceOptions["get_shell"];

  private plugins_started = false;
  private action_schedule_runtime: ActionScheduleRuntimeHandle | null = null;
  private start_promise: Promise<AgentStartResult> | null = null;
  private rpc_binding: AgentRpcBinding | null = null;

  constructor(options: AgentLifecycleServiceOptions) {
    this.logger = options.logger;
    this.agent_context = options.agent_context;
    this.session_collection = options.session_collection;
    this.get_runtime = options.get_runtime;
    this.get_shell = options.get_shell;
  }

  /**
   * 启动当前 agent 实例的长期运行能力。
   */
  async start(options?: AgentStartOptions): Promise<AgentStartResult> {
    if (this.start_promise) {
      return await this.start_promise;
    }
    this.start_promise = (async () => {
      const should_start_plugins = options?.plugins !== false;
      if (should_start_plugins) {
        await this.ensure_plugins_started();
      }
      const rpc_binding =
        options?.rpc === false || options?.rpc === undefined
          ? undefined
          : await this.start_rpc(options.rpc);
      return {
        ...(rpc_binding ? { rpc: rpc_binding } : {}),
        pluginsStarted: this.plugins_started,
      };
    })();
    try {
      return await this.start_promise;
    } catch (error) {
      this.start_promise = null;
      throw error;
    }
  }

  /**
   * 停止当前 agent 实例的长期运行能力。
   */
  async stop(): Promise<AgentStopResult> {
    const plugins_started = this.plugins_started;
    const rpc_started = this.rpc_binding !== null;

    if (plugins_started) {
      await this.stop_action_schedule_runtime();
      await stopAllPlugins(this.agent_context);
      this.plugins_started = false;
    }

    if (rpc_started) {
      await this.stop_rpc();
    }

    await this.get_shell?.()?.dispose();

    this.start_promise = null;

    return {
      rpcStopped: rpc_started,
      pluginsStopped: plugins_started,
    };
  }

  private async ensure_plugins_started(): Promise<void> {
    if (this.plugins_started) return;
    const lifecycle = await startAllPlugins(this.agent_context);
    this.plugins_started = true;
    for (const item of lifecycle.results) {
      if (!item.success) {
        this.logger.error(
          `Plugin start failed: ${item.plugin?.name || "unknown"} - ${item.error || "unknown error"}`,
        );
      }
    }
    await this.ensure_action_schedule_runtime_started();
  }

  private async ensure_action_schedule_runtime_started(): Promise<void> {
    if (this.action_schedule_runtime) return;
    try {
      this.action_schedule_runtime = await startActionScheduleRuntime(
        this.agent_context,
      );
    } catch (error) {
      this.logger.error(`ActionSchedule start failed: ${String(error)}`);
    }
  }

  private async stop_action_schedule_runtime(): Promise<void> {
    const runtime = this.action_schedule_runtime;
    this.action_schedule_runtime = null;
    runtime?.stop();
  }

  private async start_rpc(
    options?: AgentRpcStartOptions,
  ): Promise<AgentRpcBinding> {
    if (this.rpc_binding) {
      return this.rpc_binding;
    }
    const host = String(options?.host || "127.0.0.1").trim() || "127.0.0.1";
    const port =
      typeof options?.port === "number" && Number.isInteger(options.port)
        ? options.port
        : 15314;
    const server = await startRpcServer({
      host,
      port,
      sessionCollection: this.session_collection,
      getAgentContext: () => this.agent_context,
      getAgentRuntime: () => this.get_runtime(),
      getShell: () => this.get_shell?.(),
    });
    this.rpc_binding = {
      url: `rpc://${host}:${port}`,
      host,
      port,
      server,
    };
    return this.rpc_binding;
  }

  private async stop_rpc(): Promise<void> {
    if (!this.rpc_binding) return;
    const current = this.rpc_binding;
    this.rpc_binding = null;
    await current.server.stop();
  }
}
