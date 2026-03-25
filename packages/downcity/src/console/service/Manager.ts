/**
 * Service manager entrypoint.
 *
 * 关键点（中文）
 * - 所有 services 统一在这里声明、启动、调度
 * - service 仅通过 `actions` 声明能力，main 负责 runtime 与 HTTP 路由注册
 */

import type { Context as HonoContext, Hono } from "hono";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { ServiceCommandScheduleInput } from "@/types/ServiceSchedule.js";
import type {
  Service,
  ServiceAction,
  ServiceActionResult,
  ServiceCommandResult,
  ServiceRuntimeState,
} from "./ServiceManager.js";
import { SERVICES } from "./Services.js";
import { ServiceScheduleStore } from "./schedule/Store.js";
import { parseScheduledRunAtMsOrThrow } from "./schedule/Time.js";
import { normalizeRunAtMsOrThrow } from "./schedule/Time.js";

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
  step: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(step()));
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
  schedule?: JsonValue | ServiceCommandScheduleInput;
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
  if (params.schedule !== undefined && params.schedule !== null) {
    if (!action) {
      return {
        success: false,
        service: toRuntimeSnapshot(record),
        message: `Scheduling only supports service actions. "${service.name}.${command}" is not a schedulable action.`,
      };
    }

    try {
      const scheduleInput = params.schedule as Partial<ServiceCommandScheduleInput>;
      const runAtMs = normalizeRunAtMsOrThrow(
        scheduleInput.runAtMs,
        "schedule.runAtMs",
      );
      const store = new ServiceScheduleStore(params.context.rootPath);
      try {
        const job = store.createJob({
          serviceName: service.name,
          actionName: command,
          payload: params.payload ?? null,
          runAtMs,
        });
        return {
          success: true,
          service: toRuntimeSnapshot(record),
          data: {
            scheduled: true,
            jobId: job.id,
            runAtMs: job.runAtMs,
            status: job.status,
          },
        };
      } finally {
        store.close();
      }
    } catch (error) {
      return {
        success: false,
        service: toRuntimeSnapshot(record),
        message: String(error),
      };
    }
  }

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

/**
 * 识别 API 层的通用调度参数。
 *
 * 关键点（中文）
 * - 专用 action API 与统一 `/api/services/command` 共用同一套 delay/time 语义。
 * - 一旦识别为调度参数，就会在传给 action.mapInput 前剥离，避免二次调度。
 */
function extractApiScheduleInputFromRawPayload(
  rawPayload: JsonValue,
): ServiceCommandScheduleInput | undefined {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return undefined;
  }
  const record = rawPayload as Record<string, unknown>;
  const nestedSchedule =
    record.schedule && typeof record.schedule === "object" && !Array.isArray(record.schedule)
      ? (record.schedule as Record<string, unknown>)
      : undefined;
  const nestedRunAtMs = nestedSchedule?.runAtMs;
  const topLevelDelay = record.delayMs ?? record.delay;
  const topLevelTime = record.sendAtMs ?? record.sendAt ?? record.time;

  if (nestedRunAtMs !== undefined && (topLevelDelay !== undefined || topLevelTime !== undefined)) {
    throw new Error("`schedule.runAtMs` cannot be used together with `delay/time`.");
  }

  if (nestedRunAtMs !== undefined) {
    return {
      runAtMs: normalizeRunAtMsOrThrow(
        nestedRunAtMs as string | number | undefined,
        "schedule.runAtMs",
      ),
    };
  }

  const runAtMs = parseScheduledRunAtMsOrThrow({
    delay: topLevelDelay as string | number | undefined,
    time: topLevelTime as string | number | undefined,
  });
  if (typeof runAtMs !== "number") return undefined;
  return { runAtMs };
}

/**
 * 从原始 payload 中移除 API 层保留的通用调度字段。
 */
function stripApiScheduleFields(rawPayload: JsonValue): JsonValue {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return rawPayload;
  }
  const record = rawPayload as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      key === "schedule" ||
      key === "delay" ||
      key === "delayMs" ||
      key === "time" ||
      key === "sendAt" ||
      key === "sendAtMs"
    ) {
      continue;
    }
    next[key] = value;
  }
  return next as JsonValue;
}

/**
 * 用预读取后的原始 payload 构造 mapInput 专用上下文。
 *
 * 关键点（中文）
 * - 让 route 层可以先统一处理调度参数，再把“净化后的请求体/查询”交给 action 自己解析。
 */
function createApiMapInputContext(params: {
  context: HonoContext;
  rawPayload: JsonValue;
}): HonoContext {
  const sanitizedPayload = stripApiScheduleFields(params.rawPayload);
  const originalReq = params.context.req;
  const sanitizedQuery =
    sanitizedPayload && typeof sanitizedPayload === "object" && !Array.isArray(sanitizedPayload)
      ? (sanitizedPayload as Record<string, string>)
      : {};
  const requestShim = {
    ...originalReq,
    async json() {
      return sanitizedPayload;
    },
    query(key?: string) {
      if (typeof key === "string") {
        return sanitizedQuery[key];
      }
      return sanitizedQuery;
    },
  };
  return {
    ...params.context,
    req: requestShim as typeof params.context.req,
  } as HonoContext;
}

async function mapServiceActionApiPayload(params: {
  action: ServiceAction<JsonValue, JsonValue>;
  method: "GET" | "POST" | "PUT" | "DELETE";
  context: HonoContext;
}): Promise<{
  payload: JsonValue;
  schedule?: ServiceCommandScheduleInput;
}> {
  let rawPayload: JsonValue;
  if (params.method === "GET") {
    rawPayload = toQueryPayload(params.context);
  } else {
    try {
      rawPayload = (await params.context.req.json()) as JsonValue;
    } catch {
      throw new Error("Invalid JSON body");
    }
  }

  const schedule = extractApiScheduleInputFromRawPayload(rawPayload);
  const mapInputContext = createApiMapInputContext({
    context: params.context,
    rawPayload,
  });

  if (params.action.api?.mapInput) {
    return {
      payload: await params.action.api.mapInput(mapInputContext),
      ...(schedule ? { schedule } : {}),
    };
  }

  if (params.method === "GET") {
    return {
      payload: stripApiScheduleFields(rawPayload),
      ...(schedule ? { schedule } : {}),
    };
  }

  return {
    payload: stripApiScheduleFields(rawPayload),
    ...(schedule ? { schedule } : {}),
  };
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
    let schedule: ServiceCommandScheduleInput | undefined;
    try {
      const mapped = await mapServiceActionApiPayload({
        action: params.action,
        method,
        context: c,
      });
      payload = mapped.payload;
      schedule = mapped.schedule;
    } catch (error) {
      return c.json(
        {
          success: false,
          error: String(error),
        },
        400,
      );
    }

    const result = schedule
      ? await runServiceCommand({
          serviceName: params.service.name,
          command: params.actionName,
          payload,
          schedule,
          context: params.context,
        })
      : await invokeServiceAction({
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
