/**
 * Shell tool 定义。
 *
 * 关键点（中文）
 * - `@downcity/shell` 自己拥有 shell tool 的 schema、执行逻辑与响应整理。
 * - Agent 只把 Shell 实例的 tools 合并到模型可调用工具集合中。
 */

import { tool, type ToolExecutionOptions } from "ai";
import type {
  ShellCloseInput,
  ShellExecInput,
  ShellReadInput,
  ShellStartInput,
  ShellStatusInput,
  ShellWaitInput,
  ShellWriteInput,
} from "@/types/Shell.js";
import type { ShellActionResponse } from "@/types/ShellAction.js";
import {
  shellCloseInputSchema,
  shellExecInputSchema,
  shellReadInputSchema,
  shellStartInputSchema,
  shellStatusInputSchema,
  shellWaitInputSchema,
  shellWriteInputSchema,
} from "@/tool/ShellToolSchemas.js";
import { validateChatSendCommand } from "@/tool/ShellToolFormatting.js";
import type {
  ShellToolAction,
  ShellToolRunner,
  ShellToolSet,
} from "@/types/ShellRuntime.js";

type JsonObject = Record<string, unknown>;

function flattenShellActionResponse(params: {
  /**
   * shell action 响应。
   */
  response: ShellActionResponse;
  /**
   * tool 调用开始时间。
   */
  started_at: number;
}): JsonObject {
  const shell_snapshot = params.response.shell;
  const chunk = params.response.chunk;
  const exit_code = typeof shell_snapshot.exitCode === "number" ? shell_snapshot.exitCode : null;
  const success =
    shell_snapshot.approvalStatus !== "denied" &&
    shell_snapshot.approvalStatus !== "expired" &&
    (exit_code === null || exit_code === 0);
  return {
    success,
    shell_id: shell_snapshot.shellId,
    status: shell_snapshot.status,
    cmd: shell_snapshot.cmd,
    cwd: shell_snapshot.cwd,
    sandboxed: shell_snapshot.sandboxed === true,
    sandbox: shell_snapshot.sandboxMode || (shell_snapshot.sandboxed === false ? "unrestricted" : "safe"),
    approval_status: shell_snapshot.approvalStatus || null,
    approval_id: shell_snapshot.approvalId || null,
    approval_reason: shell_snapshot.approvalReason || null,
    stdin_writable: shell_snapshot.stdinWritable !== false,
    sandbox_backend: shell_snapshot.sandboxBackend || null,
    sandbox_network_mode: shell_snapshot.sandboxNetworkMode || null,
    sandbox_dir: shell_snapshot.sandboxDir || null,
    sandbox_home_dir: shell_snapshot.sandboxHomeDir || null,
    sandbox_tmp_dir: shell_snapshot.sandboxTmpDir || null,
    sandbox_cache_dir: shell_snapshot.sandboxCacheDir || null,
    pid: typeof shell_snapshot.pid === "number" ? shell_snapshot.pid : null,
    version: shell_snapshot.version,
    started_at: shell_snapshot.startedAt,
    updated_at: shell_snapshot.updatedAt,
    ended_at: typeof shell_snapshot.endedAt === "number" ? shell_snapshot.endedAt : null,
    exit_code,
    output: chunk?.output || "",
    start_cursor: typeof chunk?.startCursor === "number" ? chunk.startCursor : null,
    end_cursor: typeof chunk?.endCursor === "number" ? chunk.endCursor : null,
    original_chars: chunk?.originalChars ?? 0,
    original_lines: chunk?.originalLines ?? 0,
    has_more_output: chunk?.hasMoreOutput === true,
    last_output_preview: shell_snapshot.lastOutputPreview || "",
    output_chars: shell_snapshot.outputChars,
    dropped_chars: shell_snapshot.droppedChars,
    auto_notify_on_exit: shell_snapshot.autoNotifyOnExit,
    notification_sent: shell_snapshot.notificationSent,
    owner_context_id: shell_snapshot.ownerContextId || null,
    external_refs: shell_snapshot.externalRefs,
    wall_time_seconds: Math.max(0, (Date.now() - params.started_at) / 1000),
    ...(params.response.note ? { note: params.response.note } : {}),
  };
}

