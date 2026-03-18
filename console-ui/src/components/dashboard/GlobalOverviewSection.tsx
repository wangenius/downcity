/**
 * Global 作用域总览区（合并版）。
 *
 * 关键点（中文）
 * - 将原 overview 与 runtime 语义合并为单页，避免重复信息并列。
 * - 首屏只保留关键状态与唯一指标来源，配置明细集中在单一工单台。
 */

import * as React from "react"
import { GlobalAgentsSection } from "@/components/dashboard/GlobalAgentsSection"
import type {
  UiAgentOption,
  UiConfigStatusItem,
  UiExtensionRuntimeItem,
} from "@/types/Dashboard"

export interface GlobalOverviewSectionProps {
  /**
   * 当前 SMA CLI 版本号。
   */
  smaVersion: string
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
    smaVersion,
    agents,
    extensions,
    configStatus,
    onStartAgent,
    onRestartAgent,
    onStopAgent,
  } = props

  const requiredConsoleKeys = new Set(["ship_db", "console_pid", "agents_registry"])
  const consoleItems = configStatus.filter((item) => item.scope === "console")
  const requiredConsoleItems = consoleItems.filter((item) => requiredConsoleKeys.has(item.key))
  const optionalMissingCount = consoleItems.filter(
    (item) => !requiredConsoleKeys.has(item.key) && item.status === "missing",
  ).length
  const nonOkRequired = requiredConsoleItems.filter((item) => item.status !== "ok")

  const errorExtensions = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length
  const warningCount = nonOkRequired.length + errorExtensions + optionalMissingCount
  const requiredOkCount = requiredConsoleItems.length - nonOkRequired.length
  const configHealthy = nonOkRequired.length === 0

  const issueSignals = [
    ...nonOkRequired.map((item) => ({
      key: `config:${item.key}`,
      source: "config",
      name: item.label,
      state: item.status,
      detail: item.reason || item.path,
    })),
    ...extensions
      .filter((item) => String(item.state || "").toLowerCase() === "error")
      .map((item) => ({
        key: `ext:${String(item.name || "unknown")}`,
        source: "extension",
        name: String(item.name || "unknown"),
        state: String(item.state || "error"),
        detail: String(item.lastError || item.description || "").trim() || "-",
      })),
  ]

  return (
    <section className="space-y-5">
      <div
        className={
          configHealthy
            ? "rounded-md bg-emerald-500/12 px-3 py-2.5 text-emerald-800 dark:text-emerald-300"
            : "rounded-md bg-muted px-3 py-2.5 text-muted-foreground"
        }
      >
        <div className="text-sm font-semibold">{configHealthy ? "配置正常" : "配置待完善"}</div>
        <div className="mt-0.5 text-xs opacity-90">
          {`required ${requiredOkCount}/${requiredConsoleItems.length}`}
          {optionalMissingCount > 0 ? ` · optional missing ${optionalMissingCount}` : ""}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {`SMA version: ${String(smaVersion || "-")}`}
        </div>
      </div>

      <GlobalAgentsSection
        agents={agents}
        onStartAgent={onStartAgent}
        onRestartAgent={onRestartAgent}
        onStopAgent={onStopAgent}
      />

      <section className="min-h-0 overflow-y-auto">
        {consoleItems.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground">暂无 console 配置项</div>
        ) : (
          <div className="px-3 py-2">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="py-2 text-left font-medium">Config</th>
                  <th className="w-[120px] py-2 text-left font-medium">Level</th>
                  <th className="w-[96px] py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Path</th>
                </tr>
              </thead>
              <tbody>
                {consoleItems.map((item) => {
                  const isRequired = requiredConsoleKeys.has(item.key)
                  const isOk = item.status === "ok"
                  return (
                    <tr key={`${item.scope}:${item.key}:${item.path}`} className="border-b border-border/40 align-middle">
                      <td className="py-2 pr-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold text-foreground">{item.label}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{item.key}</div>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{isRequired ? "required" : "optional"}</td>
                      <td className="py-2 pr-3 text-xs">
                        <span className={isOk ? "text-emerald-700" : "text-muted-foreground"}>{item.status}</span>
                      </td>
                      <td className="py-2 font-mono text-[11px] text-muted-foreground" title={item.path}>
                        <span className="block truncate">{item.path}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Health Signals
        </div>
        {issueSignals.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">没有异常信号</div>
        ) : (
          <div className="space-y-1">
            {issueSignals.map((signal) => (
              <div
                key={signal.key}
                className="rounded-md bg-destructive/8 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-2 text-sm">
                  <span className="font-medium text-foreground">{signal.name}</span>
                  <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{signal.source}</span>
                  <span className="text-xs text-destructive">{signal.state}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground" title={signal.detail}>
                  {signal.detail}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
