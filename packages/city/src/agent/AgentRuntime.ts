/**
 * City AgentRuntime 包级转发入口。
 *
 * 关键点（中文）
 * - city 不再维护独立的 AgentRuntime 实现。
 * - 所有运行时能力统一转发到 `@downcity/agent`，避免出现两份进程级状态。
 */

export {
  initAgentRuntime,
  stopAgentHotReload,
  getAgentContext,
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
  requireAgentModel,
} from "@downcity/agent";
export type { AgentRuntime, AgentRuntimeBase } from "@downcity/agent";
