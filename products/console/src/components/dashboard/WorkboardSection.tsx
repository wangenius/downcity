/**
 * Workboard Section。
 *
 * 关键点（中文）
 * - 这是独立 main view，不再作为 overview 下的附属模块。
 * - 页面层负责空态、启动动作与选中编排，视觉主体交给 `@downcity/ui` 的 Workboard。
 */

import * as React from "react"
import { Badge, Button, Workboard } from "@downcity/ui"
import { BotIcon, PlayIcon, RadarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UiWorkboardSnapshot } from "@/types/Workboard"

export interface WorkboardSectionProps {
  /**
   * 当前快照。
   */
  snapshot: UiWorkboardSnapshot | null
  /**
   * 当前是否正在加载。
   */
  loading?: boolean
  /**
   * 错误信息。
   */
  errorMessage?: string
  /**
   * 手动刷新。
   */
  onRefresh?: () => void
  /**
   * 当前 agent 名称。
   */
  agentName?: string
  /**
   * 当前 agent 是否运行中。
   */
  running?: boolean
  /**
   * 当前 agent 状态文案。
   */
  statusText?: string
  /**
   * 启动 agent。
   */
  onStartAgent?: () => void
}

export function WorkboardSection(props: WorkboardSectionProps) {
  const [selectedActivityId, setSelectedActivityId] = React.useState("")

  React.useEffect(() => {
    const items = [
      ...(props.snapshot?.current || []),
      ...(props.snapshot?.recent || []),
    ]
    if (items.length === 0) {
      setSelectedActivityId("")
      return
    }
    const matched = items.find((item) => item.id === selectedActivityId)
    if (!matched) {
      setSelectedActivityId(items[0]?.id || "")
    }
  }, [props.snapshot, selectedActivityId])

  const running = props.running === true
  const headerName = String(props.snapshot?.agent.name || props.agentName || "Agent").trim() || "Agent"
  const headerStatus = String(props.snapshot?.agent.statusText || props.statusText || "").trim()

  return (
    <section className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(135deg,rgba(234,228,215,0.5),rgba(255,255,255,0.92)_38%,rgba(205,223,218,0.45))] px-5 py-5 shadow-[0_1px_0_rgba(17,17,19,0.03),0_16px_34px_rgba(17,17,19,0.05)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(17,17,19,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.04)_1px,transparent_1px)] bg-[size:28px_28px] opacity-35" />
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={running ? "default" : "outline"}>
                {running ? "Live Workboard" : "Standby"}
              </Badge>
              <Badge variant="outline">Agent Main View</Badge>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-[16px] border border-foreground/10 bg-background/80 text-foreground">
                    <RadarIcon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-foreground">
                      {headerName}
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/68">
                      {headerStatus || "观察当前 agent 对外呈现出的状态、近期片段和公开线索。"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-[22px] border border-foreground/8 bg-background/68 p-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Current</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {props.snapshot?.current.length || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Recent</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {props.snapshot?.recent.length || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Signals</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {props.snapshot?.signals.length || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/48">Momentum</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {props.snapshot?.summary.momentum || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/70 bg-background px-5 py-5 shadow-[0_1px_0_rgba(17,17,19,0.03)]">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <BotIcon className="size-4" />
            Operator Notes
          </div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Workboard 现在是独立 main view，不再塞进 overview 卡片流里。</p>
            <p>这里展示的是对外概览状态，强调可读性，不直接暴露内部上下文或执行细节。</p>
          </div>
        </div>
      </div>

      {props.errorMessage ? (
        <div className="rounded-[22px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {props.errorMessage}
        </div>
      ) : null}

      {!running ? (
        <div className="relative overflow-hidden rounded-[30px] border border-border/70 bg-[linear-gradient(145deg,rgba(246,244,238,0.92),rgba(255,255,255,0.98))] px-6 py-8 shadow-[0_1px_0_rgba(17,17,19,0.03),0_18px_38px_rgba(17,17,19,0.04)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(197,118,42,0.13),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(63,110,101,0.16),transparent_32%)]" />
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">No live runtime</Badge>
                <Badge variant="secondary">Workboard idle</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  当前 agent 还没有可展示的新动态
                </h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  workboard 依赖运行中的 agent 生成公开状态快照。先启动 agent，再回来查看这块对外看板。
                </p>
              </div>
              {props.onStartAgent ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={props.onStartAgent}>
                    <PlayIcon className="size-4" />
                    启动 Agent
                  </Button>
                </div>
              ) : null}
            </div>
            <div className={cn(
              "rounded-[24px] border border-border/70 bg-background/80 p-4",
              "[background-image:linear-gradient(rgba(17,17,19,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(17,17,19,0.045)_1px,transparent_1px)] [background-size:24px_24px]",
            )}>
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Before it appears
              </div>
              <div className="mt-4 space-y-3 text-sm text-foreground/80">
                <div className="rounded-[18px] border border-border/70 bg-background px-3 py-3">
                  1. 启动当前 agent
                </div>
                <div className="rounded-[18px] border border-border/70 bg-background px-3 py-3">
                  2. 等待第一轮公开快照生成
                </div>
                <div className="rounded-[18px] border border-border/70 bg-background px-3 py-3">
                  3. 在这里查看当前对外状态
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Workboard
          snapshot={props.snapshot}
          loading={props.loading}
          selectedActivityId={selectedActivityId}
          onSelectActivity={setSelectedActivityId}
          onRefresh={props.onRefresh}
        />
      )}
    </section>
  )
}
