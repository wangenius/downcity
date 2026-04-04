/**
 * ServiceClassRegistry：service 类注册表。
 *
 * 关键点（中文）
 * - main 侧维护“service class 如何创建”的静态事实源。
 * - agent 启动时据此创建 per-agent service instances。
 * - CLI / 只读场景也复用这里构造无宿主实例，避免维护第二套静态 definition。
 */

import type { AgentState } from "@/shared/types/AgentState.js";
import { SERVICE_CLASSES } from "@/city/service/Services.js";
import { BaseService } from "@services/BaseService.js";
import type { Service } from "@/shared/types/Service.js";

let staticServiceInstances: Map<string, BaseService> | null = null;

function createServiceInstance(
  ServiceClass: new (agent: AgentState | null) => BaseService,
  agent: AgentState | null,
): BaseService {
  return new ServiceClass(agent);
}

/**
 * 返回全部已注册 service 名称。
 */
export function listRegisteredServiceNames(): string[] {
  return SERVICE_CLASSES.map((ServiceClass) => new ServiceClass(null).name);
}

/**
 * 返回全部已注册 service 定义视图。
 *
 * 关键点（中文）
 * - 这里返回的是无宿主实例，适用于 CLI 注册、静态说明等只读场景。
 * - 不应承载长期运行状态。
 */
export function listRegisteredServices(): Service[] {
  return SERVICE_CLASSES.map((ServiceClass) => new ServiceClass(null));
}

/**
 * 返回无宿主静态 service 实例集合。
 *
 * 关键点（中文）
 * - 主要用于未初始化 AgentState 的测试/只读场景。
 * - 需要保持实例稳定，避免 start/status/command 分别拿到不同 null-agent 实例。
 */
export function getRegisteredStaticServiceInstances(): Map<string, BaseService> {
  if (staticServiceInstances) return staticServiceInstances;
  staticServiceInstances = createRegisteredServiceInstances(null);
  return staticServiceInstances;
}

/**
 * 为当前 agent 创建一组 per-agent service instances。
 *
 * 关键点（中文）
 * - 返回 Map，便于 agent 以名称直接索引。
 * - 允许传入 null，仅用于无需真实 agent 的测试/只读装配场景。
 */
export function createRegisteredServiceInstances(
  agent: AgentState | null,
): Map<string, BaseService> {
  if (agent === null && staticServiceInstances) {
    return staticServiceInstances;
  }
  const services = new Map<string, BaseService>();
  for (const ServiceClass of SERVICE_CLASSES) {
    const service = createServiceInstance(ServiceClass, agent);
    services.set(service.name, service);
  }
  if (agent === null) {
    staticServiceInstances = services;
  }
  return services;
}
