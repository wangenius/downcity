/**
 * RuntimeController：service runtime 控制与状态记录模块。
 *
 * 关键点（中文）
 * - 专门负责 runtime record、lifecycle 控制、状态快照。
 * - 不处理 action payload，也不处理 HTTP route 注册。
 * - Manager.ts 只作为门面导出，真正逻辑在这里分层实现。
 */

import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type {
  ServiceRuntimeControlAction,
  ServiceRuntimeControlResult,
  ServiceRuntimeSnapshot,
} from "@/types/ServiceRuntime.js";
import { getAgentRuntime } from "@agent/RuntimeState.js";
import {
  createRegisteredServiceInstances,
  listRegisteredServiceNames,
} from "@/main/registries/ServiceClassRegistry.js";
import type { BaseService } from "@services/BaseService.js";
import type { Service, ServiceRuntimeState } from "@/types/Service.js";
import { SERVICES } from "./Services.js";

type ServiceRuntimeRecord = {
  service: BaseService;
  state: ServiceRuntimeState;
  updatedAt: number;
  lastError?: string;
  lastCommand?: string;
  lastCommandAt?: number;
  chain: Promise<void>;
};

const serviceRuntimeRecords = new Map<string, ServiceRuntimeRecord>();

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
export function listRuntimeServices(_context?: ExecutionRuntime): BaseService[] {
  try {
    const agent = getAgentRuntime();
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
  context?: ExecutionRuntime,
): BaseService | null {
  const key = String(name || "").trim();
  if (!key) return null;
  return (
    listRuntimeServices(context).find((service) => service.name === key) || null
  );
}

/**
 * 确保 service 对应的 runtime record 存在。
 */
export function ensureServiceRuntimeRecord(
  service: BaseService,
): ServiceRuntimeRecord {
  const key = String(service.name || "").trim();
  const existing = serviceRuntimeRecords.get(key);
  if (existing) {
    existing.service = service;
    return existing;
  }

  const created: ServiceRuntimeRecord = {
    service,
    state: "stopped",
    updatedAt: nowMs(),
    chain: Promise.resolve(),
  };
  serviceRuntimeRecords.set(key, created);
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
export function toRuntimeSnapshot(
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

/**
 * 标记 runtime 当前状态。
 */
export function markRuntimeState(
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

/**
 * 标记最近一次 service command。
 */
export function markServiceCommand(
  record: ServiceRuntimeRecord,
  command: string,
): void {
  record.lastCommand = command;
  record.lastCommandAt = nowMs();
  record.updatedAt = nowMs();
}

/**
 * 返回静态 service 定义清单。
 */
export function getSmaServices(): Service[] {
  return [...SERVICES];
}

/**
 * 返回 service 根命令名清单。
 */
export function getServiceRootCommandNames(): string[] {
  return listRegisteredServiceNames();
}

/**
 * 列出全部 service runtime 快照。
 */
export function listServiceRuntimes(): ServiceRuntimeSnapshot[] {
  for (const service of listRuntimeServices()) {
    ensureServiceRuntimeRecord(service);
  }
  return Array.from(serviceRuntimeRecords.values())
    .map((item) => toRuntimeSnapshot(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 判断指定 service 是否处于运行中。
 */
export function isServiceRuntimeRunning(serviceName: string): boolean {
  const service = resolveServiceByName(serviceName);
  if (!service) return false;
  return ensureServiceRuntimeRecord(service).state === "running";
}

async function startServiceRuntimeInternal(
  service: BaseService,
  context: ExecutionRuntime,
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
  service: BaseService,
  context: ExecutionRuntime,
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

/**
 * 执行单个 service runtime 控制动作。
 */
export async function controlServiceRuntime(params: {
  serviceName: string;
  action: ServiceRuntimeControlAction;
  context: ExecutionRuntime;
}): Promise<ServiceRuntimeControlResult> {
  const service = resolveServiceByName(params.serviceName, params.context);
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

/**
 * 启动全部 service runtime。
 */
export async function startAllServiceRuntimes(
  context: ExecutionRuntime,
): Promise<{
  success: boolean;
  results: ServiceRuntimeControlResult[];
}> {
  const results: ServiceRuntimeControlResult[] = [];
  for (const service of listRuntimeServices(context)) {
    results.push(
      await controlServiceRuntime({
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
 * 停止全部 service runtime。
 */
export async function stopAllServiceRuntimes(context: ExecutionRuntime): Promise<{
  success: boolean;
  results: ServiceRuntimeControlResult[];
}> {
  const results: ServiceRuntimeControlResult[] = [];
  for (const service of listRuntimeServices(context)) {
    results.push(
      await controlServiceRuntime({
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
