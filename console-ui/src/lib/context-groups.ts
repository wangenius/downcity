/**
 * Context 分组工具。
 *
 * 关键点（中文）
 * - 统一 Sidebar 与 Context Overview 的分组、排序、搜索逻辑。
 * - 避免页面间出现不同分组规则导致的认知偏差。
 */

import type { UiContextSummary } from "@/types/Dashboard"

/**
 * context 分组键。
 */
export type ContextGroupKey = "local_ui" | "chat" | "api" | "other"

/**
 * context 分组结构。
 */
export interface ContextGroup {
  /**
   * 分组键，用于程序判断与路由状态关联。
   */
  key: ContextGroupKey
  /**
   * 分组展示标题，用于 UI 标签显示。
   */
  title: string
  /**
   * 分组内 context 列表，按更新时间降序。
   */
  items: UiContextSummary[]
}

/**
 * 解析 contextId 对应分组。
 */
export function resolveContextGroup(contextId: string): ContextGroupKey {
  const value = String(contextId || "")
  if (value === "local_ui") return "local_ui"
  if (value.startsWith("telegram-") || value.startsWith("qq-") || value.startsWith("feishu-")) return "chat"
  if (value.startsWith("api:")) return "api"
  return "other"
}

/**
 * context 排序：updatedAt desc -> contextId asc。
 */
export function sortContexts(contexts: UiContextSummary[]): UiContextSummary[] {
  return [...contexts].sort((a, b) => {
    const aTime = Number(a.updatedAt || 0)
    const bTime = Number(b.updatedAt || 0)
    if (aTime !== bTime) return bTime - aTime
    return a.contextId.localeCompare(b.contextId)
  })
}

/**
 * 构建分组列表。
 */
export function buildContextGroups(contexts: UiContextSummary[]): ContextGroup[] {
  const sorted = sortContexts(contexts)
  const groupMap: Record<ContextGroupKey, UiContextSummary[]> = {
    local_ui: [],
    chat: [],
    api: [],
    other: [],
  }
  for (const item of sorted) {
    const key = resolveContextGroup(item.contextId)
    groupMap[key].push(item)
  }
  const groups: ContextGroup[] = [
    { key: "local_ui", title: "local_ui", items: groupMap.local_ui },
    { key: "chat", title: "chat:*", items: groupMap.chat },
    { key: "api", title: "api:*", items: groupMap.api },
    { key: "other", title: "other", items: groupMap.other },
  ]
  return groups.filter((group) => group.items.length > 0)
}

/**
 * 按关键词过滤 context。
 */
export function filterContextsByKeyword(
  contexts: UiContextSummary[],
  keyword: string,
): UiContextSummary[] {
  const term = String(keyword || "").trim().toLowerCase()
  if (!term) return contexts
  return contexts.filter((item) => {
    const id = String(item.contextId || "").toLowerCase()
    const role = String(item.lastRole || "").toLowerCase()
    const text = String(item.lastText || "").toLowerCase()
    return id.includes(term) || role.includes(term) || text.includes(term)
  })
}
