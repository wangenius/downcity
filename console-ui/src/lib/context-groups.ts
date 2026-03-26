/**
 * Session 分组工具。
 *
 * 关键点（中文）
 * - 统一 Sidebar 与 Context Overview 的分组、排序、搜索逻辑。
 * - 避免页面间出现不同分组规则导致的认知偏差。
 */

import type { UiSessionSummary } from "@/types/Dashboard"

/**
 * context 分组键。
 */
export type SessionGroupKey = "chat" | "api" | "other"

/**
 * context 分组结构。
 */
export interface SessionGroup {
  /**
   * 分组键，用于程序判断与路由状态关联。
   */
  key: SessionGroupKey
  /**
   * 分组展示标题，用于 UI 标签显示。
   */
  title: string
  /**
   * 分组内 session 列表，按更新时间降序。
   */
  items: UiSessionSummary[]
}

const KNOWN_CHAT_CHANNELS = new Set(["telegram", "qq", "feishu", "consoleui"])

function normalizeText(input: unknown): string {
  return String(input || "").trim().toLowerCase()
}

function resolveSessionChannelFromSessionId(sessionIdInput: string): string {
  const sessionId = normalizeText(sessionIdInput)
  if (!sessionId) return "other"
  if (sessionId.startsWith("api:")) return "api"
  if (sessionId.startsWith("consoleui-") || sessionId === "local_ui") return "consoleui"
  return "other"
}

/**
 * 解析 context 对应渠道。
 *
 * 关键点（中文）
 * - 优先使用后端回传的 `context.channel`（新映射唯一事实源）。
 * - 仅保留 `consoleui` 与 `api` 的本地识别，不再兼容旧 contextId 前缀规则。
 */
export function resolveSessionChannel(input: UiSessionSummary | string): string {
  if (typeof input === "string") {
    return resolveSessionChannelFromSessionId(input)
  }
  const channel = normalizeText(input.channel)
  if (KNOWN_CHAT_CHANNELS.has(channel)) return channel
  if (channel === "api") return "api"
  if (channel && channel !== "other") return channel
  return resolveSessionChannelFromSessionId(input.contextId)
}

/**
 * 解析 contextId 对应分组。
 */
export function resolveSessionGroup(input: UiSessionSummary | string): SessionGroupKey {
  const channel = resolveSessionChannel(input)
  if (channel === "api") return "api"
  if (channel === "other") return "other"
  return "chat"
}

/**
 * context 排序：updatedAt desc -> contextId asc。
 */
export function sortSessions(sessions: UiSessionSummary[]): UiSessionSummary[] {
  return [...sessions].sort((a, b) => {
    const aTime = Number(a.updatedAt || 0)
    const bTime = Number(b.updatedAt || 0)
    if (aTime !== bTime) return bTime - aTime
    return a.contextId.localeCompare(b.contextId)
  })
}

/**
 * 构建分组列表。
 */
export function buildSessionGroups(sessions: UiSessionSummary[]): SessionGroup[] {
  const sorted = sortSessions(sessions)
  const groupMap: Record<SessionGroupKey, UiSessionSummary[]> = {
    chat: [],
    api: [],
    other: [],
  }
  for (const item of sorted) {
    const key = resolveSessionGroup(item)
    groupMap[key].push(item)
  }
  const groups: SessionGroup[] = [
    { key: "chat", title: "chat:*", items: groupMap.chat },
    { key: "api", title: "api:*", items: groupMap.api },
    { key: "other", title: "other", items: groupMap.other },
  ]
  return groups.filter((group) => group.items.length > 0)
}

/**
 * 按关键词过滤 context。
 */
export function filterSessionsByKeyword(
  sessions: UiSessionSummary[],
  keyword: string,
): UiSessionSummary[] {
  const term = String(keyword || "").trim().toLowerCase()
  if (!term) return sessions
  return sessions.filter((item) => {
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
