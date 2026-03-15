/**
 * Global 作用域总览区。
 */

import { Card, CardContent } from "@/components/ui/card"
import type {
  UiAgentOption,
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
   * extension 列表。
   */
  extensions: UiExtensionRuntimeItem[]
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[]
}

export function GlobalOverviewSection(props: GlobalOverviewSectionProps) {
  const { topbarStatus, topbarError, agents, extensions, configStatus } = props
  const extensionErrors = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length
  const consoleItems = configStatus.filter((item) => item.scope === "console")
  // 关键说明（中文）：
  // global overview 只看 console 必需配置，避免把可选文件缺失误判为异常。
  const requiredConsoleKeys = new Set(["ship_db", "console_pid", "agents_registry"])
  const requiredConsoleItems = consoleItems.filter((item) => requiredConsoleKeys.has(item.key))
  const nonOkRequiredConfigItems = requiredConsoleItems.filter((item) => item.status !== "ok")
  const warningCount = extensionErrors + nonOkRequiredConfigItems.length
  const nonOkRequiredConfigSummary = nonOkRequiredConfigItems
    .map((item) => `${item.label}(${item.reason || item.status})`)
    .join(", ")

  const riskSignals: Array<{ title: string; detail: string; tone: "good" | "warn" }> = [
    {
      title: topbarError ? "Console 连接异常" : "Console 网关正常",
      detail: topbarStatus,
      tone: topbarError ? "warn" : "good",
    },
    {
      title: extensionErrors > 0 ? "Extension 存在 error 状态" : "Extension 运行稳定",
      detail: `error ${extensionErrors} / total ${extensions.length}`,
      tone: extensionErrors > 0 ? "warn" : "good",
    },
    {
      title: nonOkRequiredConfigItems.length > 0 ? "Console 必需配置存在异常项" : "Console 必需配置完整",
      detail:
        nonOkRequiredConfigItems.length > 0
          ? `non-ok ${nonOkRequiredConfigItems.length} / required ${requiredConsoleItems.length} · ${nonOkRequiredConfigSummary}`
          : `non-ok 0 / required ${requiredConsoleItems.length}`,
      tone: nonOkRequiredConfigItems.length > 0 ? "warn" : "good",
    },
  ]

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Console" value={topbarError ? "error" : "running"} sub={topbarStatus} />
        <MetricCard label="Agents" value={String(agents.length)} sub="registered runtimes" />
        <MetricCard label="Extensions" value={String(extensions.length)} sub={`error ${extensionErrors}`} />
        <MetricCard
          label="Console Config"
          value={`${requiredConsoleItems.length - nonOkRequiredConfigItems.length}/${requiredConsoleItems.length}`}
          sub="required ok / required total"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="Console Configs" value={String(consoleItems.length)} sub="all console scope files" />
        <MetricCard label="Risk Signals" value={String(warningCount)} sub="extension + required config" />
      </div>

      <Card className="border-border/70 bg-card/90 shadow-sm">
        <CardContent className="space-y-3 p-4">
          <div className="text-sm font-semibold">Global Signals</div>
          <div className="grid gap-2">
            {riskSignals.map((signal) => (
              <div
                key={signal.title}
                className={
                  signal.tone === "warn"
                    ? "rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2"
                    : "rounded-lg border border-border bg-muted/35 px-3 py-2"
                }
              >
                <div className={signal.tone === "warn" ? "text-sm font-medium text-destructive" : "text-sm font-medium text-foreground"}>
                  {signal.title}
                </div>
                <div className={signal.tone === "warn" ? "text-xs text-destructive/80" : "text-xs text-muted-foreground"}>
                  {signal.detail}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
