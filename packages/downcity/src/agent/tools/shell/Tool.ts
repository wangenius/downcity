/**
 * Shell tools（service 化版本）。
 *
 * 设计目标（中文）
 * - shell 子进程生命周期统一由 `shellService` 承担。
 * - tool 只负责 agent 协议适配、运行时桥接协议与错误语义整理。
 */

import { z } from "zod";
import { tool } from "ai";
import { generateId } from "@utils/Id.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type {
  ShellCloseInput,
  ShellExecInput,
  ShellReadInput,
  ShellStartInput,
  ShellStatusInput,
  ShellWaitInput,
  ShellWriteInput,
} from "@agent/types/Shell.js";
import type { ServiceInvokeResult } from "@/console/service/ServiceRuntime.js";
import type { ShellActionResponse } from "@services/shell/types/ShellService.js";
import {
  enqueueDeferredPersistedUserMessage,
  enqueueInjectedUserMessage,
  requestContext,
} from "@agent/context/manager/RequestContext.js";
import { validateChatSendCommand } from "./ShellHelpers.js";

type ShellToolRuntime = {
  invokeService: (params: {
    service: string;
    action: string;
    payload?: JsonValue;
  }) => Promise<ServiceInvokeResult>;
};

type CommandBridgeState = {
  /**
   * 当前 shell 会话累计输出（用于在结束后解析桥接协议 JSON）。
   */
  bufferedOutput: string;
};

let shellToolRuntime: ShellToolRuntime | null = null;

/**
 * 通用命令桥接状态表（按 shell_id）。
 *
 * 关键点（中文）
 * - 仍然只对 `city/downcity` 命令开启，避免无意义的全量累积。
 * - `shellService` 不感知桥接协议，保持职责单一。
 */
const commandBridgeStates = new Map<string, CommandBridgeState>();

/**
 * 注入 shell tools 所需的最小运行时能力。
 */
export function setShellToolRuntime(next: ShellToolRuntime): void {
  shellToolRuntime = next;
}

function requireShellToolRuntime(): ShellToolRuntime {
  if (shellToolRuntime) return shellToolRuntime;
  throw new Error(
    "Shell tool runtime is not initialized. Ensure runtime startup has completed before using shell tools.",
  );
}

function toJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function tryParseJsonObject(raw: string): JsonObject | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return toJsonObject(parsed);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return toJsonObject(parsed);
    } catch {
      return null;
    }
  }
}

function shouldEnableCommandBridge(command: string): boolean {
  const raw = String(command || "").trim();
  if (!raw) return false;
  return /(?:^|\s)(?:city|downcity)(?:\s|$)/i.test(raw);
}

async function injectUserTextMessage(params: {
  text: string;
  note?: string;
}): Promise<boolean> {
  const store = requestContext.getStore();
  const sessionId = String(store?.sessionId || "").trim();
  const text = String(params.text || "").trim();
  if (!sessionId || !text) return false;
  const note = String(params.note || "runtime_injected_user_message");

  enqueueInjectedUserMessage({
    id: `u:${sessionId}:${generateId()}`,
    role: "user",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId,
      source: "ingress",
      kind: "normal",
      extra: {
        note,
      },
    },
    parts: [{ type: "text", text }],
  });

  enqueueDeferredPersistedUserMessage(sessionId, {
    id: `u:${sessionId}:${generateId()}`,
    role: "user",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId,
      source: "ingress",
      kind: "normal",
      extra: {
        note,
        injectedBy: "shell_runtime_bridge",
      },
    },
    parts: [{ type: "text", text }],
  });
  return true;
}

function extractRuntimeBridgeBlock(payload: JsonObject): {
  injectUserMessages: Array<{ text: string; note?: string }>;
  suppressToolOutput: boolean;
  toolOutputMessage: string;
} | null {
  const data = toJsonObject(payload.data);
  const bridge = toJsonObject((data?.__ship ?? payload.__ship) as unknown);
  if (!bridge) return null;

  const rawMessages = Array.isArray(bridge.injectUserMessages)
    ? bridge.injectUserMessages
    : [];
  const injectUserMessages: Array<{ text: string; note?: string }> = [];
  for (const item of rawMessages) {
    const obj = toJsonObject(item);
    if (!obj) continue;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    const note =
      typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined;
    injectUserMessages.push({ text, ...(note ? { note } : {}) });
  }

  const suppressToolOutput = bridge.suppressToolOutput !== false;
  const toolOutputMessage =
    typeof bridge.toolOutputMessage === "string" && bridge.toolOutputMessage.trim()
      ? bridge.toolOutputMessage.trim()
      : "runtime bridge applied";

  return {
    injectUserMessages,
    suppressToolOutput,
    toolOutputMessage,
  };
}

