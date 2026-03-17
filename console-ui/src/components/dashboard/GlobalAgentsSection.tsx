/**
 * Global 作用域的 agent 管理页。
 *
 * 关键点（中文）
 * - 单列表结构：每个 agent 一行，所有关键信息与操作都在行内完成。
 * - 不需要“选中某个 agent”概念，避免额外状态切换成本。
 */

import * as React from "react"
import { BotIcon, Loader2Icon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  const [startingAgentId, setStartingAgentId] = React.useState("")
  const [restartingAgentId, setRestartingAgentId] = React.useState("")
  const [stoppingAgentId, setStoppingAgentId] = React.useState("")
  const [confirmAction, setConfirmAction] = React.useState<{
    agent: UiAgentOption
    action: "restart" | "stop"
  } | null>(null)

  return (
    <section className="min-h-0 overflow-y-auto">
      {agents.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted-foreground">暂无 agent</div>
      ) : (
        <div className="px-3 py-2">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 text-left font-medium">Agent</th>
                <th className="w-[200px] py-2 text-left font-medium">Model</th>
                <th className="w-[88px] py-2 text-left font-medium">PID</th>
                <th className="w-[88px] py-2 text-left font-medium">Port</th>
                <th className="w-[104px] py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const isRunning = agent.running === true
                const primaryModelId = String(agent.primaryModelId || "")
                const isStarting = startingAgentId === agent.id
                const isRestarting = restartingAgentId === agent.id
                const isStopping = stoppingAgentId === agent.id
                return (
                  <tr
                    key={agent.id}
                    className={`border-b border-border/40 align-middle ${isRunning ? "text-foreground" : "text-muted-foreground opacity-55"}`}
                  >
                    <td className="py-2 pr-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <BotIcon className={`mt-0.5 size-5 shrink-0 ${isRunning ? "text-emerald-600" : ""}`} />
                        <div className="min-w-0">
                          <span className="truncate text-[15px] font-semibold">{agent.name || "unknown-agent"}</span>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{agent.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex h-5 max-w-full items-center rounded-full border border-border px-2 font-mono text-[11px]">
                        {primaryModelId || "-"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{isRunning ? String(agent.daemonPid || "-") : "-"}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{isRunning ? String(agent.port || "-") : "-"}</td>
                    <td className="py-2 text-right">
                      {isRunning ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 rounded-md p-0"
                            onClick={() => setConfirmAction({ agent, action: "restart" })}
                            disabled={isRestarting || isStopping}
                            aria-label="重启"
                            title="重启"
                          >
                            {isRestarting ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 rounded-md p-0"
                            onClick={() => setConfirmAction({ agent, action: "stop" })}
                            disabled={isRestarting || isStopping}
                            aria-label="停止"
                            title="停止"
                          >
                            {isStopping ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 rounded-md p-0"
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open && !restartingAgentId && !stoppingAgentId) {
            setConfirmAction(null)
          }
        }}
      >
        <DialogContent className="w-[min(92vw,460px)]">
          <DialogHeader>
            <DialogTitle>{confirmAction?.action === "stop" ? "停止 Agent" : "重启 Agent"}</DialogTitle>
            <DialogDescription>
              {confirmAction?.action === "stop"
                ? `确认停止 "${confirmAction?.agent.name || "unknown-agent"}"？停止前会检查当前是否有正在执行的 context 和 task。`
                : `确认重启 "${confirmAction?.agent.name || "unknown-agent"}"？重启前会检查当前是否有正在执行的 context 和 task。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={Boolean(restartingAgentId || stoppingAgentId)}
              onClick={() => setConfirmAction(null)}
            >
              取消
            </Button>
            <Button
              variant="outline"
              disabled={Boolean(restartingAgentId || stoppingAgentId)}
              onClick={async () => {
                const target = confirmAction
                if (!target) return
                try {
                  if (target.action === "restart") {
                    setRestartingAgentId(target.agent.id)
                    await Promise.resolve(onRestartAgent(target.agent.id))
                  } else {
                    setStoppingAgentId(target.agent.id)
                    await Promise.resolve(onStopAgent(target.agent.id))
                  }
                } finally {
                  setRestartingAgentId("")
                  setStoppingAgentId("")
                  setConfirmAction(null)
                }
              }}
            >
              {restartingAgentId
                ? "重启中..."
                : stoppingAgentId
                  ? "停止中..."
                  : confirmAction?.action === "stop"
                    ? "确认停止"
                    : "确认重启"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
