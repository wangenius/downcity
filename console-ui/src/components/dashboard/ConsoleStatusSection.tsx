/**
 * Console 级状态总览。
 *
 * 关键点（中文）
 * - 采用“运行面板 + 配置工单台”的双区结构，减少信息跳转。
 * - 配置表支持 required/optional/all 视图切换，便于快速排障。
 */

import * as React from "react"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import type {
  UiConfigStatusItem,
  UiExtensionRuntimeItem,
} from "../../types/Dashboard"

type ConfigViewMode = "required" | "optional" | "all"

export interface ConsoleStatusSectionProps {
  /**
   * 顶栏状态文本。
   */
  topbarStatus: string
  /**
   * 顶栏是否错误。
   */
  topbarError: boolean
  /**
   * system prompt 是否可用。
   */
  hasPrompt: boolean
  /**
   * extension 列表。
   */
  extensions: UiExtensionRuntimeItem[]
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[]
  /**
   * 刷新操作。
   */
  onRefresh: () => void
}

function StatusBadge(props: { ok: boolean; okText: string; failText: string }) {
  if (props.ok) {
    return (
      <span className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-xs text-emerald-700">
        {props.okText}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
      {props.failText}
    </span>
  )
}

export function ConsoleStatusSection(props: ConsoleStatusSectionProps) {
  const {
    topbarStatus,
    topbarError,
    hasPrompt,
    extensions,
    configStatus,
    onRefresh,
  } = props
  const [mode, setMode] = React.useState<ConfigViewMode>("required")

  const runningExtensions = extensions.filter((item) => String(item.state || "").toLowerCase() === "running").length
  const errorExtensions = extensions.filter((item) => String(item.state || "").toLowerCase() === "error").length
  const consoleConfigItems = configStatus.filter((item) => item.scope === "console")
  const requiredConsoleKeys = new Set(["ship_db", "console_pid", "agents_registry"])
  const requiredItems = consoleConfigItems.filter((item) => requiredConsoleKeys.has(item.key))
  const optionalItems = consoleConfigItems.filter((item) => !requiredConsoleKeys.has(item.key))
  const nonOkRequiredCount = requiredItems.filter((item) => item.status !== "ok").length
  const filteredItems =
    mode === "required" ? requiredItems : mode === "optional" ? optionalItems : consoleConfigItems

  return (
    <section className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Runtime Board</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onRefresh}>
                refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <article className="rounded-[18px] bg-secondary p-3.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Console Link</div>
                <div className="mt-2">
                  <StatusBadge ok={!topbarError} okText="running" failText="error" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{topbarStatus || "-"}</p>
              </article>

              <article className="rounded-[18px] bg-secondary p-3.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Prompt Runtime</div>
                <div className="mt-2">
                  <StatusBadge ok={hasPrompt} okText="ready" failText="unknown" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {hasPrompt ? "system prompt resolved" : "waiting runtime context"}
                </p>
              </article>

              <article className="rounded-[18px] bg-secondary p-3.5 md:col-span-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Extensions</div>
                <div className="mt-2">
                  <Badge variant="outline" className={errorExtensions > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/12 text-emerald-700"}>
                    {`${runningExtensions}/${extensions.length} running`}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{`error ${errorExtensions} · total ${extensions.length}`}</p>
              </article>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Health Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <article className="rounded-[18px] bg-secondary p-3.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Required</div>
                <div className="mt-1 text-xl font-semibold">{requiredItems.length}</div>
              </article>
              <article className="rounded-[18px] bg-secondary p-3.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Required Non-OK</div>
                <div className={nonOkRequiredCount > 0 ? "mt-1 text-xl font-semibold text-destructive" : "mt-1 text-xl font-semibold"}>
                  {nonOkRequiredCount}
                </div>
              </article>
              <article className="rounded-[18px] bg-secondary p-3.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Optional Missing</div>
                <div className="mt-1 text-xl font-semibold">{optionalItems.filter((item) => item.status === "missing").length}</div>
              </article>
            </div>
            <p className="text-xs text-muted-foreground">
              配置异常优先处理顺序：`required + missing/error` → `optional + error` → 其他。
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Config Workbench</CardTitle>
            <div className="flex items-center gap-1.5">
              {([
                ["required", `required (${requiredItems.length})`],
                ["optional", `optional (${optionalItems.length})`],
                ["all", `all (${consoleConfigItems.length})`],
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
        <CardContent className="pt-4">
          {filteredItems.length === 0 ? (
            <div className="rounded-[18px] bg-secondary px-4 py-5 text-sm text-muted-foreground">
              当前筛选下没有配置项。
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] bg-secondary p-1.5">
              <table className="w-full border-separate border-spacing-y-1.5">
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
                  {filteredItems.map((item) => (
                    <tr key={`${item.scope}:${item.key}:${item.path}`} className="bg-card">
                      <td className="rounded-l-[16px] px-3 py-3 text-sm font-medium">{item.label}</td>
                      <td className="px-3 py-3 text-xs">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                          {requiredConsoleKeys.has(item.key) ? "required" : "optional"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={
                            item.status === "ok"
                              ? "rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-700"
                              : "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{item.reason || "-"}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {item.mtime ? new Date(item.mtime).toLocaleString("zh-CN", { hour12: false }) : "-"}
                      </td>
                      <td className="max-w-[30rem] truncate rounded-r-[16px] px-3 py-3 font-mono text-[11px] text-muted-foreground" title={item.path}>
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
    </section>
  )
}
