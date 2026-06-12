/**
 * ShellPlugin：shell plugin 的类实现。
 *
 * 关键点（中文）
 * - shell session map 与 bound runtime 都归属于 plugin 实例。
 * - agent 持有 ShellPlugin 实例，从而形成 per-agent shell 状态边界。
 * - ShellActionRuntime 只保留纯运行时流程，不再承载模块级单例状态。
 */

import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { PluginActions } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { getSessionRunContext } from "@downcity/agent/internal/executor/SessionRunScope.js";
import { readChatMetaBySessionId } from "@/chat/runtime/ChatMetaStore.js";
import { resolveChatQueueStore } from "@/chat/runtime/ChatQueueStore.js";
import type { ShellHostContext } from "@downcity/shell/types/ShellHostContext.js";
import type {
  ShellPluginState,
  ShellSessionRuntimeState,
} from "@downcity/shell/session/ShellRuntimeTypes.js";
import type { ShellPluginOptions } from "@downcity/shell/types/ShellPluginOptions.js";
import type {
  ShellCloseRequest,
  ShellExecRequest,
  ShellQueryRequest,
  ShellReadRequest,
  ShellStartRequest,
  ShellWaitRequest,
  ShellWriteRequest,
} from "@downcity/shell/types/ShellPlugin.js";
import {
  bindShellRuntime,
  closeAllShellSessions,
  closeShellSession,
  createShellPluginState,
  approveShellApproval,
  denyShellApproval,
  execShellCommand,
  getShellSessionStatus,
  listShellApprovals,
  readShellSession,
  startShellSession,
  waitShellSession,
  writeShellSession,
} from "@downcity/shell/session/ShellActionRuntime.js";

function withShellIntegration(context: AgentContext): ShellHostContext {
  const shell_context = context as unknown as ShellHostContext;
  shell_context.shellIntegration = {
    getRunContext: () => getSessionRunContext(),
    readChatMeta: async ({ context: ctx, sessionId }) =>
      await readChatMetaBySessionId({
        context: ctx as unknown as AgentContext,
        sessionId,
      }),
    enqueueChat: (ctx, input) => {
      resolveChatQueueStore(ctx as unknown as AgentContext).enqueue(input as never);
    },
  };
  return shell_context;
}

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

  constructor(options: ShellPluginOptions = {}) {
    super();
    this.state = createShellPluginState(options);
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
      approvals: {
        execute: async () => ({
          success: true,
          data: { approvals: listShellApprovals(this.state) },
        }),
      },
      approve: {
        execute: async (params) => {
          const payload = params.payload as { approvalId?: unknown; approval_id?: unknown };
          const approvalId = String(payload?.approvalId || payload?.approval_id || "").trim();
          if (!approvalId) {
            return { success: false, error: "approvalId is required" };
          }
          const ok = await approveShellApproval(this.state, withShellIntegration(params.context), approvalId);
          return {
            success: ok,
            data: { approvalId, approved: ok },
            ...(ok ? {} : { error: "approval request not found" }),
          };
        },
      },
      deny: {
        execute: async (params) => {
          const payload = params.payload as { approvalId?: unknown; approval_id?: unknown };
          const approvalId = String(payload?.approvalId || payload?.approval_id || "").trim();
          if (!approvalId) {
            return { success: false, error: "approvalId is required" };
          }
          const ok = await denyShellApproval(this.state, withShellIntegration(params.context), approvalId);
          return {
            success: ok,
            data: { approvalId, denied: ok },
            ...(ok ? {} : { error: "approval request not found" }),
          };
        },
      },
    };

    this.lifecycle = {
      start: async (context) => {
        bindShellRuntime(this.state, withShellIntegration(context));
      },
      stop: async () => {
        await closeAllShellSessions(this.state, true);
        for (const session of this.state.sessions.values()) {
          if (session.cleanupTimer) {
            clearTimeout(session.cleanupTimer);
          }
        }
        this.state.sessions.clear();
        this.state.approvals.clear();
        this.state.context = null;
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
    return await startShellSession(this.state, withShellIntegration(context), request);
  }

  /**
   * 查询 shell session 状态。
   */
  async status(
    context: AgentContext,
    request: ShellQueryRequest,
  ) {
    return await getShellSessionStatus(this.state, withShellIntegration(context), request);
  }

  /**
   * 读取 shell session 输出。
   */
  async read(
    context: AgentContext,
    request: ShellReadRequest,
  ) {
    return await readShellSession(this.state, withShellIntegration(context), request);
  }

  /**
   * 向 shell session 写入 stdin。
   */
  async write(
    context: AgentContext,
    request: ShellWriteRequest,
  ) {
    return await writeShellSession(this.state, withShellIntegration(context), request);
  }

  /**
   * 等待 shell session 状态变化。
   */
  async wait(
    context: AgentContext,
    request: ShellWaitRequest,
  ) {
    return await waitShellSession(this.state, withShellIntegration(context), request);
  }

  /**
   * 关闭 shell session。
   */
  async close(
    context: AgentContext,
    request: ShellCloseRequest,
  ) {
    return await closeShellSession(this.state, withShellIntegration(context), request);
  }

  /**
   * 执行一次 one-shot shell command。
   */
  async exec(
    context: AgentContext,
    request: ShellExecRequest,
  ) {
    return await execShellCommand(this.state, withShellIntegration(context), request);
  }
}
