/**
 * ShellPlugin：shell plugin 的类实现。
 *
 * 关键点（中文）
 * - shell session map 与 bound runtime 都归属于 plugin 实例。
 * - agent 持有 ShellPlugin 实例，从而形成 per-agent shell 状态边界。
 * - ShellActionRuntime 只保留纯运行时流程，不再承载模块级单例状态。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { PluginActions } from "@/plugin/types/Plugin.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type {
  ShellPluginState,
  ShellSessionRuntimeState,
} from "@/plugin/builtins/shell/ShellRuntimeTypes.js";
import type {
  ShellCloseRequest,
  ShellExecRequest,
  ShellQueryRequest,
  ShellReadRequest,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@/plugin/builtins/shell/types/ShellPlugin.js";
import {
  bindShellRuntime,
  closeAllShellSessions,
  closeShellSession,
  createShellPluginState,
  execShellCommand,
  getShellSessionStatus,
  readShellSession,
  startShellSession,
  waitShellSession,
  writeShellSession,
} from "./runtime/ShellActionRuntime.js";

/**
 * Shell plugin 类实现。
 */
export class ShellPlugin extends BasePlugin {
  /**
   * plugin 名称。
   */
  readonly name = "shell";

  /**
   * 当前实例持有的 shell 状态对象。
   */
  private readonly state: ShellPluginState;

  /**
   * 当前实例暴露的 action 定义表。
   */
  readonly actions: PluginActions;

  /**
   * 当前实例持有的 in-memory shell sessions。
   */
  public readonly sessions: Map<string, ShellSessionRuntimeState>;

  constructor(agent: AgentRuntime | null) {
    super(agent);
    this.state = createShellPluginState();
    this.sessions = this.state.sessions;
    this.actions = {
      exec: {
        execute: async (params) => ({
          success: true,
          data: await this.exec(params.context, params.payload as ShellExecRequest),
        }),
      },
      start: {
        execute: async (params) => ({
          success: true,
          data: await this.start(params.context, params.payload as ShellStartRequest),
        }),
      },
      status: {
        execute: async (params) => ({
          success: true,
          data: await this.status(params.context, params.payload as ShellQueryRequest),
        }),
      },
      read: {
        execute: async (params) => ({
          success: true,
          data: await this.read(params.context, params.payload as ShellReadRequest),
        }),
      },
      write: {
        execute: async (params) => ({
          success: true,
          data: await this.write(params.context, params.payload as ShellWriteRequest),
        }),
      },
      wait: {
        execute: async (params) => ({
          success: true,
          data: await this.wait(params.context, params.payload as ShellWaitRequest),
        }),
      },
      close: {
        execute: async (params) => ({
          success: true,
          data: await this.close(params.context, params.payload as ShellCloseRequest),
        }),
      },
    };

    this.lifecycle = {
      start: async (context) => {
        bindShellRuntime(this.state, context);
      },
      stop: async () => {
        await closeAllShellSessions(this.state, true);
        for (const session of this.state.sessions.values()) {
          if (session.cleanupTimer) {
            clearTimeout(session.cleanupTimer);
          }
        }
        this.state.sessions.clear();
        this.state.boundRuntime = null;
      },
    };
  }

  /**
   * 启动一个 shell session。
   */
  async start(
    context: AgentContext,
    request: ShellStartRequest,
  ) {
    return await startShellSession(this.state, context, request);
  }

  /**
   * 查询 shell session 状态。
   */
  async status(
    context: AgentContext,
    request: ShellQueryRequest,
  ) {
    return await getShellSessionStatus(this.state, context, request);
  }

  /**
   * 读取 shell session 输出。
   */
  async read(
    context: AgentContext,
    request: ShellReadRequest,
  ) {
    return await readShellSession(this.state, context, request);
  }

  /**
   * 向 shell session 写入 stdin。
   */
  async write(
    context: AgentContext,
    request: ShellWriteRequest,
  ) {
    return await writeShellSession(this.state, context, request);
  }

  /**
   * 等待 shell session 状态变化。
   */
  async wait(
    context: AgentContext,
    request: ShellWaitRequest,
  ) {
    return await waitShellSession(this.state, context, request);
  }

  /**
   * 关闭 shell session。
   */
  async close(
    context: AgentContext,
    request: ShellCloseRequest,
  ) {
    return await closeShellSession(this.state, context, request);
  }

  /**
   * 执行一次 one-shot shell command。
   */
  async exec(
    context: AgentContext,
    request: ShellExecRequest,
  ) {
    return await execShellCommand(this.state, context, request);
  }
}
