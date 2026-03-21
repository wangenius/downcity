/**
 * Global 作用域的 agent 管理页。
 *
 * 关键点（中文）
 * - 单列表结构：每个 agent 一行，所有关键信息与操作都在行内完成。
 * - 不需要“选中某个 agent”概念，避免额外状态切换成本。
 * - 仅 stop 这类高风险动作保留确认，restart 直接执行。
 */

import * as React from "react"
import { BotIcon, Loader2Icon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import type { UiAgentOption } from "@/types/Dashboard"

export interface GlobalAgentsSectionProps {
  /**
   * 当前可用 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 重启运行中的 agent。
   */
  onRestartAgent: (agentId: string) => void
  /**
   * 停止运行中的 agent。
   */
  onStopAgent: (agentId: string) => void
  /**
   * 启动历史 agent。
   */
  onStartAgent: (agentId: string) => void
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const { agents, onRestartAgent, onStopAgent, onStartAgent } = props
  const confirm = useConfirmDialog()
  const [startingAgentId, setStartingAgentId] = React.useState("")
  const [restartingAgentId, setRestartingAgentId] = React.useState("")
  const [stoppingAgentId, setStoppingAgentId] = React.useState("")

  return (
    <section className="min-h-0 overflow-y-auto">
      {agents.length === 0 ? (
        <div className="rounded-[20px] bg-secondary px-4 py-5 text-sm text-muted-foreground">暂无 agent</div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => {
            const isRunning = agent.running === true
            const primaryModelId = String(agent.primaryModelId || "")
            const isStarting = startingAgentId === agent.id
            const isRestarting = restartingAgentId === agent.id
            const isStopping = stoppingAgentId === agent.id
            return (
              <article
                key={agent.id}
                className={
                  isRunning
                    ? "rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary"
                    : "rounded-[20px] bg-transparent px-4 py-3 text-muted-foreground opacity-58 transition-all hover:bg-secondary hover:opacity-78"
                }
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={isRunning ? "mt-0.5 rounded-full bg-emerald-500/12 p-2 text-emerald-700" : "mt-0.5 rounded-full bg-secondary/80 p-2 text-muted-foreground"}>
                      <BotIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className={isRunning ? "truncate text-[15px] font-semibold text-foreground" : "truncate text-[15px] font-semibold text-foreground/72"}>
                        {agent.name || "unknown-agent"}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{agent.id}</div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
                    <span className={isRunning ? "inline-flex h-7 max-w-full items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-foreground/86" : "inline-flex h-7 max-w-full items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-foreground/62"}>
                      {primaryModelId || "-"}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`pid ${isRunning ? String(agent.daemonPid || "-") : "-"}`}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`port ${isRunning ? String(agent.port || "-") : "-"}`}
                    </span>
                    {isRunning ? (
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="bg-secondary"
                          onClick={async () => {
                            try {
                              setRestartingAgentId(agent.id)
                              await Promise.resolve(onRestartAgent(agent.id))
                            } finally {
                              setRestartingAgentId("")
                            }
                          }}
                          disabled={isRestarting || isStopping}
                          aria-label="重启"
                          title="重启"
                        >
                          {isRestarting ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="destructive"
                          onClick={() => {
                            void (async () => {
                              const confirmed = await confirm({
                                title: "停止 Agent",
                                description: `确认停止 "${agent.name || "unknown-agent"}"？停止前会检查当前是否有正在执行的 context 和 task。`,
                                confirmText: "停止",
                                confirmVariant: "destructive",
                              })
                              if (!confirmed) return
                              try {
                                setStoppingAgentId(agent.id)
                                await Promise.resolve(onStopAgent(agent.id))
                              } finally {
                                setStoppingAgentId("")
                              }
                            })()
                          }}
                          disabled={isRestarting || isStopping}
                          aria-label="停止"
                          title="停止"
                        >
                          {isStopping ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon-sm"
                        variant="secondary"
                        className="ml-auto bg-secondary"
                        disabled={isStarting || isRestarting || isStopping}
                        aria-label="启动"
                        title="启动"
                        onClick={async () => {
                          try {
                            setStartingAgentId(agent.id)
                            await Promise.resolve(onStartAgent(agent.id))
                          } finally {
                            setStartingAgentId("")
                          }
                        }}
                      >
                        {isStarting ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