function sanitizeBridgeMarkers(payload: JsonObject): JsonObject {
  const cloned = JSON.parse(JSON.stringify(payload)) as JsonObject;
  if ("__ship" in cloned) delete cloned.__ship;
  const data = toJsonObject(cloned.data);
  if (data && "__ship" in data) {
    delete data.__ship;
  }
  return cloned;
}

function flattenShellActionResponse(params: {
  response: ShellActionResponse;
  startedAt: number;
}): JsonObject {
  const shell = params.response.shell;
  const chunk = params.response.chunk;
  return {
    success: true,
    shell_id: shell.shellId,
    status: shell.status,
    cmd: shell.cmd,
    cwd: shell.cwd,
    pid: typeof shell.pid === "number" ? shell.pid : null,
    version: shell.version,
    started_at: shell.startedAt,
    updated_at: shell.updatedAt,
    ended_at: typeof shell.endedAt === "number" ? shell.endedAt : null,
    exit_code: typeof shell.exitCode === "number" ? shell.exitCode : null,
    output: chunk?.output || "",
    start_cursor: typeof chunk?.startCursor === "number" ? chunk.startCursor : null,
    end_cursor: typeof chunk?.endCursor === "number" ? chunk.endCursor : null,
    original_chars: chunk?.originalChars ?? 0,
    original_lines: chunk?.originalLines ?? 0,
    has_more_output: chunk?.hasMoreOutput === true,
    last_output_preview: shell.lastOutputPreview || "",
    output_chars: shell.outputChars,
    dropped_chars: shell.droppedChars,
    auto_notify_on_exit: shell.autoNotifyOnExit,
    notification_sent: shell.notificationSent,
    owner_context_id: shell.ownerContextId || null,
    owner_request_id: shell.ownerRequestId || null,
    external_refs: shell.externalRefs,
    wall_time_seconds: Math.max(0, (Date.now() - params.startedAt) / 1000),
    ...(params.response.note ? { note: params.response.note } : {}),
  };
}

function flattenShellExecResponse(params: {
  response: ShellActionResponse;
  startedAt: number;
}): JsonObject {
  const shell = params.response.shell;
  const chunk = params.response.chunk;
  return {
    success: true,
    status: shell.status,
    cmd: shell.cmd,
    cwd: shell.cwd,
    exit_code: typeof shell.exitCode === "number" ? shell.exitCode : null,
    output: chunk?.output || "",
    original_chars: chunk?.originalChars ?? 0,
    original_lines: chunk?.originalLines ?? 0,
    external_refs: shell.externalRefs,
    wall_time_seconds: Math.max(0, (Date.now() - params.startedAt) / 1000),
    ...(params.response.note ? { note: params.response.note } : {}),
  };
}

async function bridgeCommandResponse(params: {
  shellId: string;
  response: JsonObject;
}): Promise<JsonObject> {
  const state = commandBridgeStates.get(params.shellId);
  if (!state) return params.response;

  const rawOutput =
    typeof params.response.output === "string" ? params.response.output : "";
  if (rawOutput) {
    state.bufferedOutput += rawOutput;
  }

  const hasMoreOutput = params.response.has_more_output === true;
  const exitCode =
    typeof params.response.exit_code === "number"
      ? params.response.exit_code
      : null;
  const status = String(params.response.status || "").trim();
  const completed =
    !hasMoreOutput &&
    exitCode !== null &&
    status !== "running" &&
    status !== "starting";
  if (!completed) return params.response;

  commandBridgeStates.delete(params.shellId);
  const payload = tryParseJsonObject(state.bufferedOutput);
  if (!payload) return params.response;
  const bridge = extractRuntimeBridgeBlock(payload);
  if (!bridge) return params.response;

  let injectedCount = 0;
  for (const item of bridge.injectUserMessages) {
    if (await injectUserTextMessage(item)) {
      injectedCount += 1;
    }
  }

  if (!bridge.suppressToolOutput) {
    const sanitized = sanitizeBridgeMarkers(payload);
    return {
      ...params.response,
      output: JSON.stringify(sanitized, null, 2),
    };
  }

  return {
    ...params.response,
    output: JSON.stringify({
      success: true,
      message: bridge.toolOutputMessage,
      injected_user_messages: injectedCount,
    }),
  };
}

