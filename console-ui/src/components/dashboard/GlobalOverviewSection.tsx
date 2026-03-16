/**
 * Global 作用域总览区（合并版）。
 *
 * 关键点（中文）
 * - 将原 overview 与 runtime 语义合并为单页，避免重复信息并列。
 * - 首屏只保留关键状态与唯一指标来源，配置明细集中在单一工单台。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlobalAgentsSection } from "@/components/dashboard/GlobalAgentsSection"
import type {
  UiAgentOption,
  UiConfigStatusItem,
  UiExtensionRuntimeItem,
} from "@/types/Dashboard"

type ConfigViewMode = "required" | "optional" | "all"

interface MetricTileProps {
  /**
   * 指标标题。
   */
  label: string
  /**
   * 指标值。
   */
  value: string
  /**
   * 指标说明。
   */
  hint: string
}

function MetricTile(props: MetricTileProps) {
  return (
    <article className="rounded-xl border border-border/65 bg-background/70 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{props.value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
    </article>
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
   * system prompt 是否可用。
   */
  hasPrompt: boolean
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
  /**
   * 刷新回调。
   */
  onRefresh: () => void
  /**
   * 启动 agent。
   */
  onStartAgent: (agentId: string) => void
  /**
   * 重启 agent。
   */
  onRestartAgent: (agentId: string) => void
  /**
   * 停止 agent。
   */
  onStopAgent: (agentId: string) => void
}

export function GlobalOverviewSection(props: GlobalOverviewSectionProps) {
  const {
    topbarStatus,
    topbarError,
    hasPrompt,
    agents,
    extensions,
    configStatus,
    onRefresh,
    onStartAgent,
    onRestartAgent,
    onStopAgent,
  } = props
  const [mode, setMode] = React.useState<ConfigViewMode>("required")

  const requiredConsoleKeys = new Set(["ship_db", "console_pid", "agents_registry"])
  const consoleItems = configStatus.filter((item) => item.scope === "console")
  const requiredConsoleItems = consoleItems.filter((item) => requiredConsoleKeys.has(item.key))
  const optionalConsoleItems = consoleItems.filter((item) => !requiredConsoleKeys.has(item.key))
  const nonOkRequired = requiredConsoleItems.filter((item) => item.status !== "ok")

  const runningAgentCount = agents.filter((item) => item.running !== false).length
  const stoppedAgentCount = Math.max(0, agents.length - runningAgentCount)
  const runningExtensions = extensions.filter((item) => String(item.state || "").toLowerCase() === "running").length
  const errorExtensions = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length
  const warningCount = nonOkRequired.length + errorExtensions

  const filteredConfigItems =
    mode === "required"
      ? requiredConsoleItems
      : mode === "optional"
        ? optionalConsoleItems
        : consoleItems

  return (
    <section className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/55 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Console Command Deck</CardTitle>
            <Button size="sm" variant="outline" onClick={onRefresh}>
              refresh
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={
                topbarError
                  ? "rounded-full border border-destructive/35 bg-destructive/10 px-2.5 py-1 text-destructive"
                  : "rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-emerald-700"
              }
            >
              {topbarError ? "console error" : "console healthy"}
            </span>
            <span
              className={
                hasPrompt
                  ? "rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-emerald-700"
                  : "rounded-full border border-border/60 bg-muted/45 px-2.5 py-1 text-muted-foreground"
              }
            >
              {hasPrompt ? "prompt ready" : "prompt unknown"}
            </span>
            <span className="rounded-full border border-border/60 bg-muted/45 px-2.5 py-1 text-muted-foreground">
              {`warnings ${warningCount}`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          <p className="text-sm text-muted-foreground">{topbarStatus || "Console runtime status unavailable."}</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricTile label="Agents Running" value={String(runningAgentCount)} hint={`stopped ${stoppedAgentCount}`} />
        <MetricTile label="Extensions Running" value={String(runningExtensions)} hint={`error ${errorExtensions}`} />
        <MetricTile
          label="Required Config"
          value={`${requiredConsoleItems.length - nonOkRequired.length}/${requiredConsoleItems.length}`}
          hint="required ok / required total"
        />
        <MetricTile label="Console Files" value={String(consoleItems.length)} hint="all console scope files" />
        <MetricTile
          label="Optional Missing"
          value={String(optionalConsoleItems.filter((item) => item.status === "missing").length)}
          hint="non-blocking files"
        />
        <MetricTile label="Signals" value={String(warningCount)} hint="config + extension" />
      </div>

      <Card>
        <CardHeader className="border-b border-border/55 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Config Workbench</CardTitle>
            <div className="flex items-center gap-1.5">
              {([
                ["required", `required (${requiredConsoleItems.length})`],
                ["optional", `optional (${optionalConsoleItems.length})`],
                ["all", `all (${consoleItems.length})`],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={mode === key ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setMode(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {filteredConfigItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/65 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              当前筛选下没有配置项。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigItems.map((item) => (
                    <tr key={`${item.scope}:${item.key}:${item.path}`} className="border-t border-border/60">
                      <td className="px-3 py-2 text-sm font-medium">{item.label}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-muted-foreground">
                          {requiredConsoleKeys.has(item.key) ? "required" : "optional"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            item.status === "ok"
                              ? "rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-emerald-700"
                              : "rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-destructive"
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{item.reason || "-"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {item.mtime ? new Date(item.mtime).toLocaleString("zh-CN", { hour12: false }) : "-"}
                      </td>
                      <td className="max-w-[30rem] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground" title={item.path}>
                        {item.path}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <GlobalAgentsSection
        agents={agents}
        onRefresh={onRefresh}
        onStartAgent={onStartAgent}
        onRestartAgent={onRestartAgent}
        onStopAgent={onStopAgent}
      />
    </section>
  )
}
