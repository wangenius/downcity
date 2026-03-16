/**
 * 未启动 Agent 的概览区。
 *
 * 关键点（中文）
 * - 仅展示必要基础信息，避免运行态面板造成噪音。
 * - 提供单一启动入口，交互保持克制。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import type { UiAgentOption } from "@/types/Dashboard"

export interface AgentOverviewStoppedSectionProps {
  /**
   * 当前选中的 agent。
   */
  agent: UiAgentOption | null
  /**
   * 启动 agent 回调。
   */
  onStart: (agentId: string) => void
}

function BasicRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div className="min-w-0 truncate text-sm text-foreground" title={props.value}>
        {props.value || "-"}
      </div>
    </div>
  )
}

export function AgentOverviewStoppedSection(props: AgentOverviewStoppedSectionProps) {
  const { agent, onStart } = props

  if (!agent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 Agent</div>
  }

  const model = String(agent.primaryModelId || "").trim() || "-"
  const path = String(agent.projectRoot || agent.id || "").trim() || "-"
  const lastStoppedAt = agent.stoppedAt
    ? new Date(agent.stoppedAt).toLocaleString("zh-CN", { hour12: false })
    : "-"

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold tracking-tight text-foreground">{agent.name || "Unknown Agent"}</div>
          <div className="mt-1 text-xs text-muted-foreground">当前未启动</div>
        </div>
        <Button size="sm" onClick={() => onStart(agent.id)}>
          启动
        </Button>
      </div>

      <div className="space-y-0.5">
        <BasicRow label="Model" value={model} />
        <BasicRow label="Path" value={path} />
        <BasicRow label="Host" value={String(agent.host || "-")} />
        <BasicRow label="Port" value={agent.port ? String(agent.port) : "-"} />
        <BasicRow label="Last Stop" value={lastStoppedAt} />
      </div>
    </section>
  )
}

