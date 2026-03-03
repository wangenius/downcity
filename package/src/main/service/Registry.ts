/**
 * Service registry entrypoint.
 *
 * 关键点（中文）
 * - 所有 services 统一在这里声明、启动、调度
 * - service 仅通过 `actions` 声明 CLI/API，main 自动完成注册
 */

import path from "node:path";
import type { Command } from "commander";
import type { Context as HonoContext, Hono } from "hono";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { ServiceCommandResponse } from "@main/types/Services.js";
import { callServer } from "@main/runtime/Client.js";
import { printResult } from "@main/utils/CliOutput.js";
import { parsePortOption } from "../utils/Checker.js";
import type {
  Service,
  ServiceAction,
  ServiceActionResult,
  ServiceCommandResult,
  ServiceRuntimeState,
} from "./ServiceRegistry.js";
import { SERVICES } from "./Services.js";

type ServiceRuntimeRecord = {
  service: Service;
  state: ServiceRuntimeState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  chain: Promise<void>;
};

export type ServiceRuntimeSnapshot = {
  name: string;
  state: ServiceRuntimeState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  supportsLifecycle: boolean;
  supportsCommand: boolean;
};

export type ServiceRuntimeControlAction =
  | "start"
  | "stop"
  | "restart"
  | "status";

export type ServiceRuntimeControlResult = {
  success: boolean;
  service?: ServiceRuntimeSnapshot;
  error?: string;
};

type ServiceCliBridgeOptions = {
  path?: string;
  host?: string;
  port?: number;
  json?: boolean;
};

const serviceRuntimeRecords = new Map<string, ServiceRuntimeRecord>();

function nowMs(): number {
  return Date.now();
}

function resolveServiceByName(name: string): Service | null {
  const key = String(name || "").trim();
  if (!key) return null;
  return SERVICES.find((service) => service.name === key) || null;
}

function ensureServiceRuntimeRecord(service: Service): ServiceRuntimeRecord {
  const key = String(service.name || "").trim();
  const existing = serviceRuntimeRecords.get(key);
  if (existing) return existing;

  const created: ServiceRuntimeRecord = {
    service,
    state: "stopped",
    updatedAt: nowMs(),
    chain: Promise.resolve(),
  };
  serviceRuntimeRecords.set(key, created);
  return created;
}

function hasCommandActions(service: Service): boolean {
  return Object.values(service.actions).some((action) =>
    Boolean(action.command),
  );
}

function toRuntimeSnapshot(
  record: ServiceRuntimeRecord,
): ServiceRuntimeSnapshot {
  const lifecycle = record.service.lifecycle;
  return {
    name: record.service.name,
    state: record.state,
    updatedAt: record.updatedAt,
    ...(record.lastError ? { lastError: record.lastError } : {}),
    ...(record.lastCommand ? { lastCommand: record.lastCommand } : {}),
    ...(typeof record.lastCommandAt === "number"
      ? { lastCommandAt: record.lastCommandAt }
      : {}),
    supportsLifecycle: Boolean(lifecycle?.start || lifecycle?.stop),
    supportsCommand:
      Boolean(lifecycle?.command) || hasCommandActions(record.service),
  };
}

async function runSerialByService(
  record: ServiceRuntimeRecord,
  operation: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(operation()));
  record.chain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
}

