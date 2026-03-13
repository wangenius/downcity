/**
 * Context 列表总览区。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const groups = buildContextGroups(filteredContexts).filter((group) =>
    filter === "all" ? true : group.key === filter,
  )

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
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Context Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-background/65 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel Mapping</div>
            <Button size="sm" variant="outline" className="ml-auto h-7 px-2" onClick={onRefreshChannels}>
              刷新
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {chatChannels.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无 channel 状态</div>
            ) : (
              chatChannels.map((channel) => {
                const name = String(channel.channel || "unknown")
                const linkState = String(channel.linkState || "unknown")
                const mappedCount = channelContextStats.get(name) || 0
                const tone =
                  linkState === "connected"
                    ? "border-emerald-300 text-emerald-700"
                    : linkState === "disconnected" || linkState === "error"
                      ? "border-destructive/40 text-destructive"
                      : "border-amber-300 text-amber-700"
                const actionDisabled = !(channel.enabled === true && channel.configured === true)
                return (
                  <div key={name} className="rounded-lg border border-border/70 bg-card/90 p-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-medium">{name}</span>
                      <Badge variant="outline" className={tone}>
                        {linkState}
                      </Badge>
                      <span className="ml-auto text-[11px] text-muted-foreground">{`contexts ${mappedCount}`}</span>
                    </div>
                    <div className="flex gap-1.5">
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
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索 contextId / role / message"
          />
          <Tabs value={filter} onValueChange={(value) => setFilter(value as "all" | ContextGroupKey)}>
            <TabsList>
              <TabsTrigger value="all">all</TabsTrigger>
              <TabsTrigger value="chat">chat</TabsTrigger>
              <TabsTrigger value="api">api</TabsTrigger>
              <TabsTrigger value="other">other</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            当前筛选条件下无 context
          </div>
        ) : (
          groups.map((group) => (
            <details key={group.key} className="rounded-xl border border-border/70 bg-background/55" open>
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {`${group.title} (${group.items.length})`}
              </summary>
              <div className="space-y-2 border-t border-dashed border-border/60 p-2.5">
                {group.items.map((item) => (
                  <button
                    key={item.contextId}
                    type="button"
                    onClick={() => onOpenContext(item.contextId)}
                    className={`w-full rounded-xl border px-3 py-2 text-left ${
                      item.contextId === selectedContextId
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/70 bg-background/75 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-xs text-foreground">{item.contextId}</span>
                      <span className="ml-auto rounded-md border border-border/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {`msg ${item.messageCount || 0}`}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {`${item.lastRole || "unknown"} · ${item.lastText || "(empty)"}`}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{`updated ${formatTime(item.updatedAt)}`}</div>
                  </button>
                ))}
              </div>
            </details>
          ))
        )}
      </CardContent>
    </Card>
  )
}
