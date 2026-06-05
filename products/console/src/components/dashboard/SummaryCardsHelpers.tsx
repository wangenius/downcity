/**
 * SummaryCards 展示与 execution helper。
 *
 * 关键点（中文）
 * - 主组件保留页面编排，时间格式化、标签、execution 解析等纯逻辑放在这里。
 * - 这些 helper 不依赖外部 state，后续可以独立测试。
 */

import * as React from "react"
import { PauseIcon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import type {
  UiAgentOption,
  UiChannelAccountItem,
  UiChatChannelStatus,
  UiConfigStatusItem,
  UiModelSummary,
  UiOverviewResponse,
  UiServiceItem,
  UiSessionSummary,
  UiSkillSummaryItem,
  UiTaskItem,
} from "../../types/Dashboard"

export interface SummaryCardsProps {
  /**
   * 当前路由对应的 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * 概览数据快照。
   */
  overview: UiOverviewResponse | null
  /**
   * service 列表快照。
   */
  services: UiServiceItem[]
  /**
   * skills 列表快照（来自 skill plugin 的 list / lookup 能力）。
   */
  skills: UiSkillSummaryItem[]
  /**
   * task 列表快照。
   */
  tasks: UiTaskItem[]
  /**
   * session 列表（用于 chat overview 跳转）。
   */
  sessions: UiSessionSummary[]
  /**
   * chat account 列表（用于显示当前绑定账号名称）。
   */
  channelAccounts: UiChannelAccountItem[]
  /**
   * Console UI chat 默认 session id。
   */
  consoleUiSessionId: string
  /**
   * 配置状态列表。
   */
  configStatus: UiConfigStatusItem[]
  /**
   * 模型快照。
   */
  model: UiModelSummary | null
  /**
   * 读取可选的本地 GGUF 模型列表。
   */
  onLoadLocalModels: (projectRoot?: string) => Promise<string[]>
  /**
   * 更新当前 agent 的 execution。
   */
  onUpdateExecution: (input: {
    executionMode: "api" | "acp" | "local"
    modelId?: string
    localModel?: string
    agentType?: string
  }) => void
  /**
   * 启动当前 agent。
   */
  onStartAgent: () => Promise<void> | void
  /**
   * 重启当前 agent。
   */
  onRestartAgent: () => Promise<void> | void
  /**
   * 停止当前 agent。
   */
  onStopAgent: () => Promise<void> | void
  /**
   * 打开 task 详情。
   */
  onOpenTask: (taskTitle: string) => void
  /**
   * 打开 session workspace。
   */
  onOpenSession: (sessionId: string) => void
  /**
   * 控制 service 生命周期。
   */
  onControlService: (serviceName: string, action: string) => Promise<void> | void
  /**
   * chat platform 状态快照。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * 执行 chat platform 动作。
   */
  onChatAction: (
    action: "test" | "reconnect" | "open" | "close",
    channel: string,
  ) => Promise<void> | void
}

export function formatLastRun(rawInput?: string): string {
  const raw = String(rawInput || "").trim()
  if (!raw) return "-"
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/)
  if (!match) return raw

  const [, y, m, d, hh, mm, ss, ms] = match
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    Number(ms),
  )
  if (Number.isNaN(date.getTime())) return raw

  const absolute = date.toLocaleString("zh-CN", { hour12: false })
  const deltaMs = Date.now() - date.getTime()
  if (!Number.isFinite(deltaMs)) return absolute
  if (deltaMs < 60_000) return `${absolute} · 刚刚`
  if (deltaMs < 3_600_000) return `${absolute} · ${Math.floor(deltaMs / 60_000)} 分钟前`
  if (deltaMs < 86_400_000) return `${absolute} · ${Math.floor(deltaMs / 3_600_000)} 小时前`
  return `${absolute} · ${Math.floor(deltaMs / 86_400_000)} 天前`
}

export function KvRow(props: { value: string }) {
  return (
    <div className="truncate text-sm text-foreground" title={props.value}>
      {props.value}
    </div>
  )
}

export function SurfaceTag(props: {
  children: React.ReactNode
  tone?: "default" | "success" | "danger"
}) {
  const toneClassName =
    props.tone === "success"
      ? "bg-emerald-500/8 text-emerald-700"
      : props.tone === "danger"
        ? "bg-destructive/8 text-destructive"
        : "bg-background/80 text-muted-foreground"
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] ${toneClassName}`}>
      {props.children}
    </span>
  )
}

export function ServiceActionIcon(props: { action: string }) {
  if (props.action === "start" || props.action === "resume") return <PlayIcon className="size-3.5" />
  if (props.action === "pause") return <PauseIcon className="size-3.5" />
  if (props.action === "restart") return <RotateCwIcon className="size-3.5" />
  return <SquareIcon className="size-3.5" />
}

export type SummaryExecutionType = "api" | "local" | "acp"
export type SummaryAcpType = "kimi" | "claude" | "codex"

/**
 * 关键点（中文）：overview 主区直接使用统一 execution 选项，避免把 ACP 编辑分散到别处。
 */
export function deriveExecutionState(input: {
  executionMode?: "api" | "acp" | "local"
  agentType?: string
}): {
  executionType: SummaryExecutionType
  agentType: SummaryAcpType
} {
  if (input.executionMode === "api" || !input.executionMode) {
    return {
      executionType: "api",
      agentType: "kimi",
    }
  }
  if (input.executionMode === "local") {
    return {
      executionType: "local",
      agentType: "kimi",
    }
  }
  const agentType = String(input.agentType || "").trim()
  if (agentType === "claude" || agentType === "codex") {
    return {
      executionType: "acp",
      agentType,
    }
  }
  return {
    executionType: "acp",
    agentType: "kimi",
  }
}

export function readExecutionBadge(input: {
  executionType: SummaryExecutionType
  agentType: SummaryAcpType
}): string {
  if (input.executionType === "api") return "api"
  if (input.executionType === "local") return "local"
  return `acp ${input.agentType}`
}

export function buildLocalModelChoices(
  options: string[],
  selected?: string,
): string[] {
  const values = new Set<string>()
  const preferred = String(selected || "").trim()
  if (preferred) values.add(preferred)
  for (const item of options) {
    const normalized = String(item || "").trim()
    if (!normalized) continue
    values.add(normalized)
  }
  return Array.from(values)
}
