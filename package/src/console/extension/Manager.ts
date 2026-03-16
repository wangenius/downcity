/**
 * Extension manager entrypoint。
 *
 * 关键点（中文）
 * - 所有 extensions 统一在这里声明、启动、调度。
 * - extension 仅通过 `actions` 声明能力，main 负责 runtime 与 HTTP 路由注册。
 */

import type { Context as HonoContext, Hono } from "hono";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type {
  Extension,
  ExtensionAction,
  ExtensionActionResult,
  ExtensionCommandResult,
  ExtensionRuntimeState,
} from "./ExtensionManager.js";
import { EXTENSIONS } from "./Extensions.js";

type ExtensionRuntimeRecord = {
  extension: Extension;
  state: ExtensionRuntimeState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  chain: Promise<void>;
};

export type ExtensionRuntimeSnapshot = {
  name: string;
  description?: string;
  state: ExtensionRuntimeState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  supportsLifecycle: boolean;
  supportsCommand: boolean;
};

export type ExtensionRuntimeControlAction =
  | "start"
  | "stop"
  | "restart"
  | "status";

export type ExtensionRuntimeControlResult = {
  success: boolean;
  extension?: ExtensionRuntimeSnapshot;
  error?: string;
};

const extensionRuntimeRecords = new Map<string, ExtensionRuntimeRecord>();

function nowMs(): number {
  return Date.now();
}

function resolveExtensionByName(name: string): Extension | null {
  const key = String(name || "").trim();
  if (!key) return null;
  return EXTENSIONS.find((extension) => extension.name === key) || null;
}

function ensureExtensionRuntimeRecord(
  extension: Extension,
): ExtensionRuntimeRecord {
  const key = String(extension.name || "").trim();
  const existing = extensionRuntimeRecords.get(key);
  if (existing) return existing;

  const created: ExtensionRuntimeRecord = {
    extension,
    state: "idle",
    updatedAt: nowMs(),
    chain: Promise.resolve(),
  };
  extensionRuntimeRecords.set(key, created);
  return created;
}

function hasCommandActions(extension: Extension): boolean {
  return Object.values(extension.actions).some((action) => Boolean(action.command));
}

function toRuntimeSnapshot(
  record: ExtensionRuntimeRecord,
): ExtensionRuntimeSnapshot {
  const lifecycle = record.extension.lifecycle;
  return {
    name: record.extension.name,
    ...(record.extension.description
      ? { description: String(record.extension.description).trim() }
      : {}),
    state: record.state,
    updatedAt: record.updatedAt,
    ...(record.lastError ? { lastError: record.lastError } : {}),
    ...(record.lastCommand ? { lastCommand: record.lastCommand } : {}),
    ...(typeof record.lastCommandAt === "number"
      ? { lastCommandAt: record.lastCommandAt }
      : {}),
    supportsLifecycle: Boolean(lifecycle?.start || lifecycle?.stop),
    supportsCommand:
      Boolean(lifecycle?.command) || hasCommandActions(record.extension),
  };
}

async function runSerialByExtension(
  record: ExtensionRuntimeRecord,
  console: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(console()));
  record.chain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
}

function markRuntimeState(
  record: ExtensionRuntimeRecord,
  state: ExtensionRuntimeState,
  error?: string,
): void {
  record.state = state;
  record.updatedAt = nowMs();
  if (error) {
    record.lastError = error;
  } else {
    delete record.lastError;
  }
}

function markExtensionCommand(
  record: ExtensionRuntimeRecord,
  command: string,
): void {
  record.lastCommand = command;
  record.lastCommandAt = nowMs();
  record.updatedAt = nowMs();
}

function resolveExtensionAction(
  extension: Extension,
  actionName: string,
): ExtensionAction<JsonValue, JsonValue> | null {
  const key = String(actionName || "").trim();
  if (!key) return null;
  return extension.actions[key] || null;
}

