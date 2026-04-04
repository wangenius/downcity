/**
 * ServiceActionApi：service action 的 HTTP route 注册模块。
 *
 * 关键点（中文）
 * - 专门负责 `/service/<service>/<action>` 路由注册。
 * - 调度字段抽取、payload 清洗、mapInput 桥接都收敛在这里。
 * - 真正执行仍然走 `runServiceCommand` / `invokeServiceAction`。
 */

import type { Context as HonoContext, Hono } from "hono";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { ServiceCommandScheduleInput } from "@/shared/types/ServiceSchedule.js";
import type { BaseService } from "@services/BaseService.js";
import { parseScheduledRunAtMsOrThrow } from "./schedule/Time.js";
import { normalizeRunAtMsOrThrow } from "./schedule/Time.js";
import type { ServiceAction } from "@/shared/types/Service.js";
import {
  ensureServiceStateRecord,
  isServiceRunning,
  listServiceInstances,
} from "./ServiceStateController.js";
import {
  invokeServiceAction,
  runServiceCommand,
} from "./ServiceActionRunner.js";

function wrapServiceRouteHandler(
  serviceName: string,
  handler: (ctx: HonoContext) => Promise<Response> | Response,
): (ctx: HonoContext) => Promise<Response> | Response {
  return async (c) => {
    if (!isServiceRunning(serviceName)) {
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

  return {
    payload: stripApiScheduleFields(rawPayload),
    ...(schedule ? { schedule } : {}),
  };
}

function registerServiceActionApiRoute(params: {
  app: Hono;
  service: BaseService;
  actionName: string;
  action: ServiceAction<JsonValue, JsonValue>;
  context: ExecutionContext;
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

/**
 * 为服务端注册全部 service action API。
 */
export function registerAllServicesForServer(
  app: Hono,
  context: ExecutionContext,
): void {
  for (const service of listServiceInstances()) {
    ensureServiceStateRecord(service);
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
