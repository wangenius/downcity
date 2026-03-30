/**
 * Shell tool 运行时桥接与响应整理。
 *
 * 关键点（中文）
 * - tool 层只负责协议适配，不直接持有 shell service 具体实现。
 * - runtime 注入、桥接协议解析、输出扁平化都收敛在这里，避免 `Tool.ts` 继续膨胀。
 */

import { generateId } from "@utils/Id.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { InvokeServiceResult } from "@/types/ExecutionContext.js";
import type { ShellActionResponse } from "@services/shell/types/ShellService.js";
import {
  enqueueDeferredPersistedUserMessage,
  enqueueInjectedUserMessage,
  requestContext,
} from "@sessions/RequestContext.js";

/**
 * Shell tool 所需的最小 runtime 能力。
 */
export interface ShellToolRuntime {
  /**
   * 调用 service action 的统一入口。
   */
  invokeService: (params: {
    /**
     * service 名称。
     */
    service: string;
    /**
     * action 名称。
     */
    action: string;
    /**
     * 可选的 JSON 载荷。
     */
    payload?: JsonValue;
  }) => Promise<InvokeServiceResult>;
}

/**
 * 单个 shell 命令桥接状态。
 */
interface CommandBridgeState {
  /**
   * 当前 shell 会话累计输出，用于在命令结束后解析桥接 JSON。
   */
  bufferedOutput: string;
}

let shellToolRuntime: ShellToolRuntime | null = null;

/**
 * 通用命令桥接状态表（按 shell_id）。
 */
const commandBridgeStates = new Map<string, CommandBridgeState>();

/**
 * 注入 shell tools 所需的最小 runtime 能力。
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
  /**
   * 要注入的用户文本。
   */
  text: string;
  /**
   * 可选的注入说明。
   */
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

/**
 * 为可能触发桥接协议的命令建立状态缓存。
 */
export function trackShellCommandBridge(command: string, shellId: string): void {
  if (!shouldEnableCommandBridge(command)) return;
  commandBridgeStates.set(shellId, { bufferedOutput: "" });
}

/**
 * 清理指定 shell 的桥接状态。
 */
export function clearShellCommandBridge(shellId: string): void {
  commandBridgeStates.delete(shellId);
}

/**
 * 将 shell service 响应整理为通用工具输出。
 */
export function flattenShellActionResponse(params: {
  /**
   * service 返回的 shell 响应。
   */
  response: ShellActionResponse;
  /**
   * tool 调用开始时间。
   */
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

/**
 * 将一次性执行响应整理为简化输出。
 */
export function flattenShellExecResponse(params: {
  /**
   * service 返回的 shell 响应。
   */
  response: ShellActionResponse;
  /**
   * tool 调用开始时间。
   */
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

/**
 * 尝试解析 shell 输出中的 runtime bridge 指令。
 */
export async function bridgeCommandResponse(params: {
  /**
   * shell 唯一标识。
   */
  shellId: string;
  /**
   * 已经扁平化后的 tool 输出。
   */
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

/**
 * 调用 shell service action。
 */
export async function invokeShellAction<TPayload extends JsonValue = JsonValue>(params: {
  /**
   * action 名称。
   */
  action: string;
  /**
   * action 载荷。
   */
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

/**
 * 统一格式化 tool 错误。
 */
export function formatToolError(
  prefix: string,
  error: unknown,
): { success: false; error: string } {
  return {
    success: false,
    error: `${prefix}: ${String(error)}`,
  };
}
