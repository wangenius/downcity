/**
 * Plugin 状态区。
 *
 * 关键点（中文）
 * - plugin 不再暴露 lifecycle 状态机，只展示启用/可用/依赖与 action。
 * - UI 只提供无需额外参数的快捷 action，避免把复杂安装流塞进 dashboard。
 */

import * as React from "react"
import { CheckIcon, Loader2Icon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "./dashboard-action-button"
import { DashboardModule } from "./DashboardModule"
import { Button } from "../ui/button"
import { useConfirmDialog } from "../ui/confirm-dialog"
import { Input } from "../ui/input"
import type { UiPluginActionItem, UiPluginRuntimeItem } from "../../types/Dashboard"

export interface PluginsSectionProps {
  /**
   * plugin 列表。
   */
  plugins: UiPluginRuntimeItem[]
  /**
   * 时间格式化（保留签名，供上层兼容）。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 状态映射（保留签名，供上层兼容）。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 运行无需额外参数的 plugin action。
   */
  onRunAction: (pluginName: string, actionName: string) => void
}

function hasAction(actionItems: UiPluginActionItem[], actionName: string): boolean {
  return actionItems.some((item) => String(item.name || "").trim() === actionName)
}

export function PluginsSection(props: PluginsSectionProps) {
  const { plugins, onRunAction } = props
  const confirm = useConfirmDialog()
  const [search, setSearch] = React.useState("")
  const [actionLoadingKey, setActionLoadingKey] = React.useState("")

  const filtered = plugins.filter((item) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return String(item.name || "").toLowerCase().includes(query)
  })

  const summary = React.useMemo(() => {
    let available = 0
    let disabled = 0
    let unavailable = 0
    for (const item of filtered) {
      const state = String(item.state || "").toLowerCase()
      if (state === "available") {
        available += 1
        continue
      }
      if (state === "disabled") {
        disabled += 1
        continue
      }
      unavailable += 1
    }
    return { available, disabled, unavailable }
  }, [filtered])

  const resolveStateTone = React.useCallback((stateInput?: string) => {
    const state = String(stateInput || "").toLowerCase()
    if (state === "available") {
      return {
        badge: "bg-emerald-500/10 text-emerald-700",
        dot: "bg-emerald-600",
        row: "text-foreground",
      }
    }
    if (state === "disabled") {
      return {
        badge: "bg-secondary text-muted-foreground",
        dot: "bg-muted-foreground/55",
        row: "text-muted-foreground opacity-80",
      }
    }
    return {
      badge: "bg-destructive/10 text-destructive",
      dot: "bg-destructive",
      row: "text-foreground",
    }
  }, [])

  return (
    <DashboardModule
      title="Plugins"
      description={`available ${summary.available} · disabled ${summary.disabled}${summary.unavailable > 0 ? ` · unavailable ${summary.unavailable}` : ""}`}
      bodyClassName="min-h-0 overflow-y-auto"
      actions={
        <>
          <div className="hidden flex-wrap items-center gap-2 text-xs md:flex">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
              available {summary.available}
            </span>
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              disabled {summary.disabled}
            </span>
            {summary.unavailable > 0 ? (
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                unavailable {summary.unavailable}
              </span>
            ) : null}
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索 plugin"
            className="w-[220px]"
          />
        </>
      }
    >
      {filtered.length === 0 ? (
        <div className="rounded-[18px] bg-secondary px-4 py-6 text-sm text-muted-foreground">没有匹配的 plugin。</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const name = String(item.name || "unknown")
            const state = String(item.state || "unknown").toLowerCase()
            const availability = item.availability || {}
            const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
            const pipelineItems = Array.isArray(item.pipelines) ? item.pipelines : []
            const guardItems = Array.isArray(item.guards) ? item.guards : []
            const effectItems = Array.isArray(item.effects) ? item.effects : []
            const resolveItems = Array.isArray(item.resolves) ? item.resolves : []
            const pluginPointCount =
              pipelineItems.length + guardItems.length + effectItems.length + resolveItems.length
            const requiredAssets = Array.isArray(item.requiredAssets) ? item.requiredAssets : []
            const lastError = String(item.lastError || "").trim()
            const tone = resolveStateTone(state)
            const loadingStatus = actionLoadingKey === `${name}:status`
            const loadingDoctor = actionLoadingKey === `${name}:doctor`
            const loadingOn = actionLoadingKey === `${name}:on`
            const loadingOff = actionLoadingKey === `${name}:off`
            const canRunStatus = hasAction(actionItems, "status")
            const canRunDoctor = hasAction(actionItems, "doctor")
            const canRunOn = hasAction(actionItems, "on")
            const canRunOff = hasAction(actionItems, "off")

            return (
              <article
                key={name}
                className={`rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary ${tone.row}`}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 size-2.5 shrink-0 rounded-full ${tone.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-[15px] font-semibold text-foreground">{name}</div>
                          <span className={`inline-flex h-6 items-center rounded-full px-2 font-mono text-[11px] ${tone.badge}`}>
                            {state}
                          </span>
                          {item.hasSystem ? (
                            <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85">
                              system
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {`enabled ${availability.enabled === true ? "yes" : "no"} · available ${availability.available === true ? "yes" : "no"}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pl-[1.375rem] text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {`points ${pluginPointCount}`}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {`assets ${requiredAssets.length}`}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {`actions ${actionItems.length}`}
                      </span>
                      {lastError ? (
                        <span className="inline-flex max-w-full items-center truncate rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                          {lastError}
                        </span>
                      ) : null}
                    </div>

                    {pipelineItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {pipelineItems.map((pointName) => (
                          <span
                            key={`${name}:pipeline:${pointName}`}
                            className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                          >
                            {`pipeline · ${pointName}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {guardItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {guardItems.map((pointName) => (
                          <span
                            key={`${name}:guard:${pointName}`}
                            className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                          >
                            {`guard · ${pointName}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {effectItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {effectItems.map((pointName) => (
                          <span
                            key={`${name}:effect:${pointName}`}
                            className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                          >
                            {`effect · ${pointName}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {resolveItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {resolveItems.map((pointName) => (
                          <span
                            key={`${name}:resolve:${pointName}`}
                            className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                          >
                            {`resolve · ${pointName}`}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {requiredAssets.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {requiredAssets.map((assetName) => (
                          <span
                            key={`${name}:asset:${assetName}`}
                            className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                          >
                            {assetName}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {actionItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {actionItems.map((action) => {
                          const actionName = String(action?.name || "unknown")
                          const modeLabel = [
                            action?.supportsCommand ? "cmd" : "",
                            action?.supportsApi ? "api" : "",
                          ].filter(Boolean).join("+") || "none"
                          return (
                            <span
                              key={`${name}:action:${actionName}`}
                              className="inline-flex h-6 items-center rounded-full bg-secondary px-2 font-mono text-[11px] text-foreground/85"
                              title={`${actionName} · ${modeLabel}${
                                action?.apiMethod && action?.apiPath ? ` · ${action.apiMethod} ${action.apiPath}` : ""
                              }`}
                            >
                              {`${actionName}·${modeLabel}`}
                            </span>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 xl:pl-4">
                    {canRunStatus ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={dashboardIconButtonClass}
                        disabled={loadingStatus || loadingDoctor || loadingOn || loadingOff}
                        aria-label="status"
                        title="status"
                        onClick={async () => {
                          try {
                            setActionLoadingKey(`${name}:status`)
                            await Promise.resolve(onRunAction(name, "status"))
                          } finally {
                            setActionLoadingKey("")
                          }
                        }}
                      >
                        {loadingStatus ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
                      </Button>
                    ) : null}

                    {canRunDoctor ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={dashboardIconButtonClass}
                        disabled={loadingStatus || loadingDoctor || loadingOn || loadingOff}
                        aria-label="doctor"
                        title="doctor"
                        onClick={async () => {
                          try {
                            setActionLoadingKey(`${name}:doctor`)
                            await Promise.resolve(onRunAction(name, "doctor"))
                          } finally {
                            setActionLoadingKey("")
                          }
                        }}
                      >
                        {loadingDoctor ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                      </Button>
                    ) : null}

                    {canRunOn ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={dashboardIconButtonClass}
                        disabled={loadingStatus || loadingDoctor || loadingOn || loadingOff}
                        aria-label="on"
                        title="on"
                        onClick={async () => {
                          try {
                            setActionLoadingKey(`${name}:on`)
                            await Promise.resolve(onRunAction(name, "on"))
                          } finally {
                            setActionLoadingKey("")
                          }
                        }}
                      >
                        {loadingOn ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                      </Button>
                    ) : null}

                    {canRunOff ? (
                      <Button
                        size="icon"
                        variant="ghost"
                        className={dashboardDangerIconButtonClass}
                        disabled={loadingStatus || loadingDoctor || loadingOn || loadingOff}
                        aria-label="off"
                        title="off"
                        onClick={() => {
                          void (async () => {
                            const confirmed = await confirm({
                              title: "关闭 Plugin",
                              description: `确认关闭 "${name}"？`,
                              confirmText: "关闭",
                              confirmVariant: "destructive",
                            })
                            if (!confirmed) return
                            try {
                              setActionLoadingKey(`${name}:off`)
                              await Promise.resolve(onRunAction(name, "off"))
                            } finally {
                              setActionLoadingKey("")
                            }
                          })()
                        }}
                      >
                        {loadingOff ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                      </Button>
                    ) : null}

                    {!canRunStatus && !canRunDoctor && !canRunOn && !canRunOff ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </DashboardModule>
  )
}
