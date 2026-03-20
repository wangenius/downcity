/**
 * Agent Chat Channels 管理页。
 *
 * 关键点（中文）
 * - 仅展示当前 agent 的 chat channel 状态，不混入 context 列表逻辑。
 * - 支持最常用运维动作：刷新状态、连通性测试、重连。
 */

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
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
      <Badge variant="outline" className="bg-secondary text-foreground">
        {trueLabel}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-secondary text-muted-foreground">
      {falseLabel}
    </Badge>
  )
}

export function AgentChannelsSection(props: AgentChannelsSectionProps) {
  const { selectedAgent, channels, loading, onRefresh, onChannelAction } = props

  if (!selectedAgent) {
    return (
      <DashboardModule title="Agent Channels" description="当前 agent 的 channel 运行状态。">
        <div className="rounded-[20px] bg-secondary/85 px-4 py-5 text-sm text-muted-foreground">
          未选择可用 agent
        </div>
      </DashboardModule>
    )
  }

  return (
    <DashboardModule
      title="Agent Channels"
      description={`当前 agent：${selectedAgent.name || "-"}`}
      actions={
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </Button>
      }
    >
        <div className="space-y-2">
          {channels.length === 0 ? (
            <div className="rounded-[20px] bg-secondary/85 px-4 py-5 text-sm text-muted-foreground">
              当前没有可管理 channel 数据
            </div>
          ) : (
            channels.map((item) => {
              const channel = String(item.channel || "").trim() || "unknown"
              const linkState = String(item.linkState || "").trim() || "-"
              const statusText = String(item.statusText || "").trim() || "-"
              const runtimeActionDisabled = !(item.enabled === true && item.configured === true)
              const openDisabled = item.enabled === true
              const closeDisabled = item.enabled !== true
              return (
                <article key={channel} className="rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="text-sm font-semibold text-foreground">{channel}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {renderBooleanBadge(item.enabled, "enabled", "disabled")}
                        {renderBooleanBadge(item.configured, "configured", "unconfigured")}
                        {renderBooleanBadge(item.running, "running", "stopped")}
                        <Badge variant="outline" className="bg-secondary text-muted-foreground">
                          {linkState}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{statusText}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                  </div>
                </article>
              )
            })
          )}
        </div>
    </DashboardModule>
  )
}
