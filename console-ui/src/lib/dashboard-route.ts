/**
 * Dashboard 路由映射工具。
 *
 * 关键点（中文）
 * - 使用浏览器 pathname 驱动页面状态，刷新后保留当前视图。
 * - 保持纯函数映射，避免在组件内散落硬编码路径。
 */

import { getPrimaryViewPathMap } from "@/lib/dashboard-navigation"
import type { DashboardPrimaryView, DashboardView } from "@/types/Navigation"

export type DashboardRouteState = {
  /**
   * 当前解析出的视图标识。
   */
  view: DashboardView
  /**
   * 当前解析出的 agent 路由段（新路由格式）。
   */
  agentSegment?: string
  /**
   * 当视图为 context workspace 时的 contextId。
   */
  contextId?: string
  /**
   * 当视图为 context 页面时的 channel。
   */
  channel?: string
  /**
   * 当视图为 agentTasks 时的 task 标题。
   */
  taskTitle?: string
}

const VIEW_TO_PATH: Record<DashboardPrimaryView, string> = getPrimaryViewPathMap()

/**
 * 生成 channel 路由段。
 */
function toChannelRouteSegment(raw: string): string {
  const text = String(raw || "").trim().toLocaleLowerCase()
  if (!text) return "unknown"
  const normalized = text
    .replace(/[\s_]+/g, "-")
    .replace(/[/?#]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "unknown"
}

/**
 * 生成 agent 路由段。
 */
export function toAgentRouteSegment(raw: string): string {
  const text = String(raw || "").trim().toLocaleLowerCase()
  if (!text) return "agent"
  const normalized = text
    .replace(/[\s_]+/g, "-")
    .replace(/[/?#]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized || "agent"
}

export function toDashboardPath(
  view: DashboardView,
  options?: {
    contextId?: string
    taskTitle?: string
    agentSegment?: string
    channel?: string
  },
): string {
  const agentSegment = toAgentRouteSegment(String(options?.agentSegment || "agent"))

  if (view === "globalOverview") {
    const hasAgentSegment = Boolean(String(options?.agentSegment || "").trim())
    if (hasAgentSegment) return `/global/agent/${encodeURIComponent(agentSegment)}`
    return "/global/overview"
  }
  if (view === "globalEnv") return "/global/env"
  if (view === "globalModel") return "/global/model"
  if (view === "globalChannelAccounts") return "/global/channel-accounts"
  if (view === "globalCommand") return "/global/command"
  if (view === "globalAgents") return "/global/agents"
  if (view === "globalPlugins") return "/global/plugins"
  if (view === "agentOverview") return `/${encodeURIComponent(agentSegment)}/overview`
  if (view === "agentAuthorization") return `/${encodeURIComponent(agentSegment)}/authorization`
  if (view === "agentSkills") return `/${encodeURIComponent(agentSegment)}/skills`
  if (view === "agentServices") return `/${encodeURIComponent(agentSegment)}/services`
  if (view === "agentCommand") return `/${encodeURIComponent(agentSegment)}/command`
  if (view === "agentTasks") {
    const normalizedTaskTitle = String(options?.taskTitle || "").trim()
    if (!normalizedTaskTitle) return `/${encodeURIComponent(agentSegment)}/tasks`
    return `/${encodeURIComponent(agentSegment)}/tasks/${encodeURIComponent(normalizedTaskTitle)}`
  }
  if (view === "agentLogs") return `/${encodeURIComponent(agentSegment)}/logs`
  if (view === "contextOverview") {
    const channel = toChannelRouteSegment(String(options?.channel || ""))
    return `/${encodeURIComponent(agentSegment)}/channel/${encodeURIComponent(channel)}`
  }
  if (view === "contextWorkspace") {
    const normalizedContextId = String(options?.contextId || "").trim()
    const channel = toChannelRouteSegment(String(options?.channel || ""))
    if (!normalizedContextId) {
      return `/${encodeURIComponent(agentSegment)}/channel/${encodeURIComponent(channel)}`
    }
    return `/${encodeURIComponent(agentSegment)}/channel/${encodeURIComponent(channel)}/chat/${encodeURIComponent(normalizedContextId)}`
  }
  return "/global/overview"
}

export function parseDashboardPath(pathnameInput: string): DashboardRouteState {
  const pathname = String(pathnameInput || "/").trim() || "/"
  const normalized = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;

  for (const [view, path] of Object.entries(VIEW_TO_PATH)) {
    if (normalized === path) {
      return { view: view as DashboardPrimaryView };
    }
  }

  // 新路由格式：/<agent>/overview|services|command|tasks|logs|channel/:channel(/chat/:context)
  const parts = normalized.split("/").filter(Boolean)
  if (parts.length >= 3) {
    const first = String(parts[0] || "").trim().toLowerCase()
    const second = String(parts[1] || "").trim().toLowerCase()
    if (first === "global" && second === "agent") {
      const agentSegment = decodeURIComponent(parts.slice(2).join("/")).trim()
      if (agentSegment) {
        return { view: "globalOverview", agentSegment }
      }
    }
  }

  if (parts.length >= 2) {
    const agentSegment = decodeURIComponent(parts[0] || "").trim()
    const second = String(parts[1] || "").trim().toLowerCase()
    if (agentSegment) {
      if (second === "overview") return { view: "agentOverview", agentSegment }
      if (second === "authorization") return { view: "agentAuthorization", agentSegment }
      if (second === "skills") return { view: "agentSkills", agentSegment }
      if (second === "services") return { view: "agentServices", agentSegment }
      if (second === "command") return { view: "agentCommand", agentSegment }
      if (second === "tasks") {
        const taskTitle = parts.length >= 3 ? decodeURIComponent(parts.slice(2).join("/")) : ""
        return { view: "agentTasks", agentSegment, taskTitle }
      }
      if (second === "logs") return { view: "agentLogs", agentSegment }
      if (second === "channel") {
        const channel = parts.length >= 3 ? decodeURIComponent(String(parts[2] || "").trim()) : ""
        const third = String(parts[3] || "").trim().toLowerCase()
        if (third === "chat") {
          const contextId = parts.length >= 5 ? decodeURIComponent(parts.slice(4).join("/")) : ""
          if (contextId) {
            return { view: "contextWorkspace", agentSegment, channel, contextId }
          }
        }
        return { view: "contextOverview", agentSegment, channel }
      }
      if (second === "chat") {
        const contextId = parts.length >= 3 ? decodeURIComponent(parts.slice(2).join("/")) : ""
        if (contextId) {
          return { view: "contextWorkspace", agentSegment, contextId }
        }
        return { view: "contextOverview", agentSegment }
      }
    }
  }

  return { view: "globalOverview" };
}
