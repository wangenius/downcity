/**
 * Shell context tools（Codex 风格）。
 *
 * 设计目标（中文）
 * - 只提供会话式命令工具：`exec_command` + `write_stdin` + `close_shell`
 * - 工具定义只负责参数协议与流程编排
 * - 会话状态管理与通用辅助逻辑统一下沉到 `utils/`
 */

import { z } from "zod";
import { tool } from "ai";
import { generateId } from "@utils/Id.js";
import type {
  ShellCloseInput,
  ShellCommandInput,
  ShellWriteInput,
} from "@agent/types/Shell.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { JsonObject } from "@/types/Json.js";
import {
  enqueueInjectedUserMessage,
  requestContext,
} from "@agent/context/manager/RequestContext.js";
import {
  DEFAULT_SHELL_COMMAND_YIELD_MS,
  DEFAULT_WRITE_STDIN_YIELD_MS,
  MIN_EMPTY_WRITE_STDIN_YIELD_MS,
  clampYieldTimeMs,
  collectOutputUntilDeadline,
  consumeContextOutputPage,
  resolveShellWorkdir,
  resolveOutputLimits,
  validateChatSendCommand,
  writeContextStdin,
} from "./ShellHelpers.js";
import {
  closeShellContext,
  createShellContext,
  getContextOrThrow,
} from "./ShellContextManager.js";
import { formatContextResponse } from "./ShellResponse.js";

type ShellToolRuntime = {
  rootPath: string;
  config: ShipConfig;
};

let shellToolRuntime: ShellToolRuntime | null = null;

type CommandBridgeState = {
  /**
   * 当前 shell 会话累计输出（用于在结束后解析桥接协议 JSON）。
   */
  bufferedOutput: string;
};

/**
 * 通用命令桥接状态表（按 shell context_id）。
 *
 * 关键点（中文）
 * - main 不识别具体 service，只识别统一协议字段。
 * - 仅对 CLI 命令候选（`sma`/`shipmyagent`）开启累积解析，降低额外开销。
 * - 会话结束/close 时必须清理，避免内存泄漏。
 */
const commandBridgeStates = new Map<number, CommandBridgeState>();

/**
 * 注入 shell 工具所需的最小运行时快照。
 */
export function setShellToolRuntime(next: ShellToolRuntime): void {
  shellToolRuntime = next;
}

function requireShellToolRuntime(): ShellToolRuntime {
  if (shellToolRuntime) return shellToolRuntime;
  throw new Error(
    "Shell tool runtime is not initialized. Ensure initRuntimeState() has completed before using shell tools.",
  );
}

/**
 * 构建标准错误响应。
 */
function formatToolError(prefix: string, error: unknown): { success: false; error: string } {
  return {
    success: false,
    error: `${prefix}: ${String(error)}`,
  };
}

/**
 * 计算 `write_stdin` 的有效等待时间。
 *
 * 关键点（中文）
 * - 空输入轮询时使用更大的最小等待时间，减少高频空轮询。
 */
function resolveWriteStdinYieldMs(
  input: string,
  yieldTimeMs: number | undefined,
): number {
  const clamped = clampYieldTimeMs(
    yieldTimeMs,
    DEFAULT_WRITE_STDIN_YIELD_MS,
  );
  if (input) return clamped;
  return Math.max(MIN_EMPTY_WRITE_STDIN_YIELD_MS, clamped);
}

function toJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

/**
 * 判断命令是否需要开启桥接协议解析。
 */
function shouldEnableCommandBridge(command: string): boolean {
  const raw = String(command || "").trim();
  if (!raw) return false;
  return /(?:^|\s)(?:sma|shipmyagent)(?:\s|$)/i.test(raw);
}

function tryParseJsonObject(raw: string): JsonObject | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return toJsonObject(parsed);
  } catch {
    // 关键点（中文）：容错处理前后杂音，尽量从首个 `{` 到末尾 `}` 提取 JSON。
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

/**
 * 注入一条 user 文本消息（通用协议）。
 */
function injectUserTextMessage(params: {
  text: string;
  note?: string;
}): boolean {
  const store = requestContext.getStore();
  const contextId = String(store?.contextId || "").trim();
  const text = String(params.text || "").trim();
  if (!contextId || !text) return false;

  enqueueInjectedUserMessage({
    id: `u:${contextId}:${generateId()}`,
    role: "user",
    metadata: {
      v: 1,
      ts: Date.now(),
      contextId,
      source: "ingress",
      kind: "normal",
      extra: {
        note: String(params.note || "runtime_injected_user_message"),
      },
    },
    parts: [{ type: "text", text }],
  });

  return true;
}

/**
 * 提取命令结果中的运行时桥接协议块。
 *
 * 关键点（中文）
 * - main 只识别 `__ship` 协议，不依赖具体 service 语义。
 * - 协议位置：`payload.__ship` 或 `payload.data.__ship`。
 */
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
  if ("__ship" in cloned) {
    delete cloned.__ship;
  }
  const data = toJsonObject(cloned.data);
  if (data && "__ship" in data) {
    delete data.__ship;
  }
  return cloned;
}

