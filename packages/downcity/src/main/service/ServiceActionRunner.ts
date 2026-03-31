/**
 * ServiceActionRunner：service action/command 执行模块。
 *
 * 关键点（中文）
 * - 这里只关心 action 命令解析、调度落盘、lifecycle.command 调用。
 * - service 状态变更交给 ServiceStateController。
 * - HTTP route 层不会直接实现业务分发，只调用这里的统一入口。
 */

import type { JsonValue } from "@/types/Json.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ServiceCommandScheduleInput } from "@/types/ServiceSchedule.js";
import type {
  ServiceStateControlAction,
  ServiceStateSnapshot,
} from "@/types/ServiceState.js";
import type { BaseService } from "@services/BaseService.js";
import { ServiceScheduleStore } from "./schedule/Store.js";
import { normalizeRunAtMsOrThrow } from "./schedule/Time.js";
import type {
  ServiceAction,
  ServiceActionResult,
  ServiceCommandResult,
} from "@/types/Service.js";
import {
  controlServiceState,
  ensureServiceStateRecord,
  markServiceState,
  markServiceCommand,
  resolveServiceByName,
  toServiceStateSnapshot,
} from "./ServiceStateController.js";

/**
 * 按名称解析 service action。
 */
export function resolveServiceAction(
  service: BaseService,
  actionName: string,
): ServiceAction<JsonValue, JsonValue> | null {
  const key = String(actionName || "").trim();
  if (!key) return null;
  return service.actions[key] || null;
}

/**
 * 执行一个 service action。
 */
export async function invokeServiceAction(params: {
  service: BaseService;
  actionName: string;
  payload?: JsonValue;
  context: ExecutionContext;
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

function toControlCommandAction(
  command: string,
): ServiceStateControlAction | null {
  if (
    command === "status" ||
    command === "start" ||
    command === "stop" ||
    command === "restart"
  ) {
    return command;
  }
  return null;
}

async function scheduleServiceAction(params: {
  service: BaseService;
  command: string;
  payload?: JsonValue;
  schedule: JsonValue | ServiceCommandScheduleInput;
  recordSnapshot: ServiceStateSnapshot;
  context: ExecutionContext;
}): Promise<ServiceCommandResult & { service?: ServiceStateSnapshot }> {
  try {
    const scheduleInput = params.schedule as Partial<ServiceCommandScheduleInput>;
    const runAtMs = normalizeRunAtMsOrThrow(
      scheduleInput.runAtMs,
      "schedule.runAtMs",
    );
    const store = new ServiceScheduleStore(params.context.rootPath);
    try {
      const job = store.createJob({
        serviceName: params.service.name,
        actionName: params.command,
        payload: params.payload ?? null,
        runAtMs,
      });
      return {
        success: true,
        service: params.recordSnapshot,
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
      service: params.recordSnapshot,
      message: String(error),
    };
  }
}

/**
 * 统一执行 service command。
 *
 * 关键点（中文）
 * - action 命令、状态控制命令、lifecycle.command 都走这里。
 * - 调度能力也是在这里统一处理，而不是散落到 route/CLI 层。
 */
export async function runServiceCommand(params: {
  serviceName: string;
  command: string;
  payload?: JsonValue;
  schedule?: JsonValue | ServiceCommandScheduleInput;
  context: ExecutionContext;
}): Promise<ServiceCommandResult & { service?: ServiceStateSnapshot }> {
  const service = resolveServiceByName(params.serviceName);
  if (!service) {
    return {
      success: false,
      message: `Unknown service: ${params.serviceName}`,
    };
  }

  const record = ensureServiceStateRecord(service);
  const command = String(params.command || "")
    .trim()
    .toLowerCase();
  if (!command) {
    return {
      success: false,
      service: toServiceStateSnapshot(record, service),
      message: "command is required",
    };
  }

  markServiceCommand(record, command);

  const action = resolveServiceAction(service, command);
  if (params.schedule !== undefined && params.schedule !== null) {
    if (!action) {
      return {
        success: false,
        service: toServiceStateSnapshot(record, service),
        message: `Scheduling only supports service actions. "${service.name}.${command}" is not a schedulable action.`,
      };
    }

    return await scheduleServiceAction({
      service,
      command,
      payload: params.payload,
      schedule: params.schedule,
      recordSnapshot: toServiceStateSnapshot(record, service),
      context: params.context,
    });
  }

  if (action) {
    if (record.state !== "running") {
      return {
        success: false,
        service: toServiceStateSnapshot(record, service),
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
        service: toServiceStateSnapshot(record, service),
        message: result.error || "service action failed",
      };
    }

    return {
      success: true,
      service: toServiceStateSnapshot(record, service),
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  }

  const controlAction = toControlCommandAction(command);
  if (controlAction) {
    const result = await controlServiceState({
      serviceName: service.name,
      action: controlAction,
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
      service: toServiceStateSnapshot(record, service),
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
        service: toServiceStateSnapshot(record, service),
      };
    } catch (error) {
      markServiceState(record, "error", String(error));
      return {
        success: false,
        service: toServiceStateSnapshot(record, service),
        message: String(error),
      };
    }
  }

  return {
    success: false,
    service: toServiceStateSnapshot(record, service),
    message: `Service "${service.name}" does not implement action "${command}"`,
  };
}
