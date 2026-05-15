/**
 * City AgentRuntimeState 包级转发入口。
 *
 * 关键点（中文）
 * - 统一复用 `@downcity/agent` 内部的 runtime 单例状态。
 * - 避免 city 侧继续保留一份平行状态容器。
 */

export {
  getAgentRuntime,
  getAgentRuntimeBase,
  setAgentRuntime,
  setAgentRuntimeBase,
  requireAgentModel,
} from "@downcity/agent";
export type { AgentRuntime, AgentRuntimeBase } from "@downcity/agent";
