/**
 * Shell tools（service 化版本）。
 *
 * 设计目标（中文）
 * - shell 子进程生命周期统一由 `shellService` 承担。
 * - tool 只负责 Session/tool 协议适配、参数校验与日志语义。
 * - 复杂桥接和 schema 已拆到旁路模块，当前文件只保留公开 tool 定义。
 */

import { tool } from "ai";
import type {
  ShellCloseInput,
  ShellExecInput,
  ShellReadInput,
  ShellStartInput,
  ShellStatusInput,
  ShellWaitInput,
  ShellWriteInput,
} from "@/types/Shell.js";
import type { JsonObject } from "@/types/Json.js";
import { validateChatSendCommand } from "./ShellHelpers.js";
import {
  bridgeCommandResponse,
  clearShellCommandBridge,
  flattenShellActionResponse,
  flattenShellExecResponse,
  formatToolError,
  invokeShellAction,
  setShellToolRuntime,
  trackShellCommandBridge,
} from "./ToolSupport.js";
import {
  shellCloseInputSchema,
  shellExecInputSchema,
  shellReadInputSchema,
  shellStartInputSchema,
  shellStatusInputSchema,
  shellWaitInputSchema,
  shellWriteInputSchema,
} from "./ToolSchemas.js";

export { setShellToolRuntime } from "./ToolSupport.js";

async function bridgeExecResponseIfNeeded(params: {
  /**
   * 原始命令文本。
   */
  cmd: string;
  /**
   * shell 标识。
   */
  shellId: string;
  /**
   * 已扁平化的一次性执行结果。
   */
  response: JsonObject;
}): Promise<JsonObject> {
  trackShellCommandBridge(params.cmd, params.shellId);
  const withInternalShellId = {
    ...params.response,
    shell_id: params.shellId,
    has_more_output: false,
  } as JsonObject;
  const bridged = await bridgeCommandResponse({
    shellId: params.shellId,
    response: withInternalShellId,
  });
  if ("shell_id" in bridged) delete bridged.shell_id;
  if ("has_more_output" in bridged) delete bridged.has_more_output;
  return bridged;
}

/**
 * `shell_start`：启动 shell 会话。
 */
