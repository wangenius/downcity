/**
 * Global 作用域的 agent 管理页。
 *
 * 关键点（中文）
 * - 使用“Roster + Workbench”结构替代大表格，降低操作路径复杂度。
 * - 每次聚焦一个 agent 做模型切换/启动/进入该 agent 操作。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UiAgentOption, UiModelSummary } from "@/types/Dashboard"

export interface GlobalAgentsSectionProps {
  /**
   * 当前可用 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 全局模型池快照。
   */
  model: UiModelSummary | null
  /**
   * 切换 agent 回调。
   */
  onSelectAgent: (agentId: string) => void
  /**
   * 切换指定 agent 绑定模型回调。
   */
  onSwitchModel: (agentId: string, primaryModelId: string) => void
  /**
   * 刷新回调。
   */
  onRefresh: () => void
  /**
   * 启动历史 agent。
   */
  onStartAgent: (agentId: string) => void
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const { agents, model, onSelectAgent, onSwitchModel, onRefresh, onStartAgent } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const [focusAgentId, setFocusAgentId] = React.useState("")
  const [targetModelByAgent, setTargetModelByAgent] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    setFocusAgentId((prev) => {
      if (prev && agents.some((item) => item.id === prev)) return prev
      return String(agents[0]?.id || "")
    })
  }, [agents])

  React.useEffect(() => {
    const nextMap: Record<string, string> = {}
    for (const agent of agents) {
      const agentId = String(agent.id || "").trim()
      if (!agentId) continue
      const currentModelId = String(agent.primaryModelId || "").trim()
      if (currentModelId) nextMap[agentId] = currentModelId
    }
    setTargetModelByAgent((prev) => ({ ...nextMap, ...prev }))
  }, [agents])

  const focusAgent = agents.find((item) => item.id === focusAgentId) || null

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/55 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Agent Control Room</CardTitle>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/65 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
              暂无可管理 agent
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <aside className="space-y-2 rounded-2xl border border-border/60 bg-background/65 p-2">
                {agents.map((agent) => {
                  const isFocus = focusAgentId === agent.id
                  const isRunning = agent.running !== false
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setFocusAgentId(agent.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        isFocus
                          ? "border-primary/35 bg-primary/8"
                          : "border-border/60 bg-background/70 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{agent.name || "unknown-agent"}</span>
                        <span
                          className={
                            isRunning
                              ? "rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700"
                              : "rounded-full border border-border/65 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                          }
                        >
                          {isRunning ? "running" : "stopped"}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{agent.id}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {isRunning ? `${agent.host || "127.0.0.1"}:${agent.port || "-"}` : "历史记录（未运行）"}
                      </div>
                    </button>
                  )
                })}
              </aside>

              <div className="space-y-4">
                {focusAgent ? (
                  <>
                    <Card>
                      <CardHeader className="border-b border-border/55 pb-3">
                        <CardTitle>{focusAgent.name || "unknown-agent"}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <article className="rounded-xl border border-border/60 bg-background/65 p-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Runtime</div>
                            <div className="mt-1 text-sm">
                              {focusAgent.running !== false
                                ? `${focusAgent.host || "127.0.0.1"}:${focusAgent.port || "-"}`
                                : "stopped"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {focusAgent.running !== false
                                ? `pid ${focusAgent.daemonPid || "-"}`
                                : `stopped at ${String(focusAgent.stoppedAt || focusAgent.updatedAt || "-")}`}
                            </div>
                          </article>

                          <article className="rounded-xl border border-border/60 bg-background/65 p-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Model Binding</div>
                            <div className="mt-1 truncate text-sm">{focusAgent.primaryModelId || "-"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">model.primary</div>
                          </article>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-background/65 p-3">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            Apply Model
                          </div>
                          {availableModels.length === 0 ? (
                            <p className="text-sm text-muted-foreground">模型池为空，无法切换。</p>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                value={targetModelByAgent[focusAgent.id] || undefined}
                                onValueChange={(value) => {
                                  setTargetModelByAgent((prev) => ({
                                    ...prev,
                                    [focusAgent.id]: String(value || ""),
                                  }))
                                }}
                              >
                                <SelectTrigger className="h-8 min-w-[280px]">
                                  <SelectValue placeholder="选择模型" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableModels.map((item) => {
                                    const modelId = String(item.id || "").trim()
                                    if (!modelId) return null
                                    return (
                                      <SelectItem key={modelId} value={modelId}>
                                        {`${modelId} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  focusAgent.running === false ||
                                  !targetModelByAgent[focusAgent.id] ||
                                  targetModelByAgent[focusAgent.id] === String(focusAgent.primaryModelId || "")
                                }
                                onClick={() => onSwitchModel(focusAgent.id, targetModelByAgent[focusAgent.id] || "")}
                              >
                                应用模型
                              </Button>
                              {focusAgent.running === false ? (
                                <Button size="sm" variant="outline" onClick={() => onStartAgent(focusAgent.id)}>
                                  启动 Agent
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={focusAgent.running === false}
                                onClick={() => onSelectAgent(focusAgent.id)}
                              >
                                打开该 Agent
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="border-b border-border/55 pb-3">
                        <CardTitle>Chat Identity</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-3">
                        {focusAgent.running === false ? (
                          <p className="text-sm text-muted-foreground">离线 agent 不显示实时 chat identity。</p>
                        ) : Array.isArray(focusAgent.chatProfiles) && focusAgent.chatProfiles.length > 0 ? (
                          <div className="grid gap-2 md:grid-cols-2">
                            {focusAgent.chatProfiles.map((profile, index) => (
                              <article
                                key={`${focusAgent.id}-${profile.channel || "chat"}-${index}`}
                                className="rounded-xl border border-border/60 bg-background/65 p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-foreground">{profile.channel || "chat"}</div>
                                  <div className="text-[11px] text-muted-foreground">{profile.linkState || "-"}</div>
                                </div>
                                <p className="mt-1 truncate text-xs text-foreground">{profile.identity || "-"}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">{profile.statusText || "-"}</p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">当前没有已启动 channel。</p>
                        )}
                      </CardContent>
                    </Card>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
