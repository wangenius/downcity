/**
 * Agent Chat Channels 管理页。
 *
 * 关键点（中文）
 * - 仅展示当前 agent 的 chat channel 状态，不混入 context 列表逻辑。
 * - 支持最常用运维动作：刷新状态、连通性测试、重连。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { UiAgentOption, UiChatChannelStatus } from "@/types/Dashboard"

/**
 * Agent Chat Channels 管理页属性。
 */
export interface AgentChannelsSectionProps {
  /**
   * 当前选中的 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * chat 渠道状态列表。
   */
  channels: UiChatChannelStatus[]
  /**
   * 是否处于加载态。
   */
  loading: boolean
  /**
   * 刷新渠道状态回调。
   */
  onRefresh: () => void
  /**
   * 渠道动作回调。
   */
  onChannelAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => void
}

function renderBooleanBadge(value: boolean | undefined, trueLabel: string, falseLabel: string) {
  if (value === true) {
    return (
      <Badge variant="outline" className="border-border bg-muted/45 text-foreground">
        {trueLabel}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-border bg-muted/35 text-muted-foreground">
      {falseLabel}
    </Badge>
  )
}

export function AgentChannelsSection(props: AgentChannelsSectionProps) {
  const { selectedAgent, channels, loading, onRefresh, onChannelAction } = props

  if (!selectedAgent) {
    return (
      <Card className="border-dashed border-border bg-card/60">
        <CardContent className="p-5 text-sm text-muted-foreground">未选择可用 agent</CardContent>
      </Card>
    )
  }

  const profiles = Array.isArray(selectedAgent.chatProfiles) ? selectedAgent.chatProfiles : []
  const identityMap = new Map(
    profiles.map((item) => [String(item.channel || "").trim(), String(item.identity || "").trim()] as const),
  )

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{`Agent Channels · ${selectedAgent.name || "-"}`}</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border/70">
          <Table>
            <TableHeader className="bg-muted/35">
              <TableRow className="hover:bg-muted/35">
                <TableHead>Channel</TableHead>
                <TableHead>Identity</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Configured</TableHead>
                <TableHead>Running</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-sm text-muted-foreground">
                    当前没有可管理 channel 数据
                  </TableCell>
                </TableRow>
              ) : (
                channels.map((item) => {
                  const channel = String(item.channel || "").trim() || "unknown"
                  const identity = identityMap.get(channel) || "-"
                  const linkState = String(item.linkState || "").trim() || "-"
                  const statusText = String(item.statusText || "").trim() || "-"
                  const runtimeActionDisabled = !(item.enabled === true && item.configured === true)
                  const openDisabled = item.enabled === true
                  const closeDisabled = item.enabled !== true
                  return (
                    <TableRow key={channel}>
                      <TableCell className="font-medium">{channel}</TableCell>
                      <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground" title={identity}>
                        {identity}
                      </TableCell>
                      <TableCell>{renderBooleanBadge(item.enabled, "yes", "no")}</TableCell>
                      <TableCell>{renderBooleanBadge(item.configured, "yes", "no")}</TableCell>
                      <TableCell>{renderBooleanBadge(item.running, "yes", "no")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border bg-muted/35 text-muted-foreground">
                          {linkState}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{statusText}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={openDisabled}
                            onClick={() => onChannelAction("open", channel)}
                          >
                            open
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={closeDisabled}
                            onClick={() => onChannelAction("close", channel)}
                          >
                            close
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runtimeActionDisabled}
                            onClick={() => onChannelAction("test", channel)}
                          >
                            test
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runtimeActionDisabled}
                            onClick={() => onChannelAction("reconnect", channel)}
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
  )
}