function markRuntimeState(
  record: ServiceRuntimeRecord,
  state: ServiceRuntimeState,
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

function markServiceCommand(
  record: ServiceRuntimeRecord,
  command: string,
): void {
  record.lastCommand = command;
  record.lastCommandAt = nowMs();
  record.updatedAt = nowMs();
}

function resolveServiceAction(
  service: Service,
  actionName: string,
): ServiceAction<JsonValue, JsonValue> | null {
  const key = String(actionName || "").trim();
  if (!key) return null;
  return service.actions[key] || null;
}

async function invokeServiceAction(params: {
  service: Service;
  actionName: string;
  payload?: JsonValue;
  context: ServiceRuntime;
}): Promise<ServiceActionResult<JsonValue>> {
  const action = resolveServiceAction(params.service, params.actionName);
  if (!action) {
    return {
      success: false,
      error: `Service "${params.service.name}" does not implement action "${params.actionName}"`,
    };
  }

  try {
    return await action.execute({
      context: params.context,
      payload: (params.payload ?? {}) as JsonValue,
      serviceName: params.service.name,
      actionName: params.actionName,
    });
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

export function getSmaServices(): Service[] {
  return [...SERVICES];
}

export function getServiceRootCommandNames(): string[] {
  return SERVICES.map((service) => service.name);
}

export function listServiceRuntimes(): ServiceRuntimeSnapshot[] {
  for (const service of SERVICES) {
    ensureServiceRuntimeRecord(service);
  }
  return Array.from(serviceRuntimeRecords.values())
    .map((x) => toRuntimeSnapshot(x))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isServiceRuntimeRunning(serviceName: string): boolean {
  const service = resolveServiceByName(serviceName);
  if (!service) return false;
  return ensureServiceRuntimeRecord(service).state === "running";
}

async function startServiceRuntimeInternal(
  service: Service,
  context: ServiceRuntime,
): Promise<ServiceRuntimeControlResult> {
  const record = ensureServiceRuntimeRecord(service);
  try {
    await runSerialByService(record, async () => {
      if (record.state === "running") return;
      markRuntimeState(record, "starting");
      try {
        await service.lifecycle?.start?.(context);
        markRuntimeState(record, "running");
      } catch (error) {
        markRuntimeState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      service: toRuntimeSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      service: toRuntimeSnapshot(record),
      error: String(error),
    };
  }
}

async function stopServiceRuntimeInternal(
  service: Service,
  context: ServiceRuntime,
): Promise<ServiceRuntimeControlResult> {
  const record = ensureServiceRuntimeRecord(service);
  try {
    await runSerialByService(record, async () => {
      if (record.state === "stopped") return;
      markRuntimeState(record, "stopping");
      try {
        await service.lifecycle?.stop?.(context);
        markRuntimeState(record, "stopped");
      } catch (error) {
        markRuntimeState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      service: toRuntimeSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      service: toRuntimeSnapshot(record),
      error: String(error),
    };
  }
}

export async function controlServiceRuntime(params: {
  serviceName: string;
  action: ServiceRuntimeControlAction;
  context: ServiceRuntime;
}): Promise<ServiceRuntimeControlResult> {
  const service = resolveServiceByName(params.serviceName);
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${params.serviceName}`,
    };
  }

  if (params.action === "status") {
    const record = ensureServiceRuntimeRecord(service);
    return {
      success: true,
      service: toRuntimeSnapshot(record),
    };
  }

  if (params.action === "start") {
    return startServiceRuntimeInternal(service, params.context);
  }

  if (params.action === "stop") {
    return stopServiceRuntimeInternal(service, params.context);
  }

  const stopped = await stopServiceRuntimeInternal(service, params.context);
  if (!stopped.success) return stopped;
  return startServiceRuntimeInternal(service, params.context);
}

export async function runServiceCommand(params: {
  serviceName: string;
  command: string;
  payload?: JsonValue;
  context: ServiceRuntime;
}): Promise<ServiceCommandResult & { service?: ServiceRuntimeSnapshot }> {
  const service = resolveServiceByName(params.serviceName);
  if (!service) {
    return {
      success: false,
      message: `Unknown service: ${params.serviceName}`,
    };
  }
  const record = ensureServiceRuntimeRecord(service);
  const command = String(params.command || "")
    .trim()
    .toLowerCase();
  if (!command) {
    return {
      success: false,
      service: toRuntimeSnapshot(record),
      message: "command is required",
    };
  }

  markServiceCommand(record, command);

  const action = resolveServiceAction(service, command);
  if (action) {
    if (record.state !== "running") {
      return {
        success: false,
        service: toRuntimeSnapshot(record),
        message: `Service "${service.name}" is not running`,
      };
    }

    const result = await invokeServiceAction({
      service,
      actionName: command,
      payload: params.payload,
      context: params.context,
    });

    if (!result.success) {
      return {
        success: false,
        service: toRuntimeSnapshot(record),
        message: result.error || "service action failed",
      };
    }

    return {
      success: true,
      service: toRuntimeSnapshot(record),
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  }

  if (
    command === "status" ||
    command === "start" ||
    command === "stop" ||
    command === "restart"
  ) {
    const actionMap: Record<string, ServiceRuntimeControlAction> = {
      status: "status",
      start: "start",
      stop: "stop",
      restart: "restart",
    };
    const result = await controlServiceRuntime({
      serviceName: service.name,
      action: actionMap[command],
      context: params.context,
    });
    return {
      success: result.success,
      ...(result.service ? { service: result.service } : {}),
      ...(result.error ? { message: result.error } : {}),
    };
  }

  if (record.state !== "running") {
    return {
      success: false,
      service: toRuntimeSnapshot(record),
      message: `Service "${service.name}" is not running`,
    };
  }

  const handler = service.lifecycle?.command;
  if (handler) {
    try {
      const result = await handler({
        context: params.context,
        command,
        payload: params.payload,
      });
      return {
        ...result,
        service: toRuntimeSnapshot(record),
      };
    } catch (error) {
      markRuntimeState(record, "error", String(error));
      return {
        success: false,
        service: toRuntimeSnapshot(record),
        message: String(error),
      };
    }
  }

  return {
    success: false,
    service: toRuntimeSnapshot(record),
    message: `Service "${service.name}" does not implement action "${command}"`,
  };
}

export async function startAllServiceRuntimes(
  context: ServiceRuntime,
): Promise<{
  success: boolean;
  results: ServiceRuntimeControlResult[];
}> {
  const results: ServiceRuntimeControlResult[] = [];
  for (const service of SERVICES) {
    results.push(
      await controlServiceRuntime({
        serviceName: service.name,
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

export async function stopAllServiceRuntimes(context: ServiceRuntime): Promise<{
  success: boolean;
  results: ServiceRuntimeControlResult[];
}> {
  const results: ServiceRuntimeControlResult[] = [];
  for (const service of SERVICES) {
    results.push(
      await controlServiceRuntime({
        serviceName: service.name,
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

function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

function toJsonValue(input: unknown): JsonValue | undefined {
  if (input === null) return null;
  if (typeof input === "string") return input;
  if (typeof input === "number")
    return Number.isFinite(input) ? input : undefined;
  if (typeof input === "boolean") return input;

  if (Array.isArray(input)) {
    const values: JsonValue[] = [];
    for (const item of input) {
      const value = toJsonValue(item);
      if (value === undefined) continue;
      values.push(value);
    }
    return values;
  }

  if (typeof input === "object" && input) {
    const output: JsonObject = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const normalized = toJsonValue(value);
      if (normalized === undefined) continue;
      output[key] = normalized;
    }
    return output;
  }

  return undefined;
}

function toServiceActionCommandOpts(
  options: Record<string, unknown>,
): Record<string, JsonValue> {
  const reservedKeys = new Set(["path", "host", "port", "json"]);
  const normalized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(options)) {
    if (reservedKeys.has(key)) continue;
    const nextValue = toJsonValue(value);
    if (nextValue === undefined) continue;
    normalized[key] = nextValue;
  }
  return normalized;
}

function toServiceCliBridgeOptions(
  options: Record<string, unknown>,
): ServiceCliBridgeOptions {
  return {
    path: typeof options.path === "string" ? options.path : ".",
    host: typeof options.host === "string" ? options.host : undefined,
    port: typeof options.port === "number" ? options.port : undefined,
    json: options.json !== false,
  };
}

function toServiceActionCommandArgs(values: unknown[]): string[] {
  return values.map((item) => String(item));
}

function isCommanderCommandLike(value: unknown): value is Command {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { opts?: unknown }).opts === "function",
  );
}

function registerServiceActionCommand(params: {
  program: Command;
  service: Service;
  actionName: string;
  action: ServiceAction<JsonValue, JsonValue>;
}): void {
  const commandSpec = params.action.command;
  if (!commandSpec) return;

  const serviceCommand =
    params.program.commands.find(
      (item) => item.name() === params.service.name,
    ) ||
    params.program
      .command(params.service.name)
      .description(`${params.service.name} service actions`)
      .helpOption("--help", "display help for command");

  const actionCommand = serviceCommand
    .command(params.actionName)
    .description(commandSpec.description)
    .helpOption("--help", "display help for command")
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--host <host>", "Server host（覆盖自动解析）")
    .option("--port <port>", "Server port（覆盖自动解析）", parsePortOption)
    .option("--json [enabled]", "以 JSON 输出", true);

  commandSpec.configure?.(actionCommand);

  actionCommand.action(async (...rawArgs: unknown[]) => {
    const last = rawArgs.at(-1);
    const commandLike = isCommanderCommandLike(last) ? last : null;
    const positionalArgs = toServiceActionCommandArgs(
      commandLike ? rawArgs.slice(0, -1) : rawArgs,
    );
    const allOptions = commandLike
      ? (commandLike.opts() as Record<string, unknown>) || {}
      : {};
    const actionOptions = toServiceActionCommandOpts(allOptions);
    const bridgeOptions = toServiceCliBridgeOptions(allOptions);

    let payload: JsonValue;
    try {
      payload = await commandSpec.mapInput({
        args: positionalArgs,
        opts: actionOptions,
      });
    } catch (error) {
      printResult({
        asJson: bridgeOptions.json,
        success: false,
        title: `${params.service.name}.${params.actionName} failed`,
        payload: {
          error: `Failed to parse command input: ${String(error)}`,
        },
      });
      return;
    }

    const remote = await callServer<ServiceCommandResponse>({
      projectRoot: resolveProjectRoot(bridgeOptions.path),
      path: "/api/services/command",
      method: "POST",
      host: bridgeOptions.host,
      port: bridgeOptions.port,
      body: {
        serviceName: params.service.name,
        command: params.actionName,
        payload,
      },
    });

    if (remote.success && remote.data) {
      const data = remote.data;
      printResult({
        asJson: bridgeOptions.json,
        success: Boolean(data.success),
        title: data.success
          ? `${params.service.name}.${params.actionName} ok`
          : `${params.service.name}.${params.actionName} failed`,
        payload: {
          ...(data.data !== undefined ? { data: data.data } : {}),
          ...(data.message ? { message: data.message } : {}),
          ...(data.error ? { error: data.error } : {}),
        },
      });
      return;
    }

    printResult({
      asJson: bridgeOptions.json,
      success: false,
      title: `${params.service.name}.${params.actionName} failed`,
      payload: {
        error:
          remote.error ||
          "Service action requires an active Agent server runtime. Start via `sma start` or `sma run` first.",
      },
    });
  });
}

function wrapServiceRouteHandler(
  serviceName: string,
  handler: (ctx: HonoContext) => Promise<Response> | Response,
): (ctx: HonoContext) => Promise<Response> | Response {
  return async (c) => {
    if (!isServiceRuntimeRunning(serviceName)) {
      return c.json(
        {
          success: false,
          error: `Service "${serviceName}" is stopped`,
          serviceName,
        },
        503,
      );
    }
    return await handler(c);
  };
}

function resolveServiceActionApiPath(params: {
  serviceName: string;
  actionName: string;
  action: ServiceAction<JsonValue, JsonValue>;
}): string {
  const customPath = String(params.action.api?.path || "").trim();
  if (customPath) {
    return customPath.startsWith("/") ? customPath : `/${customPath}`;
  }
  return `/service/${params.serviceName}/${params.actionName}`;
}

function resolveServiceActionApiMethod(
  action: ServiceAction<JsonValue, JsonValue>,
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

async function mapServiceActionApiPayload(params: {
  action: ServiceAction<JsonValue, JsonValue>;
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

function registerServiceActionApiRoute(params: {
  app: Hono;
  service: Service;
  actionName: string;
  action: ServiceAction<JsonValue, JsonValue>;
  context: ServiceRuntime;
}): void {
  const api = params.action.api;
  if (!api) return;

  const method = resolveServiceActionApiMethod(params.action);
  const routePath = resolveServiceActionApiPath({
    serviceName: params.service.name,
    actionName: params.actionName,
    action: params.action,
  });

  const handler = wrapServiceRouteHandler(params.service.name, async (c) => {
    let payload: JsonValue;
    try {
      payload = await mapServiceActionApiPayload({
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

    const result = await invokeServiceAction({
      service: params.service,
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

export function registerAllServicesForCli(program: Command): void {
  for (const service of SERVICES) {
    ensureServiceRuntimeRecord(service);
    for (const [actionName, action] of Object.entries(service.actions)) {
      registerServiceActionCommand({
        program,
        service,
        actionName,
        action,
      });
    }
  }
}

export function registerAllServicesForServer(
  app: Hono,
  context: ServiceRuntime,
): void {
  for (const service of SERVICES) {
    ensureServiceRuntimeRecord(service);
    for (const [actionName, action] of Object.entries(service.actions)) {
      registerServiceActionApiRoute({
        app,
        service,
        actionName,
        action,
        context,
      });
    }
  }
}
