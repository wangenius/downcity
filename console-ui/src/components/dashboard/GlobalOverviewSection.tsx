/**
 * Global 作用域总览区（合并版）。
 *
 * 关键点（中文）
 * - 将原 overview 与 runtime 语义合并为单页，避免重复信息并列。
 * - 首屏只保留关键状态与唯一指标来源，配置明细集中在单一工单台。
 */

import * as React from "react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { GlobalAgentsSection } from "@/components/dashboard/GlobalAgentsSection"
import type {
  UiAgentDirectoryInspection,
  UiAgentOption,
  UiConfigStatusItem,
  UiPluginRuntimeItem,
  UiModelPoolItem,
} from "@/types/Dashboard"

export interface GlobalOverviewSectionProps {
  /**
   * 当前 DC CLI 版本号。
   */
  cityVersion: string
  /**
   * 运行中 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前可用模型池。
   */
  modelPoolItems: UiModelPoolItem[]
  /**
   * plugin 列表。
   */
  plugins: UiPluginRuntimeItem[]
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[]
  /**
   * 打开系统目录选择器。
   */
  onPickAgentDirectory: () => Promise<string>
  /**
   * 探测目录是否已初始化。
   */
  onInspectAgentDirectory: (projectRoot: string) => Promise<UiAgentDirectoryInspection | null>
  /**
   * 启动 agent。
   */
  onStartAgent: (agentId: string) => void
  /**
   * 初始化并启动 agent。
   */
  onStartAgentWithInitialization: (agentId: string, input: {
    agentName?: string
    executionMode: "model" | "acp"
    modelId?: string
    agentType?: string
  }) => void
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
    cityVersion,
    agents,
    modelPoolItems,
    plugins,
    configStatus,
    onPickAgentDirectory,
    onInspectAgentDirectory,
    onStartAgent,
    onStartAgentWithInitialization,
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

  const unavailablePlugins = plugins.filter((item) => String(item.state || "").toLowerCase() === "unavailable").length
  const requiredOkCount = requiredConsoleItems.length - nonOkRequired.length
  const configHealthy = nonOkRequired.length === 0
  const configSummaryState = configHealthy
    ? optionalMissingCount > 0
      ? "warning"
      : "ok"
    : "error"

  const issueSignals = [
    ...consoleItems
      .filter((item) => item.status !== "ok")
      .map((item) => ({
        key: `config:${item.key}`,
        source: requiredConsoleKeys.has(item.key) ? "required config" : "optional config",
        name: item.label,
        state: item.status,
        detail: item.reason || item.path,
      })),
    ...plugins
      .filter((item) => String(item.state || "").toLowerCase() === "unavailable")
      .map((item) => ({
        key: `plugin:${String(item.name || "unknown")}`,
        source: "plugin",
        name: String(item.name || "unknown"),
        state: String(item.state || "unavailable"),
        detail: String(item.lastError || "").trim() || "-",
      })),
  ]
  const dedupedSignals = Array.from(new Map(issueSignals.map((item) => [item.key, item])).values())
  const totalSignals = dedupedSignals.length

  return (
    <section className="space-y-5">
      <DashboardModule
        title="Global Summary"
        description="当前全局运行态与异常信号概览。"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`dc ${String(cityVersion || "-")}`}
          </span>
          <span
            className={
              configSummaryState === "ok"
                ? "inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-1 text-emerald-700"
                : configSummaryState === "warning"
                  ? "inline-flex items-center rounded-full bg-secondary px-2 py-1 text-foreground"
                  : "inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-destructive"
            }
          >
            {`config ${requiredOkCount}/${requiredConsoleItems.length}`}
          </span>
          {optionalMissingCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
              {`optional missing ${optionalMissingCount}`}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`plugin unavailable ${unavailablePlugins}`}
          </span>
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1">
            {`signals ${totalSignals}`}
          </span>
        </div>
      </DashboardModule>

      <DashboardModule
        title="Agent Runtime"
        description={`共 ${agents.length} 个 agent，可直接在此启动、重启或停止。`}
      >
        <GlobalAgentsSection
          agents={agents}
          modelPoolItems={modelPoolItems}
          onPickAgentDirectory={onPickAgentDirectory}
          onInspectAgentDirectory={onInspectAgentDirectory}
          onStartAgent={onStartAgent}
          onStartAgentWithInitialization={onStartAgentWithInitialization}
          onRestartAgent={onRestartAgent}
          onStopAgent={onStopAgent}
        />
      </DashboardModule>

      <DashboardModule
        title="Signals"
        description={dedupedSignals.length === 0 ? "当前没有异常信号。" : `共 ${dedupedSignals.length} 条异常信号。`}
        className="shadow-[0_1px_0_rgba(17,17,19,0.02)]"
      >
        {dedupedSignals.length === 0 ? (
          <div className="py-2 text-sm text-muted-foreground">没有异常信号</div>
        ) : (
          <div className="space-y-1">
            {dedupedSignals.map((signal) => (
              <div
                key={signal.key}
                className="rounded-[16px] bg-destructive/8 px-3 py-2.5"
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
      </DashboardModule>
    </section>
  )
}
