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
import { DashboardModule } from "./DashboardModule"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import type {
  UiConfigStatusItem,
  UiPluginRuntimeItem,
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
   * plugin 列表。
   */
  plugins: UiPluginRuntimeItem[]
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
    plugins,
    configStatus,
    onRefresh,
  } = props
  const [mode, setMode] = React.useState<ConfigViewMode>("required")

  const availablePlugins = plugins.filter((item) => String(item.state || "").toLowerCase() === "available").length
  const unavailablePlugins = plugins.filter((item) => String(item.state || "").toLowerCase() === "unavailable").length
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
        <DashboardModule
          title="Runtime Board"
          description="Console、prompt 与 plugin 的即时运行状态。"
          actions={
            <Button size="sm" variant="outline" onClick={onRefresh}>
              refresh
            </Button>
          }
        >
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
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Plugins</div>
                <div className="mt-2">
                  <Badge variant="outline" className={unavailablePlugins > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/12 text-emerald-700"}>
                    {`${availablePlugins}/${plugins.length} available`}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{`unavailable ${unavailablePlugins} · total ${plugins.length}`}</p>
              </article>
            </div>
        </DashboardModule>

        <DashboardModule
          title="Health Snapshot"
          description="优先关注 required 配置项与缺失情况。"
        >
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
        </DashboardModule>
      </div>

      <DashboardModule
        title="Config Workbench"
        description="按 required / optional 维度筛选 console 配置状态。"
        actions={
          <>
            <span className="text-xs text-muted-foreground">{`${filteredItems.length} items`}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size="sm" variant="outline" className="px-2.5 text-[11px]" />}
              >
                {mode === "required"
                  ? `required (${requiredItems.length})`
                  : mode === "optional"
                    ? `optional (${optionalItems.length})`
                    : `all (${consoleConfigItems.length})`}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem onClick={() => setMode("required")}>{`required (${requiredItems.length})`}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode("optional")}>{`optional (${optionalItems.length})`}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode("all")}>{`all (${consoleConfigItems.length})`}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        >
          {filteredItems.length === 0 ? (
            <div className="rounded-[18px] bg-secondary px-4 py-5 text-sm text-muted-foreground">
              当前筛选下没有配置项。
            </div>
          ) : (
            <div className="space-y-2 rounded-[20px] bg-secondary/85 p-2">
              {filteredItems.map((item) => (
                <article
                  key={`${item.scope}:${item.key}:${item.path}`}
                  className="rounded-[16px] bg-background/80 px-3 py-3 transition-colors hover:bg-background"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                          {requiredConsoleKeys.has(item.key) ? "required" : "optional"}
                        </span>
                        <span
                          className={
                            item.status === "ok"
                              ? "rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-700"
                              : "rounded-full bg-destructive/10 px-2 py-0.5 text-destructive"
                          }
                        >
                          {item.status}
                        </span>
                        <span className="text-muted-foreground">
                          {item.mtime ? new Date(item.mtime).toLocaleString("zh-CN", { hour12: false }) : "-"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{item.reason || "-"}</div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Path</div>
                      <div className="max-w-[30rem] truncate font-mono text-[11px] text-muted-foreground" title={item.path}>
                        {item.path}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
      </DashboardModule>
    </section>
  )
}
