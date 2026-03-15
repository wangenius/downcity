/**
 * Global 作用域的 agent 管理页。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { UiAgentOption, UiModelSummary } from "@/types/Dashboard"

export interface GlobalAgentsSectionProps {
  /**
   * 当前可用 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前选中 agent id。
   */
  selectedAgentId: string
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
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const { agents, selectedAgentId, model, onSelectAgent, onSwitchModel, onRefresh } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const [targetModelByAgent, setTargetModelByAgent] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const nextMap: Record<string, string> = {}
    for (const agent of agents) {
      const agentId = String(agent.id || "").trim()
      if (!agentId) continue
      const current = String(agent.primaryModelId || "").trim()
      if (current) {
        nextMap[agentId] = current
      }
    }
    setTargetModelByAgent(nextMap)
  }, [agents])

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Global Agents</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            暂无可管理 agent
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70">
            <Table>
              <TableHeader className="bg-muted/35">
                <TableRow className="hover:bg-muted/35">
                  <TableHead>Agent</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Chat Identity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => {
                  const isSelected = agent.id === selectedAgentId
                  const profiles = Array.isArray(agent.chatProfiles) ? agent.chatProfiles : []
                  return (
                    <TableRow key={agent.id} data-state={isSelected ? "selected" : undefined}>
                      <TableCell className="whitespace-normal">
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="truncate font-medium text-foreground">{agent.name || "unknown-agent"}</div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground">{agent.id}</div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="text-xs text-foreground">
                          <div>{`${agent.host || "127.0.0.1"}:${agent.port || "-"}`}</div>
                          <div className="text-muted-foreground">{`pid ${agent.daemonPid || "-"}`}</div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[15rem] whitespace-normal">
                        {availableModels.length === 0 ? (
                          <div className="text-xs text-muted-foreground">模型池为空</div>
                        ) : (
                          <div className="space-y-2">
                            <Select
                              value={targetModelByAgent[agent.id] || undefined}
                              onValueChange={(value) => {
                                setTargetModelByAgent((prev) => ({
                                  ...prev,
                                  [agent.id]: String(value || ""),
                                }))
                              }}
                            >
                              <SelectTrigger className="h-8 w-full text-xs">
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
                            <div className="truncate text-[11px] text-muted-foreground">
                              {`current: ${agent.primaryModelId || "-"}`}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {profiles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">无已启动 channel</span>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {profiles.map((profile, index) => (
                              <div
                                key={`${agent.id}-${profile.channel || "chat"}-${index}`}
                                className="rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-xs text-foreground"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">{profile.channel || "chat"}</span>
                                  <span className="text-[11px] text-muted-foreground">{profile.linkState || "-"}</span>
                                </div>
                                <div className="mt-0.5 truncate text-foreground">{profile.identity || "-"}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">{profile.statusText || "-"}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isSelected ? (
                          <Badge variant="outline" className="border-border bg-muted/45 text-foreground">
                            selected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                            standby
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              !targetModelByAgent[agent.id] ||
                              targetModelByAgent[agent.id] === String(agent.primaryModelId || "")
                            }
                            onClick={() => onSwitchModel(agent.id, targetModelByAgent[agent.id] || "")}
                          >
                            应用模型
                          </Button>
                          <Button
                            size="sm"
                            variant={isSelected ? "secondary" : "outline"}
                            disabled={isSelected}
                            onClick={() => onSelectAgent(agent.id)}
                          >
                            {isSelected ? "当前 Agent" : "切换"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
