/**
 * 渠道与上下文联合视图。
 */

import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import type {
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiContextSummary,
  UiContextTimelineMessage,
} from "../../types/Dashboard"

export interface CommsContextSectionProps {
  /**
   * chat 渠道状态。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * context 摘要。
   */
  contexts: UiContextSummary[]
  /**
   * 当前渠道。
   */
  selectedChannel: string
  /**
   * 当前 context。
   */
  selectedContextId: string
  /**
   * channel history。
   */
  channelHistory: UiChatHistoryEvent[]
  /**
   * context message 历史。
   */
  contextMessages: UiContextTimelineMessage[]
  /**
   * 状态颜色映射。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 切换渠道。
   */
  onChannelChange: (channel: string) => void
  /**
   * 切换 context。
   */
  onContextChange: (contextId: string) => void
  /**
   * 刷新渠道状态。
   */
  onRefreshChannels: () => void
  /**
   * chat 动作。
   */
  onChatAction: (action: "test" | "reconnect", channel: string) => void
}

export function CommsContextSection(props: CommsContextSectionProps) {
  const {
    chatChannels,
    contexts,
    selectedChannel,
    selectedContextId,
    channelHistory,
    contextMessages,
    statusBadgeVariant,
    formatTime,
    onChannelChange,
    onContextChange,
    onRefreshChannels,
    onChatAction,
  } = props

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status)
    if (tone === "ok") return "border-emerald-300 text-emerald-700"
    if (tone === "bad") return "border-destructive/40 text-destructive"
    return "border-amber-300 text-amber-700"
  }

  const selectedContext = contexts.find((item) => item.contextId === selectedContextId)

  return (
    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Channels & Routing</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onChatAction("reconnect", "")}>全部重连</Button>
            <Button size="sm" variant="outline" onClick={onRefreshChannels}>刷新</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Channel</div>
              <Select
                value={selectedChannel || undefined}
                onValueChange={(value) => {
                  if (value !== null) onChannelChange(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择渠道" />
                </SelectTrigger>
                <SelectContent>
                  {chatChannels.map((item) => {
                    const channel = String(item.channel || "")
                    if (!channel) return null
                    return (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Context</div>
              <Select
                value={selectedContextId || undefined}
                onValueChange={(value) => {
                  if (value !== null) onContextChange(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择 context" />
                </SelectTrigger>
                <SelectContent>
                  {contexts.map((item) => (
                    <SelectItem key={item.contextId} value={item.contextId}>
                      {item.contextId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-border/70 bg-background/75">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chatChannels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      暂无 chat 渠道状态
                    </TableCell>
                  </TableRow>
                ) : (
                  chatChannels.map((item) => {
                    const channel = String(item.channel || "unknown")
                    const linkState = String(item.linkState || "unknown")
                    const statusText = String(item.statusText || "unknown")
                    const actionDisabled = !(item.enabled === true && item.configured === true)
                    const runtimeLabel =
                      item.enabled === true
                        ? item.configured === true
                          ? item.running === true
                            ? statusText
                            : "stopped"
                          : "config_missing"
                        : "disabled"
                    return (
                      <TableRow key={channel}>
                        <TableCell className="font-medium">{channel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badgeClass(linkState)}>
                            {linkState}
                          </Badge>
                        </TableCell>
                        <TableCell>{runtimeLabel}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={actionDisabled} onClick={() => onChatAction("test", channel)}>
                              test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionDisabled}
                              onClick={() => onChatAction("reconnect", channel)}
                            >
                              reconnect
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>History Viewer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {`context: ${selectedContextId || "-"} · messages ${selectedContext?.messageCount || 0}`}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel History</div>
              <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
                {channelHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无 channel history</div>
                ) : (
                  channelHistory.map((event, index) => {
                    const direction = String(event.direction || "unknown")
                    const text = String(event.text || "").trim() || "(empty)"
                    return (
                      <article key={`${event.id || index}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                        <div className="mb-1 text-[11px] text-muted-foreground">
                          {`${String(event.channel || "-")} · ${direction} · ${formatTime(event.ts)}`}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">{text}</div>
                      </article>
                    )
                  })
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context Messages</div>
              <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
                {contextMessages.length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无 context message history</div>
                ) : (
                  contextMessages.map((msg, index) => {
                    const role = String(msg.role || "unknown")
                    const text = String(msg.text || "").trim() || "(empty)"
                    return (
                      <article key={`${msg.id || index}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                        <div className="mb-1 text-[11px] text-muted-foreground">{`${role} · ${formatTime(msg.ts)}`}</div>
                        <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">{text}</div>
                      </article>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
