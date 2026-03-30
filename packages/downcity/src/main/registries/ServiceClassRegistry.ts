/**
 * ServiceClassRegistry：service 类注册表。
 *
 * 关键点（中文）
 * - main 侧维护“service class 如何创建”的静态事实源。
 * - 第一阶段先用 LegacyServiceAdapter 包装现有 service object。
 * - agent 启动时据此创建 per-agent service instances。
 */

import type { AgentState } from "@/types/AgentState.js";
import { SERVICES } from "@/main/service/Services.js";
import { BaseService, LegacyServiceAdapter } from "@services/BaseService.js";
import type { Service } from "@/types/Service.js";
import { ChatService } from "@services/chat/ChatService.js";
import { MemoryService } from "@services/memory/MemoryService.js";
import { ShellService } from "@services/shell/ShellService.js";
import { TaskService } from "@services/task/TaskService.js";

/**
 * 根据 legacy service definition 创建 class instance。
 */
function createLegacyServiceInstance(
  definition: Service,
  agent: AgentState | null,
): BaseService {
  if (definition.name === "chat") {
    return new ChatService(agent);
  }
  if (definition.name === "task") {
    return new TaskService(agent);
  }
  if (definition.name === "memory") {
    return new MemoryService(agent);
  }
  if (definition.name === "shell") {
    return new ShellService(agent);
  }
  return new LegacyServiceAdapter({
    agent,
    definition,
  });
}

/**
 * 返回全部已注册 service 名称。
 */
export function listRegisteredServiceNames(): string[] {
  return SERVICES.map((service) => service.name);
}

/**
 * 为当前 agent 创建一组 per-agent service instances。
 *
 * 关键点（中文）
 * - 返回 Map，便于 agent 以名称直接索引。
 * - 第一阶段允许传入 null，仅用于无需真实 agent 的测试/只读装配场景。
 */
export function createRegisteredServiceInstances(
  agent: AgentState | null,
): Map<string, BaseService> {
  const services = new Map<string, BaseService>();
  for (const definition of SERVICES) {
    services.set(
      definition.name,
      createLegacyServiceInstance(definition, agent),
    );
  }
  return services;
}
