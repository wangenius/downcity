/**
 * Context 列表总览区。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { UiChatChannelStatus, UiContextSummary } from "@/types/Dashboard"
import {
  buildContextGroups,
  filterContextsByKeyword,
  resolveContextGroup,
  type ContextGroupKey,
} from "@/lib/context-groups"

export interface ContextOverviewSectionProps {
  /**
   * context 摘要列表。
   */
  contexts: UiContextSummary[]
  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * 当前选中的 context id。
   */
  selectedContextId: string
  /**
   * 时间格式化函数。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 打开 context workspace。
   */
  onOpenContext: (contextId: string) => void
  /**
   * 刷新渠道状态。
   */
  onRefreshChannels: () => void
  /**
   * 渠道动作。
   */
  onChatAction: (action: "test" | "reconnect", channel: string) => void
}

export function ContextOverviewSection(props: ContextOverviewSectionProps) {
  const {
    contexts,
    chatChannels,
    selectedContextId,
    formatTime,
    onOpenContext,
    onRefreshChannels,
    onChatAction,
  } = props
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | ContextGroupKey>("all")
  const filteredContexts = filterContextsByKeyword(contexts, search)
  const grouped = buildContextGroups(filteredContexts)
  const visibleContexts = grouped
    .filter((group) => (filter === "all" ? true : group.key === filter))
    .flatMap((group) => group.items)

  const channelContextStats = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of contexts) {
      const group = resolveContextGroup(item.contextId)
      if (group !== "chat") continue
      const raw = String(item.contextId || "")
      const channel = raw.startsWith("telegram-")
        ? "telegram"
        : raw.startsWith("qq-")
          ? "qq"
          : raw.startsWith("feishu-")
            ? "feishu"
            : "unknown"
      counts.set(channel, (counts.get(channel) || 0) + 1)
    }
    return counts
  }, [contexts])

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Context Overview</CardTitle>
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={onRefreshChannels}>
            刷新 Channels
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border/70">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Mapped Contexts</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {chatChannels.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={4}>
                      暂无 channel 状态
                    </td>
                  </tr>
                ) : (
                  chatChannels.map((channel) => {
                    const name = String(channel.channel || "unknown")
                    const linkState = String(channel.linkState || "unknown")
                    const mappedCount = channelContextStats.get(name) || 0
                    const tone =
                      linkState === "connected"
                        ? "border-border bg-muted/45 text-foreground"
                        : linkState === "disconnected" || linkState === "error"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border bg-muted/35 text-muted-foreground"
                    const actionDisabled = !(channel.enabled === true && channel.configured === true)
                    return (
                      <tr key={name} className="border-t border-border/70">
                        <td className="px-3 py-2 text-sm font-medium">{name}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={tone}>
                            {linkState}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{mappedCount}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={actionDisabled}
                              onClick={() => onChatAction("test", name)}
                            >
                              test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={actionDisabled}
                              onClick={() => onChatAction("reconnect", name)}
                            >
                              reconnect
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Contexts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 contextId / role / message"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "local_ui", "chat", "api", "other"] as const).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  className="h-8 px-2 text-xs"
                  onClick={() => setFilter(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Context</th>
                  <th className="px-3 py-2 font-medium">Group</th>
                  <th className="px-3 py-2 font-medium">Messages</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Preview</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleContexts.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={6}>
                      当前筛选条件下无 context
                    </td>
                  </tr>
                ) : (
                  visibleContexts.map((item) => {
                    const group = resolveContextGroup(item.contextId)
                    const isSelected = item.contextId === selectedContextId
                    return (
                      <tr key={item.contextId} className={`border-t border-border/70 ${isSelected ? "bg-primary/5" : ""}`}>
                        <td className="max-w-[22rem] truncate px-3 py-2 font-mono text-xs" title={item.contextId}>
                          {item.contextId}
                        </td>
                        <td className="px-3 py-2 text-xs uppercase text-muted-foreground">{group}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{item.messageCount || 0}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{formatTime(item.updatedAt)}</td>
                        <td className="max-w-[18rem] truncate px-3 py-2 text-xs text-muted-foreground" title={item.lastText || ""}>
                          {`${item.lastRole || "unknown"} · ${item.lastText || "(empty)"}`}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant={isSelected ? "secondary" : "outline"} onClick={() => onOpenContext(item.contextId)}>
                            {isSelected ? "已打开" : "打开"}
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