export const shell_start = tool({
  description:
    "Start a shell session. Returns shell_id plus initial status/output. Long-running commands should usually be checked later with shell_status or shell_wait instead of repeated polling.",
  inputSchema: shellStartInputSchema,
  execute: async ({
    cmd,
    workdir,
    shell,
    login = true,
    inline_wait_ms = 1200,
    max_output_tokens,
    auto_notify_on_exit,
  }: ShellStartInput) => {
    const startedAt = Date.now();

    try {
      console.log(
        "[shell-tool] shell_start:start",
        JSON.stringify({
          cmd,
          workdir: workdir || "",
          shell: shell || "",
          login,
          inline_wait_ms,
          max_output_tokens: max_output_tokens ?? null,
          auto_notify_on_exit: auto_notify_on_exit ?? null,
        }),
      );

      const validationError = validateChatSendCommand(cmd);
      if (validationError) {
        console.log(
          "[shell-tool] shell_start:rejected",
          JSON.stringify({ reason: validationError }),
        );
        return {
          success: false,
          error: `shell_start rejected: ${validationError}`,
        };
      }

      const response = await invokeShellAction({
        action: "start",
        payload: {
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
        },
      });

      const shellId = response.shell.shellId;
      trackShellCommandBridge(cmd, shellId);
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      const bridgedResponse = await bridgeCommandResponse({
        shellId,
        response: flatResponse,
      });
      console.log(
        "[shell-tool] shell_start:done",
        JSON.stringify({
          shell_id: shellId,
          status: bridgedResponse.status,
          exit_code: bridgedResponse.exit_code ?? null,
          output_chars: String(bridgedResponse.output || "").length,
          has_more_output: bridgedResponse.has_more_output === true,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_start:error",
        JSON.stringify({ error: String(error) }),
      );
      return formatToolError("shell_start failed", error);
    }
  },
});

/**
 * `shell_exec`：一次性执行并等待完成。
 */
export const shell_exec = tool({
  description:
    "Execute a short shell command in one-shot mode and wait for completion. Prefer shell_start for long-running or interactive commands.",
  inputSchema: shellExecInputSchema,
  execute: async ({
    cmd,
    workdir,
    shell,
    login = true,
    timeout_ms = 60000,
    max_output_tokens,
  }: ShellExecInput) => {
    const startedAt = Date.now();

    try {
      console.log(
        "[shell-tool] shell_exec:start",
        JSON.stringify({
          cmd,
          workdir: workdir || "",
          shell: shell || "",
          login,
          timeout_ms,
          max_output_tokens: max_output_tokens ?? null,
        }),
      );

      const validationError = validateChatSendCommand(cmd);
      if (validationError) {
        console.log(
          "[shell-tool] shell_exec:rejected",
          JSON.stringify({ reason: validationError }),
        );
        return {
          success: false,
          error: `shell_exec rejected: ${validationError}`,
        };
      }

      const response = await invokeShellAction({
        action: "exec",
        payload: {
          cmd,
          ...(workdir ? { cwd: workdir } : {}),
          ...(shell ? { shell } : {}),
          login,
          timeoutMs: timeout_ms,
          ...(typeof max_output_tokens === "number"
            ? { maxOutputTokens: max_output_tokens }
            : {}),
        },
      });

      const shellId = response.shell.shellId;
      const flatResponse = flattenShellExecResponse({ response, startedAt });
      const bridgedResponse = await bridgeExecResponseIfNeeded({
        cmd,
        shellId,
        response: flatResponse,
      });

      console.log(
        "[shell-tool] shell_exec:done",
        JSON.stringify({
          status: bridgedResponse.status,
          exit_code: bridgedResponse.exit_code ?? null,
          output_chars: String(bridgedResponse.output || "").length,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_exec:error",
        JSON.stringify({ error: String(error) }),
      );
      return formatToolError("shell_exec failed", error);
    }
  },
});

/**
 * `shell_status`：查询 shell 当前状态。
 */
export const shell_status = tool({
  description:
    "Query the current status of a shell session. Prefer this to ask for progress during long-running commands.",
  inputSchema: shellStatusInputSchema,
  execute: async ({ shell_id, cmd }: ShellStatusInput) => {
    const startedAt = Date.now();
    try {
      console.log(
        "[shell-tool] shell_status:start",
        JSON.stringify({ shell_id: shell_id || "", cmd: cmd || "" }),
      );
      const response = await invokeShellAction({
        action: "status",
        payload: {
          ...(shell_id ? { shellId: shell_id } : {}),
          ...(cmd ? { cmd } : {}),
          includeCompleted: true,
        },
      });
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      console.log(
        "[shell-tool] shell_status:done",
        JSON.stringify({
          shell_id: flatResponse.shell_id,
          status: flatResponse.status,
          version: flatResponse.version,
          exit_code: flatResponse.exit_code ?? null,
        }),
      );
      return flatResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_status:error",
        JSON.stringify({ shell_id: shell_id || "", error: String(error) }),
      );
      return formatToolError("shell_status failed", error);
    }
  },
});

/**
 * `shell_read`：读取 shell 输出增量。
 */
export const shell_read = tool({
  description:
    "Read output from a shell session starting at a character cursor. Use this only when you truly need the raw incremental output.",
  inputSchema: shellReadInputSchema,
  execute: async ({
    shell_id,
    from_cursor,
    max_output_tokens,
  }: ShellReadInput) => {
    const startedAt = Date.now();
    try {
      console.log(
        "[shell-tool] shell_read:start",
        JSON.stringify({
          shell_id,
          from_cursor: from_cursor ?? null,
          max_output_tokens: max_output_tokens ?? null,
        }),
      );
      const response = await invokeShellAction({
        action: "read",
        payload: {
          shellId: shell_id,
          ...(typeof from_cursor === "number" ? { fromCursor: from_cursor } : {}),
          ...(typeof max_output_tokens === "number"
            ? { maxOutputTokens: max_output_tokens }
            : {}),
          includeCompleted: true,
        },
      });
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      const bridgedResponse = await bridgeCommandResponse({
        shellId: shell_id,
        response: flatResponse,
      });
      console.log(
        "[shell-tool] shell_read:done",
        JSON.stringify({
          shell_id,
          status: bridgedResponse.status,
          exit_code: bridgedResponse.exit_code ?? null,
          output_chars: String(bridgedResponse.output || "").length,
          has_more_output: bridgedResponse.has_more_output === true,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_read:error",
        JSON.stringify({ shell_id, error: String(error) }),
      );
      return formatToolError("shell_read failed", error);
    }
  },
});

/**
 * `shell_write`：向 shell stdin 写入内容。
 */
export const shell_write = tool({
  description: "Write text to the stdin of an existing shell session.",
  inputSchema: shellWriteInputSchema,
  execute: async ({ shell_id, chars }: ShellWriteInput) => {
    const startedAt = Date.now();
    try {
      console.log(
        "[shell-tool] shell_write:start",
        JSON.stringify({
          shell_id,
          input_chars: String(chars || "").length,
        }),
      );
      const response = await invokeShellAction({
        action: "write",
        payload: {
          shellId: shell_id,
          chars,
        },
      });
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      console.log(
        "[shell-tool] shell_write:done",
        JSON.stringify({
          shell_id,
          status: flatResponse.status,
          version: flatResponse.version,
        }),
      );
      return flatResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_write:error",
        JSON.stringify({ shell_id, error: String(error) }),
      );
      return formatToolError("shell_write failed", error);
    }
  },
});

/**
 * `shell_wait`：等待 shell 状态或输出变化。
 */
export const shell_wait = tool({
  description:
    "Wait for a shell session to change state or produce more output. Prefer this over manual high-frequency polling loops.",
  inputSchema: shellWaitInputSchema,
  execute: async ({
    shell_id,
    after_version,
    from_cursor,
    timeout_ms = 10000,
    max_output_tokens,
  }: ShellWaitInput) => {
    const startedAt = Date.now();
    try {
      console.log(
        "[shell-tool] shell_wait:start",
        JSON.stringify({
          shell_id,
          after_version: after_version ?? null,
          from_cursor: from_cursor ?? null,
          timeout_ms,
          max_output_tokens: max_output_tokens ?? null,
        }),
      );
      const response = await invokeShellAction({
        action: "wait",
        payload: {
          shellId: shell_id,
          ...(typeof after_version === "number"
            ? { afterVersion: after_version }
            : {}),
          ...(typeof from_cursor === "number" ? { fromCursor: from_cursor } : {}),
          timeoutMs: timeout_ms,
          ...(typeof max_output_tokens === "number"
            ? { maxOutputTokens: max_output_tokens }
            : {}),
        },
      });
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      const bridgedResponse = await bridgeCommandResponse({
        shellId: shell_id,
        response: flatResponse,
      });
      console.log(
        "[shell-tool] shell_wait:done",
        JSON.stringify({
          shell_id,
          status: bridgedResponse.status,
          version: bridgedResponse.version,
          exit_code: bridgedResponse.exit_code ?? null,
          output_chars: String(bridgedResponse.output || "").length,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_wait:error",
        JSON.stringify({ shell_id, error: String(error) }),
      );
      return formatToolError("shell_wait failed", error);
    }
  },
});

/**
 * `shell_close`：关闭 shell 会话。
 */
export const shell_close = tool({
  description:
    "Close an existing shell session and release resources. Use force=true to send SIGKILL.",
  inputSchema: shellCloseInputSchema,
  execute: async ({ shell_id, force = false }: ShellCloseInput) => {
    const startedAt = Date.now();
    try {
      console.log(
        "[shell-tool] shell_close:start",
        JSON.stringify({ shell_id, force }),
      );
      clearShellCommandBridge(shell_id);
      const response = await invokeShellAction({
        action: "close",
        payload: {
          shellId: shell_id,
          force,
        },
      });
      const flatResponse = flattenShellActionResponse({ response, startedAt });
      console.log(
        "[shell-tool] shell_close:done",
        JSON.stringify({
          shell_id,
          status: flatResponse.status,
          exit_code: flatResponse.exit_code ?? null,
        }),
      );
      return flatResponse;
    } catch (error) {
      console.log(
        "[shell-tool] shell_close:error",
        JSON.stringify({ shell_id, error: String(error) }),
      );
      return formatToolError("shell_close failed", error);
    }
  },
});

/**
 * Shell 工具导出集合。
 */
export const shellTools = {
  shell_exec,
  shell_start,
  shell_status,
  shell_read,
  shell_write,
  shell_wait,
  shell_close,
};
