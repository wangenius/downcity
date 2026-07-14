/**
 * Shell 对象入口。
 *
 * 关键点（中文）
 * - Shell 是 `@downcity/shell` 的主要对外对象，拥有 tools、sessions、sandbox 与 approvals。
 * - Agent 只组合 Shell 实例，不再通过 Shell 间接调用 shell 能力。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type {
  ShellApprovalDecisionResult,
  ShellApprovalModeUpdateResult,
  ShellApprovalModeOption,
  ShellSessionApprovalModeView,
  ShellApprovalView,
  ShellConfigureOptions,
  ShellOptions,
  ShellToolAction,
  ShellToolRunContext,
  ShellToolSet,
} from "@/types/ShellRuntime.js";
import type {
  ShellActionResponse,
  ShellApprovalMode,
} from "@/types/ShellAction.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import {
  approveShellApproval,
  closeAllShellSessions,
  closeShellSession,
  createShellRuntimeState,
  denyShellApproval,
  execShellCommand,
  getShellApprovalModeView,
  getShellSessionStatus,
  listShellSessions,
  listShellApprovalModeViews,
  listShellApprovals,
  readShellSession,
  setShellApprovalModeView,
  startShellSession,
  waitShellSession,
  writeShellSession,
} from "@/session/ShellActionRuntime.js";
import { createShellTools } from "@/tool/ShellTools.js";
import { create_file_tools } from "@/tool/FileTools.js";
import { run_file_action } from "@/file/FileActionRuntime.js";
import { create_search_tools } from "@/tool/SearchTools.js";
import { run_search_action } from "@/search/SearchActionRuntime.js";
import type {
  FileToolActionRequest,
  FileToolActionResult,
  FileToolSet,
} from "@/types/FileTool.js";
import type {
  SearchToolActionRequest,
  SearchToolActionResult,
  SearchToolSet,
} from "@/types/SearchTool.js";

/**
 * Shell 运行时对象。
 */
export class Shell {
  /**
   * Shell 内部状态。
   */
  private readonly state: ShellRuntimeState;

  /**
   * Shell 宿主配置。
   */
  private host_options: ShellConfigureOptions;

  /**
   * 模型可调用的 shell tools。
   */
  readonly tools: ShellToolSet & FileToolSet & SearchToolSet;

  constructor(options: ShellOptions = {}) {
    this.host_options = { ...options };
    this.state = createShellRuntimeState();
    this.tools = {
      ...createShellTools({
        run_action: async (params) =>
          await this.run_action(
            params.action,
            params.payload,
            params.ownerContextId,
            params.turnId,
            params.env,
            params.toolCallId,
          ),
      }),
      ...create_file_tools({
        run_file_action: async (request) =>
          await this.run_file_action(request),
      }),
      ...create_search_tools({
        run_search_action: async (request) =>
          await this.run_search_action(request),
      }),
    };
  }

  /**
   * 补齐宿主上下文。
   *
   * 关键点（中文）：这是 Agent 内部装配入口，用户只需要 `new Agent({ shell: new Shell() })`。
   */
  configure(options: ShellConfigureOptions): void {
    const next_env = this.resolve_configure_env(options);
    this.host_options = {
      ...this.host_options,
      ...options,
      // 关键点（中文）：env 是宿主提供的动态对象引用，不能 clone 成快照。
      env: next_env,
      logger: options.logger || this.host_options.logger,
      emit_event: options.emit_event || this.host_options.emit_event,
    };
  }

  /**
   * 列出 pending approvals。
   */
  approvals(): ShellApprovalView[] {
    return listShellApprovals(this.state).map((item) => ({
      approval_id: item.approvalId,
      shell_id: item.shellId,
      ...(item.ownerContextId ? { session_id: item.ownerContextId } : {}),
      ...(item.turnId ? { turn_id: item.turnId } : {}),
      ...(item.toolCallId ? { tool_call_id: item.toolCallId } : {}),
      tool_name: item.toolName,
      cmd: item.cmd,
      operation: item.operation,
      ...(item.inputPreview !== undefined ? { input_preview: item.inputPreview } : {}),
      ...(typeof item.inputChars === "number" ? { input_chars: item.inputChars } : {}),
      cwd: item.cwd,
      reason: item.reason,
      created_at: item.createdAt,
    }));
  }

  /**
   * 列出当前实例内所有显式设置过的 session approval 模式。
   */
  approval_modes(): ShellApprovalModeOption[] {
    return listShellApprovalModeViews(this.state);
  }

  /**
   * 读取指定 session 的 approval 模式。
   */
  approval_mode(input: { session_id: string }): ShellSessionApprovalModeView {
    const session_id = String(input.session_id || "").trim();
    if (!session_id) throw new Error("session_id is required");
    return {
      session_id,
      mode: getShellApprovalModeView(this.state, session_id),
    };
  }

  /**
   * 设置指定 session 的 approval 模式。
   */
  set_approval_mode(input: {
    session_id: string;
    mode: ShellApprovalMode;
  }): ShellApprovalModeUpdateResult {
    const session_id = String(input.session_id || "").trim();
    if (!session_id) throw new Error("session_id is required");
    const mode = setShellApprovalModeView(this.state, session_id, input.mode);
    return {
      success: true,
      session_id,
      mode,
    };
  }

