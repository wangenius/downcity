/**
 * Global 作用域总览区。
 */

import { Card, CardContent } from "@/components/ui/card"
import type {
  UiAgentOption,
  UiChatChannelStatus,
  UiConfigStatusItem,
  UiExtensionRuntimeItem,
} from "@/types/Dashboard"

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
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[]
}

export function GlobalOverviewSection(props: GlobalOverviewSectionProps) {
  const { topbarStatus, topbarError, agents, selectedAgent, chatChannels, extensions, configStatus } = props
  const onlineChannels = chatChannels.filter((item) => String(item.linkState || "").toLowerCase() === "connected").length
  const extensionErrors = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length
  const totalConfigs = configStatus.length
  const okConfigs = configStatus.filter((item) => item.status === "ok").length
  const nonOkConfigs = totalConfigs - okConfigs
  const consoleItems = configStatus.filter((item) => item.scope === "console")
  const agentItems = configStatus.filter((item) => item.scope === "agent")

  const renderStatusPill = (status: UiConfigStatusItem["status"]) => {
    if (status === "ok") {
      return <span className="inline-flex rounded-full border border-border bg-muted/45 px-2 py-0.5 text-[11px] font-medium text-foreground">ok</span>
    }
    if (status === "missing") {
      return <span className="inline-flex rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">missing</span>
    }
    return <span className="inline-flex rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">error</span>
  }

  const formatBytes = (sizeBytes: number) => {
    const n = Number(sizeBytes || 0)
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(1)} MB`
  }

  const renderRows = (items: UiConfigStatusItem[]) => {
    if (items.length === 0) {
      return (
        <tr>
          <td className="px-3 py-6 text-sm text-muted-foreground" colSpan={6}>
            当前无可展示的配置文件状态
          </td>
        </tr>
      )
    }
    return items.map((item) => (
      <tr className="border-t border-border/50" key={`${item.scope}:${item.key}:${item.path}`}>
        <td className="px-3 py-2 text-sm font-medium">{item.label}</td>
        <td className="px-3 py-2">{renderStatusPill(item.status)}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{item.reason || "-"}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{formatBytes(item.sizeBytes)}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{item.mtime ? new Date(item.mtime).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
        <td className="max-w-[28rem] truncate px-3 py-2 text-xs text-muted-foreground" title={item.path}>
          {item.path}
        </td>
      </tr>
    ))
  }

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

      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="Config Files" value={`${okConfigs}/${totalConfigs || 0}`} sub="ok / total" />
        <MetricCard
          label="Config Alerts"
          value={String(nonOkConfigs < 0 ? 0 : nonOkConfigs)}
          sub={selectedAgent ? `agent: ${selectedAgent.name}` : "仅展示 console"}
        />
      </div>

      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardContent className="space-y-4 p-0">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">Console Config</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/30 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                </tr>
              </thead>
              <tbody>{renderRows(consoleItems)}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedAgent ? (
        <Card className="border-border/70 bg-card/90 shadow-sm">
          <CardContent className="space-y-4 p-0">
            <div className="border-b border-border/60 px-4 py-3 text-sm font-semibold">
              Agent Config · {selectedAgent.name}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/30 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Path</th>
                  </tr>
                </thead>
                <tbody>{renderRows(agentItems)}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
