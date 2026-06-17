/**
 * AgentBackgroundService：本地 Agent 后台能力生命周期服务。
 *
 * 关键点（中文）
 * - 统一管理 plugins 与 ActionSchedule 的启动 / 停止。
 * - 在 Agent 构造阶段自动启动后台能力，调用方通过 `await agent.ready()` 等待启动完成。
 * - RPC / HTTP 等 transport 不再属于 Agent 内部职责，由 `@downcity/server` 等外部包按需挂载。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { ActionScheduleRuntimeHandle } from "@/plugin/core/ActionScheduleRuntime.js";
import { startActionScheduleRuntime } from "@/plugin/core/ActionScheduleRuntime.js";
import { startAllPlugins, stopAllPlugins } from "@/plugin/core/Manager.js";
import type { Shell } from "@downcity/shell";

type AgentBackgroundServiceOptions = {
  /**
   * 当前统一日志器。
   */
  logger: Logger;

  /**
   * 当前 agent context。
   */
  agent_context: AgentContext;

  /**
   * 读取当前 agent 挂载的 Shell。
   */
  get_shell?: () => Shell | undefined;
};

/**
 * 本地 Agent 后台能力生命周期服务。
 *
 * 关键点（中文）
 * - 构造时自动触发 plugin lifecycle 与 ActionSchedule 启动。
 * - 失败由 logger.error 记录，不抛错；调用方通过 `ready()` 等待启动完成。
 */
export class AgentBackgroundService {
  private readonly logger: Logger;
  private readonly agent_context: AgentContext;
  private readonly get_shell: AgentBackgroundServiceOptions["get_shell"];

  private plugins_started = false;
  private action_schedule_runtime: ActionScheduleRuntimeHandle | null = null;
  private ready_promise: Promise<void> | null = null;

  constructor(options: AgentBackgroundServiceOptions) {
    this.logger = options.logger;
    this.agent_context = options.agent_context;
    this.get_shell = options.get_shell;
    // 关键点（中文）：Agent 构造完成即触发后台启动，不再要求外部显式 `start()`。
    this.ready_promise = this.boot();
  }

  /**
   * 等待后台能力启动完成。
   */
  async ready(): Promise<void> {
    if (!this.ready_promise) return;
    await this.ready_promise;
  }

  /**
   * 释放当前 Agent 的后台能力。
   */
  async dispose(): Promise<void> {
    if (this.ready_promise) {
      await this.ready_promise.catch(() => undefined);
      this.ready_promise = null;
    }
    if (this.plugins_started) {
      await this.stop_action_schedule_runtime();
      await stopAllPlugins(this.agent_context);
      this.plugins_started = false;
    }
    await this.get_shell?.()?.dispose();
  }

  private async boot(): Promise<void> {
    await this.ensure_plugins_started();
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
}