  /**
   * 批准 pending approval。
   */
  async approve(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    const approval_id = String(input.approval_id || "").trim();
    if (!approval_id) throw new Error("approval_id is required");
    const success = await approveShellApproval(this.state, this.create_host_context(), approval_id);
    return {
      success,
      approval_id,
      decision: "approved",
    };
  }

  /**
   * 拒绝 pending approval。
   */
  async deny(input: { approval_id: string }): Promise<ShellApprovalDecisionResult> {
    const approval_id = String(input.approval_id || "").trim();
    if (!approval_id) throw new Error("approval_id is required");
    const success = await denyShellApproval(this.state, this.create_host_context(), approval_id);
    return {
      success,
      approval_id,
      decision: "denied",
    };
  }

  /**
   * 释放所有 shell sessions。
   */
  async dispose(): Promise<void> {
    await closeAllShellSessions(this.state, true);
    for (const session of this.state.sessions.values()) {
      if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
      }
    }
    this.state.sessions.clear();
    this.state.approvals.clear();
    this.state.approval_modes.clear();
    this.state.context = null;
  }

  private async run_action(
    action: ShellToolAction,
    payload: Record<string, unknown>,
    ownerContextId?: string,
    turnId?: string,
    env?: Readonly<Record<string, string>>,
    toolCallId?: string,
  ): Promise<ShellActionResponse> {
    const context = this.create_host_context({
      ...(ownerContextId ? { ownerContextId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(env ? { env } : {}),
    });
    const payload_with_context: Record<string, unknown> = {
      ...payload,
      ...(ownerContextId ? { ownerContextId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(toolCallId ? { toolCallId } : {}),
    };
    switch (action) {
      case "start":
        return await startShellSession(this.state, context, payload_with_context as never);
      case "exec":
        return await execShellCommand(this.state, context, payload_with_context as never);
      case "status":
        return await getShellSessionStatus(this.state, context, payload_with_context as never);
      case "read":
        return await readShellSession(this.state, context, payload_with_context as never);
      case "write":
        return await writeShellSession(this.state, context, payload_with_context as never);
      case "wait":
        return await waitShellSession(this.state, context, payload_with_context as never);
      case "close":
        return await closeShellSession(this.state, context, payload_with_context as never);
      case "list":
        return await listShellSessions(this.state, context, payload_with_context as never);
      default:
        throw new Error(`Unknown shell action: ${String(action)}`);
    }
  }

  /**
   * 执行一个项目内结构化文件 action。
   *
   * 关键点（中文）
   * - 文件 action 与 PTY action 使用独立协议，避免 read/write 语义冲突。
   * - 权限边界只读取 Shell 已配置的 root_path，不提供 unrestricted 模式。
   */
  private async run_file_action(
    request: FileToolActionRequest,
  ): Promise<FileToolActionResult> {
    return await run_file_action(this.create_host_context(), request);
  }

  /**
   * 执行一个项目内结构化搜索 action。
   *
   * 关键点（中文）：搜索与 PTY shell action 使用独立协议，不需要拼接 shell 命令。
   */
  private async run_search_action(
    request: SearchToolActionRequest,
  ): Promise<SearchToolActionResult> {
    return await run_search_action(this.create_host_context(), request);
  }

  /**
   * 根据单次 action 的显式运行上下文构建宿主上下文。
   */
  private create_host_context(
    run_context: ShellToolRunContext = {},
  ): ShellHostContext {
    const root_path = String(this.host_options.root_path || "").trim();
    if (!root_path) {
      throw new Error("Shell requires root_path. Pass Shell through new Agent({ shell }) or construct Shell with root_path.");
    }
    const emit_event = this.host_options.emit_event;
    const session_id = run_context.ownerContextId || "";
    const turn_id = run_context.turnId || "";
    return {
      rootPath: root_path,
      env: run_context.env || this.host_options.env,
      config: {
        ...(this.host_options.agent_id ? { id: this.host_options.agent_id } : {}),
      },
      logger: this.host_options.logger,
      session: emit_event
        ? {
            get: (target_session_id) => ({
              publishEvent: async (event) => {
                await emit_event({
                  ...event,
                  session_id: String(target_session_id || session_id || "").trim(),
                });
              },
            }),
          }
        : undefined,
      shellIntegration: {
        getRunContext: () => ({
          ...(session_id ? { sessionId: session_id } : {}),
          ...(turn_id ? { turnId: turn_id } : {}),
        }),
      },
    };
  }

  private resolve_configure_env(
    options: ShellConfigureOptions,
  ): ShellConfigureOptions["env"] {
    if (options.env === undefined) return this.host_options.env;
    if (!this.host_options.env || options.agent_id) return options.env;
    if (this.host_options.env === options.env) return options.env;

    // 关键点（中文）：后续 configure env 视为动态 patch，写回当前共享引用。
    for (const [raw_key, raw_value] of Object.entries(options.env)) {
      const key = String(raw_key || "").trim();
      if (!key) continue;
      if (raw_value === undefined) {
        delete this.host_options.env[key];
        continue;
      }
      this.host_options.env[key] = String(raw_value);
    }
    return this.host_options.env;
  }
}
