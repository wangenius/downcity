/**
 * AgentFactory：agent 级实例装配辅助模块。
 *
 * 关键点（中文）
 * - 当前只负责组装 per-agent service instances。
 * - 未来可继续承接 execution ports / bootstrap 等 agent 装配细化逻辑。
 */

import type { AgentState } from "@/types/AgentState.js";
import { createRegisteredServiceInstances } from "@/main/registries/ServiceClassRegistry.js";
import type { BaseService } from "@services/BaseService.js";

/**
 * 为当前 agent 创建 service instances。
 */
export function createAgentServices(
  agent: AgentState,
): Map<string, BaseService> {
  return createRegisteredServiceInstances(agent);
}
