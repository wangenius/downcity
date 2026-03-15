/**
 * Console 级状态总览。
 */

import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import type { UiAgentOption, UiExtensionRuntimeItem } from "../../types/Dashboard"

export interface ConsoleStatusSectionProps {
  /**
   * 当前选中 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * 顶栏状态文本。
   */
  topbarStatus: string
  /**
   * 顶栏是否错误。
   */
  topbarError: boolean
  /**
   * system prompt 是否可用。
   */
  hasPrompt: boolean
  /**
   * extension 列表。
   */
  extensions: UiExtensionRuntimeItem[]
  /**
   * 刷新操作。
   */
  onRefresh: () => void
}

export function ConsoleStatusSection(props: ConsoleStatusSectionProps) {
  const { selectedAgent, topbarStatus, topbarError, hasPrompt, extensions, onRefresh } = props

  const runningExtensions = extensions.filter((item) => String(item.state || "") === "running").length
  const errorExtensions = extensions.filter((item) => String(item.state || "") === "error").length

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Console Status</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/70 bg-background/75 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Console</div>
            <Badge variant="outline" className={topbarError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/45 text-foreground"}>
              {topbarError ? "error" : "running"}
            </Badge>
            <div className="mt-2 text-xs text-muted-foreground">{topbarStatus}</div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/75 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Agent</div>
            <Badge variant="outline" className={selectedAgent ? "border-border bg-muted/45 text-foreground" : "border-border bg-muted/35 text-muted-foreground"}>
              {selectedAgent ? "selected" : "none"}
            </Badge>
            <div className="mt-2 text-xs text-muted-foreground">
              {selectedAgent ? `${selectedAgent.name} (${selectedAgent.host || "127.0.0.1"}:${selectedAgent.port || "-"})` : "未选择 agent"}
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/75 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Model</div>
            <Badge variant="outline" className={hasPrompt ? "border-border bg-muted/45 text-foreground" : "border-border bg-muted/35 text-muted-foreground"}>
              {hasPrompt ? "ready" : "unknown"}
            </Badge>
            <div className="mt-2 text-xs text-muted-foreground">{hasPrompt ? "system prompt resolved" : "waiting runtime context"}</div>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/75 p-3">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Extensions</div>
            <Badge variant="outline" className={errorExtensions > 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/45 text-foreground"}>
              {`${runningExtensions}/${extensions.length} running`}
            </Badge>
            <div className="mt-2 text-xs text-muted-foreground">{`error ${errorExtensions} · total ${extensions.length}`}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