function flattenShellExecResponse(params: {
  /**
   * shell action 响应。
   */
  response: ShellActionResponse;
  /**
   * tool 调用开始时间。
   */
  started_at: number;
}): JsonObject {
  const shell_snapshot = params.response.shell;
  const chunk = params.response.chunk;
  const exit_code = typeof shell_snapshot.exitCode === "number" ? shell_snapshot.exitCode : null;
  const success =
    shell_snapshot.approvalStatus !== "denied" &&
    shell_snapshot.approvalStatus !== "expired" &&
    (exit_code === null || exit_code === 0);
  return {
    success,
    status: shell_snapshot.status,
    cmd: shell_snapshot.cmd,
    cwd: shell_snapshot.cwd,
    sandboxed: shell_snapshot.sandboxed === true,
    sandbox: shell_snapshot.sandboxMode || (shell_snapshot.sandboxed === false ? "unrestricted" : "safe"),
    approval_status: shell_snapshot.approvalStatus || null,
    approval_id: shell_snapshot.approvalId || null,
    approval_reason: shell_snapshot.approvalReason || null,
    stdin_writable: shell_snapshot.stdinWritable !== false,
    sandbox_backend: shell_snapshot.sandboxBackend || null,
    sandbox_network_mode: shell_snapshot.sandboxNetworkMode || null,
    sandbox_dir: shell_snapshot.sandboxDir || null,
    sandbox_home_dir: shell_snapshot.sandboxHomeDir || null,
    sandbox_tmp_dir: shell_snapshot.sandboxTmpDir || null,
    sandbox_cache_dir: shell_snapshot.sandboxCacheDir || null,
    exit_code,
    output: chunk?.output || "",
    original_chars: chunk?.originalChars ?? 0,
    original_lines: chunk?.originalLines ?? 0,
    external_refs: shell_snapshot.externalRefs,
    wall_time_seconds: Math.max(0, (Date.now() - params.started_at) / 1000),
    ...(params.response.note ? { note: params.response.note } : {}),
  };
}

function formatToolError(
  prefix: string,
  error: unknown,
): { success: false; error: string } {
  return {
    success: false,
    error: `${prefix}: ${String(error)}`,
  };
}

/**
 * 创建 shell tools。
 *
 * 关键点（中文）
 * - 每个 tool.execute 都会通过 runner.getRunContext() 拿到显式 session/turn 上下文，
 *   并随 action 请求一起传给 Shell 内部，避免依赖 AsyncLocalStorage。
 */
