/**
 * 未启动 Agent 的概览区。
 *
 * 关键点（中文）
 * - 视觉风格与运行态 overview 对齐：顶部信息条 + 参数块。
 * - 未启动时保持信息完整，但交互仅保留启动主动作。
 */

import * as React from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { Button } from "@downcity/ui"
import type { UiAgentOption } from "@/types/Dashboard"

export interface AgentOverviewStoppedSectionProps {
  /**
   * 当前选中的 agent。
   */
  agent: UiAgentOption | null
  /**
   * 启动 agent 回调。
   */
  onStart: (agentId: string) => Promise<void> | void
}

function BasicRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className="min-w-0 truncate text-foreground" title={props.value}>
        {props.value || "-"}
      </div>
    </div>
  )
}

export function AgentOverviewStoppedSection(props: AgentOverviewStoppedSectionProps) {
  const { agent, onStart } = props
  const [starting, setStarting] = React.useState(false)

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
      <div className="flex items-start justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <img src="/image.png" alt="bot" className="mt-0.5 size-8 shrink-0 rounded-[4px] object-cover" />
            <div className="min-w-0 space-y-1">
              <div className="truncate text-xl font-semibold leading-none text-foreground/74">{agent.name || "Unknown Agent"}</div>
              <div className="truncate text-xs text-muted-foreground">{path}</div>
            </div>
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="secondary"
          disabled={starting}
          title={starting ? "启动中" : "启动"}
          aria-label={starting ? "启动中" : "启动"}
          onClick={async () => {
            try {
              setStarting(true)
              await Promise.resolve(onStart(agent.id))
            } finally {
              setStarting(false)
            }
          }}
        >
          {starting ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
        </Button>
      </div>

      <section className="rounded-[18px] bg-secondary/72 px-3.5 py-3">
        <BasicRow label="Model" value={model} />
        <BasicRow label="Path" value={path} />
        <BasicRow label="Host" value={String(agent.host || "-")} />
        <BasicRow label="Port" value={agent.port ? String(agent.port) : "-"} />
        <BasicRow label="Last Stop" value={lastStoppedAt} />
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</div>
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/45" />
            <span>stopped</span>
          </div>
        </div>
      </section>
    </section>
  )
}
