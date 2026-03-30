/**
 * ServiceStateController：service 状态控制与状态记录模块。
 *
 * 关键点（中文）
 * - 专门负责 service 状态记录、生命周期控制、状态快照。
 * - 不处理 action payload，也不处理 HTTP route 注册。
 * - Manager.ts 只作为门面导出，真正逻辑在这里分层实现。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type {
  ServiceStateControlAction,
  ServiceStateControlResult,
  ServiceStateSnapshot,
} from "@/types/ServiceState.js";
import { getAgentState } from "@agent/RuntimeState.js";
import {
  createRegisteredServiceInstances,
  listRegisteredServiceNames,
} from "@/main/registries/ServiceClassRegistry.js";
import type { BaseService } from "@services/BaseService.js";
import type { Service, ServiceState } from "@/types/Service.js";
import { SERVICES } from "./Services.js";

type ServiceStateRecord = {
  service: BaseService;
  state: ServiceState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  chain: Promise<void>;
};

const serviceStateRecords = new Map<string, ServiceStateRecord>();

function nowMs(): number {
  return Date.now();
}

/**
 * 列出当前进程内可见的 service 实例。
 *
 * 关键点（中文）
 * - 若 agent 已就绪，则返回 per-agent service instances。
 * - 若 agent 尚未初始化，则退回静态装配实例，方便测试与只读场景。
 */
export function listServiceInstances(_context?: ExecutionContext): BaseService[] {
  try {
    const agent = getAgentState();
    if (agent.services.size > 0) {
      return [...agent.services.values()];
    }
  } catch {
    // ignore and fallback
  }
  return [...createRegisteredServiceInstances(null).values()];
}

/**
 * 按名称解析 service 实例。
 */
export function resolveServiceByName(
  name: string,
  context?: ExecutionContext,
): BaseService | null {
  const key = String(name || "").trim();
  if (!key) return null;
  return (
    listServiceInstances(context).find((service) => service.name === key) || null
  );
}

/**
 * 确保 service 对应的状态记录存在。
 */
export function ensureServiceStateRecord(
  service: BaseService,
): ServiceStateRecord {
  const key = String(service.name || "").trim();
  const existing = serviceStateRecords.get(key);
  if (existing) {
    existing.service = service;
    return existing;
  }

  const created: ServiceStateRecord = {
    service,
    state: "stopped",
    updatedAt: nowMs(),
    chain: Promise.resolve(),
  };
  serviceStateRecords.set(key, created);
  return created;
}

function hasCommandActions(service: BaseService): boolean {
  return Object.values(service.actions).some((action) =>
    Boolean(action.command),
  );
}

/**
 * 把内部 record 映射为对外快照。
 */
export function toServiceStateSnapshot(
  record: ServiceStateRecord,
): ServiceStateSnapshot {
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
  record: ServiceStateRecord,
  step: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(step()));
  record.chain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
}

/**
 * 标记 service 当前状态。
 */
export function markServiceState(
  record: ServiceStateRecord,
  state: ServiceState,
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

/**
 * 标记最近一次 service command。
 */
export function markServiceCommand(
  record: ServiceStateRecord,
  command: string,
): void {
  record.lastCommand = command;
  record.lastCommandAt = nowMs();
  record.updatedAt = nowMs();
}

/**
 * 返回静态 service 定义清单。
 */
export function getStaticServices(): Service[] {
  return [...SERVICES];
}

/**
 * 返回 service 根命令名清单。
 */
export function getServiceRootCommandNames(): string[] {
  return listRegisteredServiceNames();
}

/**
 * 列出全部 service 状态快照。
 */
export function listServiceStates(): ServiceStateSnapshot[] {
  for (const service of listServiceInstances()) {
    ensureServiceStateRecord(service);
  }
  return Array.from(serviceStateRecords.values())
    .map((item) => toServiceStateSnapshot(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 判断指定 service 是否处于运行中。
 */
export function isServiceRunning(serviceName: string): boolean {
  const service = resolveServiceByName(serviceName);
  if (!service) return false;
  return ensureServiceStateRecord(service).state === "running";
}

async function startServiceInternal(
  service: BaseService,
  context: ExecutionContext,
): Promise<ServiceStateControlResult> {
  const record = ensureServiceStateRecord(service);
  try {
    await runSerialByService(record, async () => {
      if (record.state === "running") return;
      markServiceState(record, "starting");
      try {
        await service.lifecycle?.start?.(context);
        markServiceState(record, "running");
      } catch (error) {
        markServiceState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      service: toServiceStateSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      service: toServiceStateSnapshot(record),
      error: String(error),
    };
  }
}

async function stopServiceInternal(
  service: BaseService,
  context: ExecutionContext,
): Promise<ServiceStateControlResult> {
  const record = ensureServiceStateRecord(service);
  try {
    await runSerialByService(record, async () => {
      if (record.state === "stopped") return;
      markServiceState(record, "stopping");
      try {
        await service.lifecycle?.stop?.(context);
        markServiceState(record, "stopped");
      } catch (error) {
        markServiceState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      service: toServiceStateSnapshot(record),
    };
  } catch (error) {
    return {
      success: false,
      service: toServiceStateSnapshot(record),
      error: String(error),
    };
  }
}

/**
 * 执行单个 service 状态控制动作。
 */
export async function controlServiceState(params: {
  serviceName: string;
  action: ServiceStateControlAction;
  context: ExecutionContext;
}): Promise<ServiceStateControlResult> {
  const service = resolveServiceByName(params.serviceName, params.context);
  if (!service) {
    return {
      success: false,
      error: `Unknown service: ${params.serviceName}`,
    };
  }

  if (params.action === "status") {
    const record = ensureServiceStateRecord(service);
    return {
      success: true,
      service: toServiceStateSnapshot(record),
    };
  }

  if (params.action === "start") {
    return startServiceInternal(service, params.context);
  }

  if (params.action === "stop") {
    return stopServiceInternal(service, params.context);
  }

  const stopped = await stopServiceInternal(service, params.context);
  if (!stopped.success) return stopped;
  return startServiceInternal(service, params.context);
}

/**
 * 启动全部 service。
 */
export async function startAllServices(
  context: ExecutionContext,
): Promise<{
  success: boolean;
  results: ServiceStateControlResult[];
}> {
  const results: ServiceStateControlResult[] = [];
  for (const service of listServiceInstances(context)) {
    results.push(
      await controlServiceState({
        serviceName: service.name,
        action: "start",
        context,
      }),
    );
  }
  return {
    success: results.every((item) => item.success),
    results,
  };
}

/**
 * 停止全部 service。
 */
export async function stopAllServices(context: ExecutionContext): Promise<{
  success: boolean;
  results: ServiceStateControlResult[];
}> {
  const results: ServiceStateControlResult[] = [];
  for (const service of listServiceInstances(context)) {
    results.push(
      await controlServiceState({
        serviceName: service.name,
        action: "stop",
        context,
      }),
    );
  }
  return {
    success: results.every((item) => item.success),
    results,
  };
}
