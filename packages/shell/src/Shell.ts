/**
 * Shell 对象入口。
 *
 * 关键点（中文）
 * - Shell 是 `@downcity/shell` 的主要对外对象，拥有 tools、sessions 与 sandbox。
 * - Agent 只组合 Shell 实例，不再通过 Shell 间接调用 shell 能力。
 */

import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type {
  ShellConfigureOptions,
  ShellOptions,
  ShellToolAction,
  ShellToolRunContext,
  ShellToolSet,
} from "@/types/ShellRuntime.js";
import type { ShellActionResponse } from "@/types/ShellAction.js";
import type { ShellRuntimeState } from "@/session/ShellRuntimeTypes.js";
import {
  closeAllShellSessions,
  closeShellSession,
  createShellRuntimeState,
  execShellCommand,
  getShellSessionStatus,
  listShellSessions,
  readShellSession,
  startShellSession,
  waitShellSession,
  writeShellSession,
} from "@/session/ShellActionRuntime.js";
import { createShellTools } from "@/tool/ShellTools.js";
import { create_file_tools } from "@/tool/FileTools.js";
import { run_file_action } from "@/file/FileActionRuntime.js";
import { create_search_tools } from "@/tool/SearchTools.js";
import { run_search_action } from "@/search/SearchActionRuntime.js";
import { resolve_sandbox_policy } from "@/sandbox/SandboxPolicy.js";
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
    this.host_options = {
      ...options,
      safe_read_only_paths: [...(options.safe_read_only_paths || [])],
    };
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
            params.approval_gateway,
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
    this.state.context = null;
  }

  /**
   * 替换 Safe Sandbox 的宿主只读目录。
   *
   * 关键点（中文）
   * - 权限收缩或切换时先关闭活动 shell，避免旧进程继续持有已撤销权限。
   * - 只读目录只影响后续启动的进程，不会扩大 workspace 之外的写权限。
   */
  async set_safe_read_only_paths(paths: string[]): Promise<void> {
    const current_paths = this.host_options.safe_read_only_paths || [];
    const next_paths = Array.from(new Set(
      paths.map((value) => String(value || "").trim()).filter(Boolean),
    ));
    if (
      current_paths.length === next_paths.length &&
      current_paths.every((value, index) => value === next_paths[index])
    ) {
      return;
    }
    const root_path = String(this.host_options.root_path || "").trim();
    if (root_path) {
      await resolve_sandbox_policy({
        rootPath: root_path,
        env: this.host_options.env,
        safe_read_only_paths: next_paths,
        logger: this.host_options.logger,
      }, {
        ...process.env,
        ...this.host_options.env,
      });
    }
    const next_path_set = new Set(next_paths);
    const removes_access = current_paths.some((value) => !next_path_set.has(value));
    if (removes_access) {
      await closeAllShellSessions(this.state, true);
    }
    this.host_options.safe_read_only_paths = next_paths;
  }

  private async run_action(
    action: ShellToolAction,
    payload: Record<string, unknown>,
    ownerContextId?: string,
    turnId?: string,
    env?: Readonly<Record<string, string>>,
    approval_gateway?: ShellToolRunContext["approval_gateway"],
    toolCallId?: string,
  ): Promise<ShellActionResponse> {
    const context = this.create_host_context({
      ...(ownerContextId ? { ownerContextId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(env ? { env } : {}),
      ...(approval_gateway ? { approval_gateway } : {}),
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
    const session_id = run_context.ownerContextId || "";
    const turn_id = run_context.turnId || "";
    return {
      rootPath: root_path,
      env: run_context.env || this.host_options.env,
      safe_read_only_paths: this.host_options.safe_read_only_paths,
      config: {
        ...(this.host_options.agent_id ? { id: this.host_options.agent_id } : {}),
      },
      logger: this.host_options.logger,
      approval_gateway: run_context.approval_gateway,
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
