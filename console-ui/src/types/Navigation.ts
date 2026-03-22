/**
 * Dashboard 导航类型定义。
 *
 * 关键点（中文）
 * - 统一约束 Scope（Global/Agent/Context）与页面标识，避免概念漂移。
 * - 所有导航相关类型集中在 types 目录，便于复用与演进。
 */

/**
 * Dashboard 作用域。
 */
export type DashboardScope = "global" | "agent" | "context";

/**
 * Dashboard 页面标识。
 */
export type DashboardView =
  | "globalOverview"
  | "globalEnv"
  | "globalModel"
  | "globalChannelAccounts"
  | "globalCommand"
  | "globalAgents"
  | "globalPlugins"
  | "agentOverview"
  | "agentAuthorization"
  | "agentSkills"
  | "agentServices"
  | "agentCommand"
  | "agentTasks"
  | "agentLogs"
  | "contextOverview"
  | "contextWorkspace";

/**
 * Sidebar 主导航页面（不包含 contextWorkspace 动态路由页）。
 */
export type DashboardPrimaryView = Exclude<DashboardView, "contextWorkspace">;

/**
 * Dashboard 页面元信息。
 */
export interface DashboardPageMeta {
  /**
   * 页面唯一标识。
   */
  view: DashboardPrimaryView;
  /**
   * 页面所属作用域（global/agent/context）。
   */
  scope: DashboardScope;
  /**
   * 页面标题（用于 Sidebar 与 Header）。
   */
  title: string;
  /**
   * 页面固定路径（用于 URL 映射）。
   */
  path: string;
}
