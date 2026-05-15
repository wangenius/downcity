/**
 * City AgentContext 包级转发入口。
 *
 * 关键点（中文）
 * - 执行期上下文统一来自 `@downcity/agent`。
 * - 避免 city 编译出独立的 AgentContext 类型与运行时实现。
 */

export { createAgentContext, getAgentContext } from "@downcity/agent";
export type { AgentContext } from "@downcity/agent";