async function invokeExtensionAction(params: {
  extension: Extension;
  actionName: string;
  payload?: JsonValue;
  context: ServiceRuntime;
}): Promise<ExtensionActionResult<JsonValue>> {
  const action = resolveExtensionAction(params.extension, params.actionName);
  if (!action) {
    return {
      success: false,
      error: `Extension "${params.extension.name}" does not implement action "${params.actionName}"`,
    };
  }

  try {
    return await action.execute({
      context: params.context,
      payload: (params.payload ?? {}) as JsonValue,
      extensionName: params.extension.name,
      actionName: params.actionName,
    });
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export function getSmaExtensions(): Extension[] {
  return [...EXTENSIONS];
}

export function getExtensionRootCommandNames(): string[] {
  return EXTENSIONS.map((extension) => extension.name);
}

export function listExtensionRuntimes(): ExtensionRuntimeSnapshot[] {
  for (const extension of EXTENSIONS) {
    ensureExtensionRuntimeRecord(extension);
  }
  return Array.from(extensionRuntimeRecords.values())
    .map((x) => toRuntimeSnapshot(x))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isExtensionRuntimeRunning(extensionName: string): boolean {
  const extension = resolveExtensionByName(extensionName);
  if (!extension) return false;
  return ensureExtensionRuntimeRecord(extension).state === "running";
}

async function startExtensionRuntimeInternal(
  extension: Extension,
  context: ServiceRuntime,
): Promise<ExtensionRuntimeControlResult> {
  const record = ensureExtensionRuntimeRecord(extension);
  try {
    await runSerialByExtension(record, async () => {
      if (record.state === "running") return;
      markRuntimeState(record, "starting");
      try {
        await extension.lifecycle?.start?.(context);
        markRuntimeState(record, "running");
      } catch (error) {
        markRuntimeState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      extension: toRuntimeSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      extension: toRuntimeSnapshot(record),
      error: String(error),
    };
  }
}

async function stopExtensionRuntimeInternal(
  extension: Extension,
  context: ServiceRuntime,
): Promise<ExtensionRuntimeControlResult> {
  const record = ensureExtensionRuntimeRecord(extension);
  try {
    await runSerialByExtension(record, async () => {
      if (record.state === "idle") return;
      markRuntimeState(record, "stopping");
      try {
        await extension.lifecycle?.stop?.(context);
        markRuntimeState(record, "idle");
      } catch (error) {
        markRuntimeState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      extension: toRuntimeSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      extension: toRuntimeSnapshot(record),
      error: String(error),
    };
  }
}

export async function controlExtensionRuntime(params: {
  extensionName: string;
  action: ExtensionRuntimeControlAction;
  context: ServiceRuntime;
}): Promise<ExtensionRuntimeControlResult> {
  const extension = resolveExtensionByName(params.extensionName);
  if (!extension) {
    return {
      success: false,
      error: `Unknown extension: ${params.extensionName}`,
    };
  }

  if (params.action === "status") {
    const record = ensureExtensionRuntimeRecord(extension);
    return {
      success: true,
      extension: toRuntimeSnapshot(record),
    };
  }

  if (params.action === "start") {
    return startExtensionRuntimeInternal(extension, params.context);
  }

  if (params.action === "stop") {
    return stopExtensionRuntimeInternal(extension, params.context);
  }

  const stopped = await stopExtensionRuntimeInternal(extension, params.context);
  if (!stopped.success) return stopped;
  return startExtensionRuntimeInternal(extension, params.context);
}

export async function runExtensionCommand(params: {
  extensionName: string;
  command: string;
  payload?: JsonValue;
  context: ServiceRuntime;
}): Promise<ExtensionCommandResult & { extension?: ExtensionRuntimeSnapshot }> {
  const extension = resolveExtensionByName(params.extensionName);
  if (!extension) {
    return {
      success: false,
      message: `Unknown extension: ${params.extensionName}`,
    };
  }
  const record = ensureExtensionRuntimeRecord(extension);
  const command = String(params.command || "")
    .trim()
    .toLowerCase();
  if (!command) {
    return {
      success: false,
      extension: toRuntimeSnapshot(record),
      message: "command is required",
    };
  }

  markExtensionCommand(record, command);

  const action = resolveExtensionAction(extension, command);
  if (action) {
    if (record.state !== "running") {
      // 关键点（中文）：extension action 调用时若 runtime 未启动，自动拉起后再执行。
      // 这样可以避免调用方必须先显式执行 `sma extension start <name>`。
      const started = await startExtensionRuntimeInternal(extension, params.context);
      if (!started.success) {
        return {
          success: false,
          extension: started.extension || toRuntimeSnapshot(record),
          message:
            started.error ||
            `Failed to start extension "${extension.name}" before action "${command}"`,
        };
      }
    }

    const result = await invokeExtensionAction({
      extension,
      actionName: command,
      payload: params.payload,
      context: params.context,
    });

    if (!result.success) {
      return {
        success: false,
        extension: toRuntimeSnapshot(record),
        message: result.error || "extension action failed",
      };
    }

    return {
      success: true,
      extension: toRuntimeSnapshot(record),
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  }

  if (
    command === "status" ||
    command === "start" ||
    command === "stop" ||
    command === "restart"
  ) {
    const actionMap: Record<string, ExtensionRuntimeControlAction> = {
      status: "status",
      start: "start",
      stop: "stop",
      restart: "restart",
    };
    const result = await controlExtensionRuntime({
      extensionName: extension.name,
      action: actionMap[command],
      context: params.context,
    });
    return {
      success: result.success,
      ...(result.extension ? { extension: result.extension } : {}),
      ...(result.error ? { message: result.error } : {}),
    };
  }

  if (record.state !== "running") {
    return {
      success: false,
      extension: toRuntimeSnapshot(record),
      message: `Extension "${extension.name}" is not running`,
    };
  }

  const handler = extension.lifecycle?.command;
  if (handler) {
    try {
      const result = await handler({
        context: params.context,
        command,
        payload: params.payload,
      });
      return {
        ...result,
        extension: toRuntimeSnapshot(record),
      };
    } catch (error) {
      markRuntimeState(record, "error", String(error));
      return {
        success: false,
        extension: toRuntimeSnapshot(record),
        message: String(error),
      };
    }
  }

  return {
    success: false,
    extension: toRuntimeSnapshot(record),
    message: `Extension "${extension.name}" does not implement action "${command}"`,
  };
}

export async function startAllExtensionRuntimes(
  context: ServiceRuntime,
): Promise<{
  success: boolean;
  results: ExtensionRuntimeControlResult[];
}> {
  const results: ExtensionRuntimeControlResult[] = [];
  for (const extension of EXTENSIONS) {
    results.push(
      await controlExtensionRuntime({
        extensionName: extension.name,
        action: "start",
        context,
      }),
    );
  }
  return {
    success: results.every((x) => x.success),
    results,
  };
}

export async function stopAllExtensionRuntimes(
  context: ServiceRuntime,
): Promise<{
  success: boolean;
  results: ExtensionRuntimeControlResult[];
}> {
  const results: ExtensionRuntimeControlResult[] = [];
  for (const extension of EXTENSIONS) {
    results.push(
      await controlExtensionRuntime({
        extensionName: extension.name,
        action: "stop",
        context,
      }),
    );
  }
  return {
    success: results.every((x) => x.success),
    results,
  };
}

function wrapExtensionRouteHandler(
  extensionName: string,
  handler: (ctx: HonoContext) => Promise<Response> | Response,
): (ctx: HonoContext) => Promise<Response> | Response {
  return async (c) => {
    if (!isExtensionRuntimeRunning(extensionName)) {
      return c.json(
        {
          success: false,
          error: `Extension "${extensionName}" is idle`,
          extensionName,
        },
        503,
      );
    }
    return await handler(c);
  };
}

function resolveExtensionActionApiPath(params: {
  extensionName: string;
  actionName: string;
  action: ExtensionAction<JsonValue, JsonValue>;
}): string {
  const customPath = String(params.action.api?.path || "").trim();
  if (customPath) {
    return customPath.startsWith("/") ? customPath : `/${customPath}`;
  }
  return `/extension/${params.extensionName}/${params.actionName}`;
}

function resolveExtensionActionApiMethod(
  action: ExtensionAction<JsonValue, JsonValue>,
): "GET" | "POST" | "PUT" | "DELETE" {
  return action.api?.method || "POST";
}

function toQueryPayload(c: HonoContext): JsonObject {
  const query = c.req.query();
  const payload: JsonObject = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") continue;
    payload[key] = value;
  }
  return payload;
}

async function mapExtensionActionApiPayload(params: {
  action: ExtensionAction<JsonValue, JsonValue>;
  method: "GET" | "POST" | "PUT" | "DELETE";
  context: HonoContext;
}): Promise<JsonValue> {
  if (params.action.api?.mapInput) {
    return await params.action.api.mapInput(params.context);
  }

  if (params.method === "GET") {
    return toQueryPayload(params.context);
  }

  try {
    return (await params.context.req.json()) as JsonValue;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function registerExtensionActionApiRoute(params: {
  app: Hono;
  extension: Extension;
  actionName: string;
  action: ExtensionAction<JsonValue, JsonValue>;
  context: ServiceRuntime;
}): void {
  const api = params.action.api;
  if (!api) return;

  const method = resolveExtensionActionApiMethod(params.action);
  const routePath = resolveExtensionActionApiPath({
    extensionName: params.extension.name,
    actionName: params.actionName,
    action: params.action,
  });

  const handler = wrapExtensionRouteHandler(params.extension.name, async (c) => {
    let payload: JsonValue;
    try {
      payload = await mapExtensionActionApiPayload({
        action: params.action,
        method,
        context: c,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: String(error),
        },
        400,
      );
    }

    const result = await invokeExtensionAction({
      extension: params.extension,
      actionName: params.actionName,
      payload,
      context: params.context,
    });
    return c.json(result, result.success ? 200 : 400);
  });

  if (method === "GET") {
    params.app.get(routePath, handler);
    return;
  }
  if (method === "POST") {
    params.app.post(routePath, handler);
    return;
  }
  if (method === "PUT") {
    params.app.put(routePath, handler);
    return;
  }
  params.app.delete(routePath, handler);
}

export function registerAllExtensionsForServer(
  app: Hono,
  context: ServiceRuntime,
): void {
  for (const extension of EXTENSIONS) {
    ensureExtensionRuntimeRecord(extension);
    for (const [actionName, action] of Object.entries(extension.actions)) {
      registerExtensionActionApiRoute({
        app,
        extension,
        actionName,
        action,
        context,
      });
    }
  }
}