async function invokeShellAction<TPayload extends JsonValue = JsonValue>(params: {
  action: string;
  payload: TPayload;
}): Promise<ShellActionResponse> {
  const runtime = requireShellToolRuntime();
  const result = await runtime.invokeService({
    service: "shell",
    action: params.action,
    payload: params.payload,
  });
  if (!result.success) {
    throw new Error(result.error || `shell.${params.action} failed`);
  }
  const data = toJsonObject(result.data);
  if (!data) {
    throw new Error(`shell.${params.action} returned invalid data`);
  }
  const response = data as unknown as ShellActionResponse;
  if (!response.shell || typeof response.shell.shellId !== "string") {
    throw new Error(`shell.${params.action} returned invalid shell payload`);
  }
  return response;
}

function formatToolError(prefix: string, error: unknown): { success: false; error: string } {
  return {
    success: false,
    error: `${prefix}: ${String(error)}`,
  };
}

const shellStartInputSchema = z.object({
  cmd: z.string().describe("Shell command to execute."),
  workdir: z
    .string()
    .optional()
    .describe("Optional working directory. Relative path is resolved from project root."),
  shell: z
    .string()
    .optional()
    .describe("Optional shell executable path. Example: /bin/zsh"),
  login: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to run shell as login shell (-lc). false uses -c."),
  inline_wait_ms: z
    .number()
    .optional()
    .default(1200)
    .describe("How long to inline-wait for initial output before returning."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in a single read chunk."),
  auto_notify_on_exit: z
    .boolean()
    .optional()
    .describe("Whether the shell service should auto-return to the owning chat agent when the command exits."),
});

const shellExecInputSchema = z.object({
  cmd: z.string().describe("Shell command to execute once and wait until completion."),
  workdir: z
    .string()
    .optional()
    .describe("Optional working directory. Relative path is resolved from project root."),
  shell: z
    .string()
    .optional()
    .describe("Optional shell executable path. Example: /bin/zsh"),
  login: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to run shell as login shell (-lc). false uses -c."),
  timeout_ms: z
    .number()
    .optional()
    .default(60000)
    .describe("Total timeout for one-shot execution. Use shell_start for long-running commands."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in the final result."),
});

const shellStatusInputSchema = z.object({
  shell_id: z.string().optional().describe("Existing shell identifier."),
  cmd: z
    .string()
    .optional()
    .describe("Optional command substring to resolve the latest shell in the current chat."),
});

const shellReadInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  from_cursor: z
    .number()
    .optional()
    .describe("Character cursor to continue reading from."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in this chunk."),
});

const shellWriteInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  chars: z.string().describe("Bytes to write to stdin."),
});

const shellWaitInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  after_version: z
    .number()
    .optional()
    .describe("Only return once the shell version is greater than this value."),
  from_cursor: z
    .number()
    .optional()
    .describe("Character cursor to continue reading from after the wait."),
  timeout_ms: z
    .number()
    .optional()
    .default(10000)
    .describe("Maximum time to wait for state/output changes."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens returned in this chunk."),
});

const shellCloseInputSchema = z.object({
  shell_id: z.string().describe("Existing shell identifier."),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to force-kill the shell with SIGKILL."),
});

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
      if (shouldEnableCommandBridge(cmd)) {
        commandBridgeStates.set(shellId, { bufferedOutput: "" });
      }

      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
      if (shouldEnableCommandBridge(cmd)) {
        commandBridgeStates.set(shellId, { bufferedOutput: "" });
      }
      const flatResponse = flattenShellExecResponse({
        response,
        startedAt,
      });
      const bridgedResponse = shouldEnableCommandBridge(cmd)
        ? await (async () => {
            const withInternalShellId = {
              ...flatResponse,
              shell_id: shellId,
              has_more_output: false,
            } as JsonObject;
            const bridged = await bridgeCommandResponse({
              shellId,
              response: withInternalShellId,
            });
            if ("shell_id" in bridged) delete bridged.shell_id;
            if ("has_more_output" in bridged) delete bridged.has_more_output;
            return bridged;
          })()
        : flatResponse;

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
      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
  description:
    "Write text to the stdin of an existing shell session.",
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
      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
      commandBridgeStates.delete(shell_id);
      const response = await invokeShellAction({
        action: "close",
        payload: {
          shellId: shell_id,
          force,
        },
      });
      const flatResponse = flattenShellActionResponse({
        response,
        startedAt,
      });
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
