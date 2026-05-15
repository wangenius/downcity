/**
 * City AgentInitializer 包级转发入口。
 *
 * 关键点（中文）
 * - agent 项目初始化逻辑统一由 `@downcity/agent` 提供。
 * - city 只保留调用入口，不再复制初始化实现。
 */

export {
  normalizeDefaultAgentName,
  listConsoleModelChoices,
  isAgentProjectInitialized,
  initializeAgentProject,
} from "@downcity/agent";
export type { ConsoleModelChoice } from "@downcity/agent";
