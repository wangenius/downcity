/**
 * Global 作用域的 agent 管理页。
 */

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UiAgentOption } from "@/types/Dashboard"

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
   * 切换 agent 回调。
   */
  onSelectAgent: (agentId: string) => void
  /**
   * 刷新回调。
   */
  onRefresh: () => void
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const { agents, selectedAgentId, onSelectAgent, onRefresh } = props

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Global Agents</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {agents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            暂无可管理 agent
          </div>
        ) : (
          agents.map((agent) => {
            const isSelected = agent.id === selectedAgentId
            return (
              <article
                key={agent.id}
                className={`rounded-xl border p-3 ${
                  isSelected ? "border-primary/40 bg-primary/10" : "border-border/70 bg-background/70"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="truncate font-medium text-foreground">{agent.name || "unknown-agent"}</div>
                  {isSelected ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                      selected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      standby
                    </Badge>
                  )}
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="truncate font-mono">{agent.id}</div>
                  <div>{`runtime ${agent.host || "127.0.0.1"}:${agent.port || "-"}`}</div>
                  <div>{`pid ${agent.daemonPid || "-"}`}</div>
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant={isSelected ? "secondary" : "outline"}
                    disabled={isSelected}
                    onClick={() => onSelectAgent(agent.id)}
                  >
                    {isSelected ? "当前 Agent" : "切换到此 Agent"}
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