export function createShellTools(runner: ShellToolRunner): ShellToolSet {
  /**
   * 统一包装 run_action，自动注入当前 tool 运行上下文。
   */
  function run_action_with_context(
    action: ShellToolAction,
    payload: JsonObject,
    toolCallId?: string,
  ): Promise<ShellActionResponse> {
    const run_context = runner.getRunContext?.() || null;
    return runner.run_action({
      action,
      payload,
      ownerContextId: run_context?.ownerContextId,
      turnId: run_context?.turnId,
      toolCallId,
    });
  }

  const shell_start = tool({
    description:
      "Start a shell session. Returns shell_id plus initial status/output. Long-running commands should usually be checked later with shell_status or shell_wait instead of repeated polling.",
    inputSchema: shellStartInputSchema,
    execute: async (
      {
        cmd,
        workdir,
        shell,
        login = true,
        inline_wait_ms = 1200,
        max_output_tokens,
        auto_notify_on_exit,
        sandbox = "safe",
        reason,
      }: ShellStartInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const validation_error = validateChatSendCommand(cmd);
        if (validation_error) {
          return {
            success: false,
            error: `shell_start rejected: ${validation_error}`,
          };
        }

        const response = await run_action_with_context(
          "start",
          {
            cmd,
            ...(workdir ? { cwd: workdir } : {}),
            ...(shell ? { shell } : {}),
            login,
            inlineWaitMs: inline_wait_ms,
            ...(typeof max_output_tokens === "number"
              ? { maxOutputTokens: max_output_tokens }
              : {}),
            ...(typeof auto_notify_on_exit === "boolean"
              ? { autoNotifyOnExit: auto_notify_on_exit }
              : {}),
            sandbox,
            ...(reason ? { reason } : {}),
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_start failed", error);
      }
    },
  });

  const shell_exec = tool({
    description:
      "Execute a short shell command in one-shot mode and wait for completion. Prefer shell_start for long-running or interactive commands.",
    inputSchema: shellExecInputSchema,
    execute: async (
      {
        cmd,
        workdir,
        shell,
        login = true,
        timeout_ms = 120000,
        max_output_tokens,
        sandbox = "safe",
        reason,
      }: ShellExecInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const validation_error = validateChatSendCommand(cmd);
        if (validation_error) {
          return {
            success: false,
            error: `shell_exec rejected: ${validation_error}`,
          };
        }

        const response = await run_action_with_context(
          "exec",
          {
            cmd,
            ...(workdir ? { cwd: workdir } : {}),
            ...(shell ? { shell } : {}),
            login,
            timeoutMs: timeout_ms,
            ...(typeof max_output_tokens === "number"
              ? { maxOutputTokens: max_output_tokens }
              : {}),
            sandbox,
            ...(reason ? { reason } : {}),
          },
          options.toolCallId,
        );
        return flattenShellExecResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_exec failed", error);
      }
    },
  });

  const shell_status = tool({
    description:
      "Query the current status of a shell session. Prefer this to ask for progress during long-running commands.",
    inputSchema: shellStatusInputSchema,
    execute: async (
      { shell_id, cmd }: ShellStatusInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const response = await run_action_with_context(
          "status",
          {
            ...(shell_id ? { shellId: shell_id } : {}),
            ...(cmd ? { cmd } : {}),
            includeCompleted: true,
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_status failed", error);
      }
    },
  });

  const shell_read = tool({
    description:
      "Read output from a shell session starting at a character cursor. Use this only when you truly need the raw incremental output.",
    inputSchema: shellReadInputSchema,
    execute: async (
      { shell_id, from_cursor, max_output_tokens }: ShellReadInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const response = await run_action_with_context(
          "read",
          {
            shellId: shell_id,
            ...(typeof from_cursor === "number" ? { fromCursor: from_cursor } : {}),
            ...(typeof max_output_tokens === "number"
              ? { maxOutputTokens: max_output_tokens }
              : {}),
            includeCompleted: true,
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_read failed", error);
      }
    },
  });

  const shell_write = tool({
    description:
      "Write text to the stdin of an existing shell session. When the target session runs in unrestricted sandbox mode, provide reason; every write requires user approval.",
    inputSchema: shellWriteInputSchema,
    execute: async (
      { shell_id, chars, reason }: ShellWriteInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const response = await run_action_with_context(
          "write",
          {
            shellId: shell_id,
            chars,
            ...(reason ? { reason } : {}),
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_write failed", error);
      }
    },
  });

  const shell_wait = tool({
    description:
      "Wait for a shell session to change state or produce more output. Prefer this over manual high-frequency polling loops.",
    inputSchema: shellWaitInputSchema,
    execute: async (
      {
        shell_id,
        after_version,
        from_cursor,
        timeout_ms = 10000,
        max_output_tokens,
      }: ShellWaitInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const response = await run_action_with_context(
          "wait",
          {
            shellId: shell_id,
            ...(typeof after_version === "number" ? { afterVersion: after_version } : {}),
            ...(typeof from_cursor === "number" ? { fromCursor: from_cursor } : {}),
            timeoutMs: timeout_ms,
            ...(typeof max_output_tokens === "number"
              ? { maxOutputTokens: max_output_tokens }
              : {}),
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_wait failed", error);
      }
    },
  });

  const shell_close = tool({
    description:
      "Close a shell session and release runtime resources. Use force only when a process will not exit normally.",
    inputSchema: shellCloseInputSchema,
    execute: async (
      { shell_id, force = false }: ShellCloseInput,
      options: ToolExecutionOptions,
    ) => {
      const started_at = Date.now();
      try {
        const response = await run_action_with_context(
          "close",
          {
            shellId: shell_id,
            force,
          },
          options.toolCallId,
        );
        return flattenShellActionResponse({ response, started_at });
      } catch (error) {
        return formatToolError("shell_close failed", error);
      }
    },
  });

  return {
    shell_exec,
    shell_start,
    shell_status,
    shell_read,
    shell_write,
    shell_wait,
    shell_close,
  };
}
