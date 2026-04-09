/**
 * Console 全局 workboard hook。
 *
 * 关键点（中文）
 * - workboard 是 Console 全局板面，不再绑定单个 agent。
 * - hook 会遍历全部 agent，为运行中的 agent 拉取公开快照，并为停止态 agent 生成占位板面。
 */

import * as React from "react"
import {
  ConsoleApiError,
  dashboardApiRoutes,
  requestConsoleApiJson,
} from "@/lib/dashboard-api"
import type { UiAgentOption } from "@/types/Dashboard"
import type {
  UiWorkboardAgentBoardItem,
  UiWorkboardAgentSnapshot,
  UiWorkboardBoardSnapshot,
  UiWorkboardSnapshotResponse,
} from "@/types/Workboard"

export interface UseWorkboardResult {
  /**
   * 当前全局板面。
   */
  board: UiWorkboardBoardSnapshot | null
  /**
   * 当前是否正在加载。
   */
  loading: boolean
  /**
   * 错误信息。
   */
  errorMessage: string
  /**
   * 手动刷新。
   */
  refresh: () => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ConsoleApiError) return error.message
  if (error instanceof Error) return error.message || String(error)
  return String(error)
}

function buildStandbySnapshot(agent: UiAgentOption, collectedAt: string): UiWorkboardAgentSnapshot {
  const name = String(agent.name || agent.id || "agent").trim() || "agent"
  return {
    name,
    running: false,
    statusText: "当前还没有对外可见的新动态",
    collectedAt,
    headline: "当前处于安静待命的状态",
    posture: "静候下一步",
    momentum: "安静",
    visibilityNote: "这里展示的是面向外部的概览状态，不包含内部上下文细节。",
    current: [
      {
        id: `idle:${agent.id}`,
        kind: "idle",
        title: "当前处于安静待命",
        summary: "等待新的输入、触发或下一次启动。",
        status: "waiting",
        updatedAt: collectedAt,
        tags: ["public", "idle"],
      },
    ],
    recent: [],
    signals: [
      { label: "状态节奏", value: "安静待命", tone: "neutral" },
      { label: "现场感受", value: "整体平稳", tone: "neutral" },
      { label: "活跃温度", value: "较为安静", tone: "neutral" },
    ],
  }
}

function toBoardItem(agentId: string, snapshot: UiWorkboardAgentSnapshot): UiWorkboardAgentBoardItem {
  return {
    id: agentId,
    name: snapshot.name,
    running: snapshot.running,
    headline: snapshot.headline,
    posture: snapshot.posture,
    momentum: snapshot.momentum,
    statusText: snapshot.statusText,
    collectedAt: snapshot.collectedAt,
    currentCount: snapshot.current.length,
    recentCount: snapshot.recent.length,
    signalCount: snapshot.signals.length,
    snapshot,
  }
}

async function loadAgentSnapshot(params: {
  agent: UiAgentOption
  selectedAgentId: string
}): Promise<UiWorkboardAgentBoardItem> {
  const collectedAt = new Date().toISOString()
  const agentId = String(params.agent.id || "").trim()

  if (!agentId || params.agent.running !== true) {
    return toBoardItem(agentId || `idle:${collectedAt}`, buildStandbySnapshot(params.agent, collectedAt))
  }

  try {
    const payload = await requestConsoleApiJson<UiWorkboardSnapshotResponse>({
      path: dashboardApiRoutes.workboardSnapshot(),
      selectedAgentId: params.selectedAgentId,
      preferredAgentId: agentId,
    })

    if (!payload.snapshot) {
      return toBoardItem(agentId, buildStandbySnapshot(params.agent, collectedAt))
    }

    const snapshot: UiWorkboardAgentSnapshot = {
      name: payload.snapshot.agent.name,
      running: payload.snapshot.agent.running,
      statusText: payload.snapshot.agent.statusText,
      collectedAt: payload.snapshot.agent.collectedAt,
      headline: payload.snapshot.summary.headline,
      posture: payload.snapshot.summary.posture,
      momentum: payload.snapshot.summary.momentum,
      visibilityNote: payload.snapshot.summary.visibilityNote,
      current: payload.snapshot.current || [],
      recent: payload.snapshot.recent || [],
      signals: payload.snapshot.signals || [],
    }
    return toBoardItem(agentId, snapshot)
  } catch {
    const fallback = buildStandbySnapshot(
      {
        ...params.agent,
        running: true,
      },
      collectedAt,
    )
    fallback.statusText = "当前状态暂时无法更新"
    fallback.headline = "当前状态暂时不可见"
    fallback.posture = "稍后再看"
    fallback.momentum = "轻微中断"
    fallback.current = [
      {
        id: `issue:${agentId}`,
        kind: "idle",
        title: "公开状态暂时不可见",
        summary: "这位 agent 仍然在线，但当前公开板面没有返回最新状态。",
        status: "issue",
        updatedAt: collectedAt,
        tags: ["public", "issue"],
      },
    ]
    fallback.signals = [
      { label: "状态节奏", value: "暂时中断", tone: "warning" },
      { label: "现场感受", value: "有些波动", tone: "warning" },
      { label: "活跃温度", value: "稍后再看", tone: "neutral" },
    ]
    return toBoardItem(agentId, fallback)
  }
}

function sortBoardItems(items: UiWorkboardAgentBoardItem[]): UiWorkboardAgentBoardItem[] {
  return [...items].sort((left, right) => {
    if (left.running !== right.running) return left.running ? -1 : 1
    if (left.currentCount !== right.currentCount) return right.currentCount - left.currentCount
    return left.name.localeCompare(right.name)
  })
}

export function useWorkboard(params: {
  agents: UiAgentOption[]
  selectedAgentId: string
  enabled: boolean
}): UseWorkboardResult {
  const [board, setBoard] = React.useState<UiWorkboardBoardSnapshot | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")

  const refresh = React.useCallback(async () => {
    const agents = Array.isArray(params.agents) ? params.agents : []
    if (!params.enabled || agents.length === 0) {
      setBoard(null)
      setErrorMessage("")
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const items = await Promise.all(
        agents.map((agent) => loadAgentSnapshot({
          agent,
          selectedAgentId: params.selectedAgentId,
        })),
      )
      const ordered = sortBoardItems(items)
      const liveAgents = ordered.filter((item) => item.running).length
      const activeAgents = ordered.filter((item) => item.snapshot.current.some((entry) => entry.status === "active")).length
      const quietAgents = ordered.filter((item) => item.snapshot.momentum === "安静").length
      const collectedAt = new Date().toISOString()

      setBoard({
        summary: {
          totalAgents: ordered.length,
          liveAgents,
          activeAgents,
          quietAgents,
        },
        agents: ordered,
        collectedAt,
      })
      setErrorMessage("")
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [params.agents, params.enabled, params.selectedAgentId])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  React.useEffect(() => {
    if (!params.enabled || params.agents.length === 0) return undefined
    const timer = window.setInterval(() => {
      void refresh()
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [params.agents.length, params.enabled, refresh])

  return {
    board,
    loading,
    errorMessage,
    refresh,
  }
}
