/**
 * Global 作用域总览区。
 */

import { Card, CardContent } from "@/components/ui/card"
import type { UiAgentOption, UiChatChannelStatus, UiExtensionRuntimeItem } from "@/types/Dashboard"

interface MetricCardProps {
  /**
   * 指标标题。
   */
  label: string
  /**
   * 指标主值。
   */
  value: string
  /**
   * 指标补充文案。
   */
  sub: string
}

function MetricCard(props: MetricCardProps) {
  const { label, value, sub } = props
  return (
    <Card className="border-border/70 bg-card/90 shadow-sm">
      <CardContent className="space-y-1 p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}

export interface GlobalOverviewSectionProps {
  /**
   * 顶栏状态文案。
   */
  topbarStatus: string
  /**
   * 顶栏是否错误态。
   */
  topbarError: boolean
  /**
   * 运行中 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前选中 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * channel 列表。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * extension 列表。
   */
  extensions: UiExtensionRuntimeItem[]
}

export function GlobalOverviewSection(props: GlobalOverviewSectionProps) {
  const { topbarStatus, topbarError, agents, selectedAgent, chatChannels, extensions } = props
  const onlineChannels = chatChannels.filter((item) => String(item.linkState || "").toLowerCase() === "connected").length
  const extensionErrors = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Console" value={topbarError ? "error" : "running"} sub={topbarStatus} />
        <MetricCard
          label="Agents"
          value={String(agents.length)}
          sub={selectedAgent ? `selected: ${selectedAgent.name}` : "未选中 agent"}
        />
        <MetricCard label="Channels" value={`${onlineChannels}/${chatChannels.length}`} sub="connected / total" />
        <MetricCard label="Extensions" value={String(extensions.length)} sub={`error ${extensionErrors}`} />
      </div>
    </section>
  )
}
