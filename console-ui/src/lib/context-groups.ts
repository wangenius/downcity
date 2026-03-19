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
export type ContextGroupKey = "chat" | "api" | "other"

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

const KNOWN_CHAT_CHANNELS = new Set(["telegram", "qq", "feishu", "consoleui"])

function normalizeText(input: unknown): string {
  return String(input || "").trim().toLowerCase()
}

function resolveContextChannelFromContextId(contextIdInput: string): string {
  const contextId = normalizeText(contextIdInput)
  if (!contextId) return "other"
  if (contextId.startsWith("api:")) return "api"
  if (contextId.startsWith("consoleui-") || contextId === "local_ui") return "consoleui"
  return "other"
}

/**
 * 解析 context 对应渠道。
 *
 * 关键点（中文）
 * - 优先使用后端回传的 `context.channel`（新映射唯一事实源）。
 * - 仅保留 `consoleui` 与 `api` 的本地识别，不再兼容旧 contextId 前缀规则。
 */
export function resolveContextChannel(input: UiContextSummary | string): string {
  if (typeof input === "string") {
    return resolveContextChannelFromContextId(input)
  }
  const channel = normalizeText(input.channel)
  if (KNOWN_CHAT_CHANNELS.has(channel)) return channel
  if (channel === "api") return "api"
  if (channel && channel !== "other") return channel
  return resolveContextChannelFromContextId(input.contextId)
}

/**
 * 解析 contextId 对应分组。
 */
export function resolveContextGroup(input: UiContextSummary | string): ContextGroupKey {
  const channel = resolveContextChannel(input)
  if (channel === "api") return "api"
  if (channel === "other") return "other"
  return "chat"
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
    chat: [],
    api: [],
    other: [],
  }
  for (const item of sorted) {
    const key = resolveContextGroup(item)
    groupMap[key].push(item)
  }
  const groups: ContextGroup[] = [
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
    const chatId = String(item.chatId || "").toLowerCase()
    const chatTitle = String(item.chatTitle || "").toLowerCase()
    const role = String(item.lastRole || "").toLowerCase()
    const text = String(item.lastText || "").toLowerCase()
    return (
      id.includes(term) ||
      chatId.includes(term) ||
      chatTitle.includes(term) ||
      role.includes(term) ||
      text.includes(term)
    )
  })
}