/**
 * 对 shell 命令结果应用“通用运行时桥接协议”。
 */
function bridgeCommandResponse(params: {
  contextId: number;
  response: JsonObject;
}): JsonObject {
  const state = commandBridgeStates.get(params.contextId);
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
  const completed = !hasMoreOutput && exitCode !== null;
  if (!completed) return params.response;

  commandBridgeStates.delete(params.contextId);

  const payload = tryParseJsonObject(state.bufferedOutput);
  if (!payload) return params.response;
  const bridge = extractRuntimeBridgeBlock(payload);
  if (!bridge) return params.response;

  let injectedCount = 0;
  for (const item of bridge.injectUserMessages) {
    if (
      injectUserTextMessage({
        text: item.text,
        note: item.note,
      })
    ) {
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

const shellCommandInputSchema = z.object({
  cmd: z.string().describe("Shell command to execute."),
  workdir: z
    .string()
    .optional()
    .describe(
      "Optional working directory. Relative path is resolved from project root.",
    ),
  shell: z
    .string()
    .optional()
    .describe("Optional shell executable path. Example: /bin/zsh"),
  login: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to run shell as login shell (-lc). false uses -c."),
  yield_time_ms: z
    .number()
    .optional()
    .default(DEFAULT_SHELL_COMMAND_YIELD_MS)
    .describe("How long to wait for output before yielding."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens per response chunk."),
});

const writeStdinInputSchema = z.object({
  context_id: z.number().describe("Identifier returned by exec_command."),
  chars: z
    .string()
    .optional()
    .default("")
    .describe("Bytes to write to stdin; empty means poll only."),
  yield_time_ms: z
    .number()
    .optional()
    .default(DEFAULT_WRITE_STDIN_YIELD_MS)
    .describe("How long to wait for output before yielding."),
  max_output_tokens: z
    .number()
    .optional()
    .describe("Maximum output tokens per response chunk."),
});

const closeShellInputSchema = z.object({
  context_id: z.number().describe("Identifier returned by exec_command."),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Whether to force-kill context process (SIGKILL). Default false uses SIGTERM.",
    ),
});

/**
 * `exec_command`：启动命令会话。
 */
export const exec_command = tool({
  description:
    "Start a shell command context. Returns context_id for follow-up polling/input via write_stdin.",
  inputSchema: shellCommandInputSchema,
  execute: async ({
    cmd,
    workdir,
    shell,
    login = true,
    yield_time_ms = DEFAULT_SHELL_COMMAND_YIELD_MS,
    max_output_tokens,
  }: ShellCommandInput) => {
    const startedAt = Date.now();

    try {
      // 关键点（中文）：直接打印工具调用关键节点，便于排查“模型是否真的发起了工具调用”。
      console.log(
        "[shell-tool] exec_command:start",
        JSON.stringify({
          cmd,
          workdir: workdir || "",
          shell: shell || "",
          login,
          yield_time_ms,
          max_output_tokens: max_output_tokens ?? null,
        }),
      );
      const validationError = validateChatSendCommand(cmd);
      if (validationError) {
        console.log(
          "[shell-tool] exec_command:rejected",
          JSON.stringify({ reason: validationError }),
        );
        return {
          success: false,
          error: `exec_command rejected: ${validationError}`,
        };
      }

      const runtime = requireShellToolRuntime();
      const context = createShellContext({
        command: cmd,
        cwd: resolveShellWorkdir(runtime.rootPath, workdir),
        shellPath: shell,
        login,
      });
      if (shouldEnableCommandBridge(cmd)) {
        commandBridgeStates.set(context.id, {
          bufferedOutput: "",
        });
      }

      await collectOutputUntilDeadline(
        context,
        clampYieldTimeMs(yield_time_ms, DEFAULT_SHELL_COMMAND_YIELD_MS),
      );

      const page = consumeContextOutputPage(
        context,
        resolveOutputLimits(runtime.config, max_output_tokens),
      );
      const response = formatContextResponse({ context, page, startedAt });
      const bridgedResponse = bridgeCommandResponse({
        contextId: context.id,
        response,
      });
      console.log(
        "[shell-tool] exec_command:done",
        JSON.stringify({
          context_id: bridgedResponse.context_id,
          running: bridgedResponse.running,
          has_more_output: bridgedResponse.has_more_output,
          output_chars: String(bridgedResponse.output || "").length,
          exit_code: bridgedResponse.exit_code ?? null,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] exec_command:error",
        JSON.stringify({ error: String(error) }),
      );
      return formatToolError("exec_command failed", error);
    }
  },
});

/**
 * `write_stdin`：向现有会话写入输入或轮询输出。
 */
export const write_stdin = tool({
  description:
    "Write chars to an existing exec context and return next output chunk. Use empty chars to poll.",
  inputSchema: writeStdinInputSchema,
  execute: async ({
    context_id,
    chars = "",
    yield_time_ms = DEFAULT_WRITE_STDIN_YIELD_MS,
    max_output_tokens,
  }: ShellWriteInput) => {
    const startedAt = Date.now();

    try {
      // 关键点（中文）：区分“轮询”与“写入”，方便确认是否真的进入循环读取。
      console.log(
        "[shell-tool] write_stdin:start",
        JSON.stringify({
          context_id,
          mode: chars ? "write" : "poll",
          input_chars: String(chars || "").length,
          yield_time_ms,
          max_output_tokens: max_output_tokens ?? null,
        }),
      );
      const runtime = requireShellToolRuntime();
      const context = getContextOrThrow(context_id);
      const input = String(chars ?? "");

      if (input) {
        await writeContextStdin(context, input);
      }

      await collectOutputUntilDeadline(
        context,
        resolveWriteStdinYieldMs(input, yield_time_ms),
      );

      const page = consumeContextOutputPage(
        context,
        resolveOutputLimits(runtime.config, max_output_tokens),
      );
      const response = formatContextResponse({ context, page, startedAt });
      const bridgedResponse = bridgeCommandResponse({
        contextId: context.id,
        response,
      });
      console.log(
        "[shell-tool] write_stdin:done",
        JSON.stringify({
          context_id: bridgedResponse.context_id,
          running: bridgedResponse.running,
          has_more_output: bridgedResponse.has_more_output,
          output_chars: String(bridgedResponse.output || "").length,
          exit_code: bridgedResponse.exit_code ?? null,
        }),
      );
      return bridgedResponse;
    } catch (error) {
      console.log(
        "[shell-tool] write_stdin:error",
        JSON.stringify({ context_id, error: String(error) }),
      );
      return formatToolError("write_stdin failed", error);
    }
  },
});

/**
 * `close_shell`：主动关闭并回收会话。
 */
export const close_shell = tool({
  description:
    "Close an existing exec context and release resources. Use force=true to send SIGKILL.",
  inputSchema: closeShellInputSchema,
  execute: async ({
    context_id,
    force = false,
  }: ShellCloseInput) => {
    try {
      console.log(
        "[shell-tool] close_shell:start",
        JSON.stringify({ context_id, force }),
      );
      // 关键点（中文）：关闭会话时同步清理桥接状态。
      commandBridgeStates.delete(context_id);
      const context = getContextOrThrow(context_id);
      const result = closeShellContext(context, force);

      const response = {
        success: true,
        context_id: result.contextId,
        closed: true,
        was_running: result.wasRunning,
        exit_code: result.exitCode,
        pending_output_chars: result.pendingOutputChars,
        dropped_chars: result.droppedChars,
        ...(result.pendingOutputChars > 0
          ? {
              note: `Dropped ${result.pendingOutputChars} pending output chars while closing context.`,
            }
          : {}),
      };
      console.log(
        "[shell-tool] close_shell:done",
        JSON.stringify({
          context_id: response.context_id,
          closed: response.closed,
          was_running: response.was_running,
          exit_code: response.exit_code ?? null,
        }),
      );
      return response;
    } catch (error) {
      const err = String(error ?? "");
      // 关键点（中文）：close 是“释放资源”语义，重复 close 应视为幂等成功而非失败。
      if (err.includes("Unknown context_id")) {
        console.log(
          "[shell-tool] close_shell:already_closed",
          JSON.stringify({ context_id }),
        );
        return {
          success: true,
          context_id,
          closed: false,
          was_running: false,
          exit_code: null,
          pending_output_chars: 0,
          dropped_chars: 0,
          note: `Context ${context_id} already closed or expired.`,
        };
      }
      console.log(
        "[shell-tool] close_shell:error",
        JSON.stringify({ context_id, error: err }),
      );
      return formatToolError("close_shell failed", error);
    }
  },
});

/**
 * Shell 工具导出集合。
 */
export const shellTools = {
  exec_command,
  write_stdin,
  close_shell,
};
