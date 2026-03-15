/**
 * Dashboard 路由映射工具。
 *
 * 关键点（中文）
 * - 使用浏览器 pathname 驱动页面状态，刷新后保留当前视图。
 * - 保持纯函数映射，避免在组件内散落硬编码路径。
 */

import type { DashboardView } from "@/components/app-sidebar"

export type DashboardRouteState = {
  /**
   * 当前解析出的视图标识。
   */
  view: DashboardView
  /**
   * 当视图为 context workspace 时的 contextId。
   */
  contextId?: string
}

const VIEW_TO_PATH: Record<Exclude<DashboardView, "contextWorkspace">, string> = {
  globalOverview: "/global/overview",
  globalModel: "/global/model",
  globalAgents: "/global/agents",
  globalExtensions: "/global/extensions",
  agentOverview: "/agent/overview",
  agentChannels: "/agent/channels",
  agentServices: "/agent/services",
  agentTasks: "/agent/tasks",
  agentLogs: "/agent/logs",
  contextOverview: "/context/overview",
}

export function toDashboardPath(view: DashboardView, contextId?: string): string {
  if (view === "contextWorkspace") {
    const normalizedContextId = String(contextId || "").trim()
    if (!normalizedContextId) return "/context/overview"
    return `/context/workspace/${encodeURIComponent(normalizedContextId)}`
  }
  return VIEW_TO_PATH[view]
}

export function parseDashboardPath(pathnameInput: string): DashboardRouteState {
  const pathname = String(pathnameInput || "/").trim() || "/"
  const normalized = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;

  for (const [view, path] of Object.entries(VIEW_TO_PATH)) {
    if (normalized === path) {
      return { view: view as Exclude<DashboardView, "contextWorkspace"> };
    }
  }

  const workspacePrefix = "/context/workspace/";
  if (normalized.startsWith(workspacePrefix)) {
    const raw = normalized.slice(workspacePrefix.length).trim();
    const decoded = raw ? decodeURIComponent(raw) : "";
    if (decoded) {
      return {
        view: "contextWorkspace",
        contextId: decoded,
      };
    }
  }

  return { view: "globalOverview" };
}
