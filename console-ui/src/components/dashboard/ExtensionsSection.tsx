/**
 * Extension 状态区。
 *
 * 关键点（中文）
 * - 采用与 Agents 区一致的极简 table 结构。
 * - 不使用卡片分组，通过行样式表达状态差异。
 * - lifecycle 统一使用 icon action，并在 stop/restart 前确认。
 */

import * as React from "react"
import { CheckIcon, Loader2Icon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react"
import { DashboardModule } from "./DashboardModule"
import { Button } from "../ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog"
import { Input } from "../ui/input"
import type { UiExtensionRuntimeItem } from "../../types/Dashboard"

export interface ExtensionsSectionProps {
  /**
   * extension 列表。
   */
  extensions: UiExtensionRuntimeItem[]
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 状态映射（保留签名，供上层兼容）。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 执行 lifecycle。
   */
  onControl: (extensionName: string, action: "start" | "stop" | "restart") => void
  /**
   * 测试 extension 可用性。
   */
  onTest: (extensionName: string) => void
}

export function ExtensionsSection(props: ExtensionsSectionProps) {
  const { extensions, formatTime, onControl, onTest } = props
  const [search, setSearch] = React.useState("")
  const [actionLoadingKey, setActionLoadingKey] = React.useState("")
  const [confirmAction, setConfirmAction] = React.useState<{
    name: string
    action: "stop" | "restart"
  } | null>(null)

  const filtered = extensions.filter((item) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return String(item.name || "").toLowerCase().includes(query)
  })

  const summary = React.useMemo(() => {
    let active = 0
    let inactive = 0
    let error = 0
    for (const item of filtered) {
      const state = String(item.state || "").toLowerCase()
      if (state === "error") {
        error += 1
        continue
      }
      if (state === "running" || state === "idle") {
        active += 1
        continue
      }
      inactive += 1
    }
    return { active, inactive, error }
  }, [filtered])

  const resolveStateTone = React.useCallback((stateInput?: string) => {
    const state = String(stateInput || "").toLowerCase()
    if (state === "error") {
      return {
        badge: "bg-destructive/10 text-destructive",
        dot: "bg-destructive",
        row: "text-foreground",
      }
    }
    if (state === "running" || state === "idle") {
      return {
        badge: "bg-emerald-500/10 text-emerald-700",
        dot: "bg-emerald-600",
        row: "text-foreground",
      }
    }
    return {
      badge: "bg-secondary text-muted-foreground",
      dot: "bg-muted-foreground/55",
      row: "text-muted-foreground opacity-60",
    }
  }, [])

  return (
    <DashboardModule
      title="Extensions"
      description={`active ${summary.active} · inactive ${summary.inactive}${summary.error > 0 ? ` · error ${summary.error}` : ""}`}
      bodyClassName="min-h-0 overflow-y-auto"
      actions={
        <div className="flex items-center gap-1.5">
          <div className="hidden flex-wrap items-center gap-2 text-xs md:flex">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
              active {summary.active}
            </span>
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
              inactive {summary.inactive}
            </span>
            {summary.error > 0 ? (
              <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                error {summary.error}
              </span>
            ) : null}
          </div>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索 extension"
            className="h-8 w-[220px]"
          />
        </div>
      }
    >

      {filtered.length === 0 ? (
        <div className="rounded-[18px] bg-secondary px-4 py-6 text-sm text-muted-foreground">没有匹配的 extension。</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const name = String(item.name || "unknown")
            const state = String(item.state || "unknown").toLowerCase()
            const supportsLifecycle = item.supportsLifecycle === true
            const lifecycle = item.config?.lifecycle || {}
            const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
            const lastError = String(item.lastError || "").trim()
            const loadingStart = actionLoadingKey === `${name}:start`
            const loadingStop = actionLoadingKey === `${name}:stop`
            const loadingRestart = actionLoadingKey === `${name}:restart`
            const loadingTest = actionLoadingKey === `${name}:test`
            const tone = resolveStateTone(state)
            const capabilitySummary = `lifecycle s:${lifecycle.start ? "on" : "off"} t:${lifecycle.stop ? "on" : "off"}`

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
                        </div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {String(item.description || "").trim() || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pl-[1.375rem] text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {capabilitySummary}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {`actions ${actionItems.length}`}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5">
                        {formatTime(item.updatedAt)}
                      </span>
                      {item.lastCommand ? (
                        <span className="inline-flex max-w-full items-center truncate rounded-full bg-secondary px-2 py-0.5 font-mono">
                          {`${item.lastCommand} @ ${formatTime(item.lastCommandAt)}`}
                        </span>
                      ) : null}
                      {lastError ? (
                        <span className="inline-flex max-w-full items-center truncate rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                          {lastError}
                        </span>
                      ) : null}
                    </div>

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
                              key={`${name}:${actionName}`}
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
                    {supportsLifecycle ? (
                      <>
                        {(state === "running" || state === "idle" || state === "error") ? (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:bg-secondary hover:text-foreground"
                            disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                            aria-label="test"
                            title="test"
                            onClick={async () => {
                              try {
                                setActionLoadingKey(`${name}:test`)
                                await Promise.resolve(onTest(name))
                              } finally {
                                setActionLoadingKey("")
                              }
                            }}
                          >
                            {loadingTest ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
                          </Button>
                        ) : null}

                        {(state === "running" || state === "idle" || state === "error") ? (
                          <Button
                            size="icon-sm"
                            variant="secondary"
                            disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                            aria-label="restart"
                            title="restart"
                            onClick={() => setConfirmAction({ name, action: "restart" })}
                          >
                            {loadingRestart ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                          </Button>
                        ) : null}

                        {state === "running" || state === "idle" ? (
                          <Button
                            size="icon-sm"
                            variant="destructive"
                            disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                            aria-label="stop"
                            title="stop"
                            onClick={() => setConfirmAction({ name, action: "stop" })}
                          >
                            {loadingStop ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                          </Button>
                        ) : (
                          <Button
                            size="icon-sm"
                            variant="secondary"
                            disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                            aria-label="start"
                            title="start"
                            onClick={async () => {
                              try {
                                setActionLoadingKey(`${name}:start`)
                                await Promise.resolve(onControl(name, "start"))
                              } finally {
                                setActionLoadingKey("")
                              }
                            }}
                          >
                            {loadingStart ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingKey) {
            setConfirmAction(null)
          }
        }}
      >
        <DialogContent className="w-[min(92vw,460px)]">
          <DialogHeader>
            <DialogTitle>{confirmAction?.action === "stop" ? "停止 Extension" : "重启 Extension"}</DialogTitle>
            <DialogDescription>
              {confirmAction?.action === "stop"
                ? `确认停止 "${confirmAction?.name || "unknown"}"？`
                : `确认重启 "${confirmAction?.name || "unknown"}"？`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={Boolean(actionLoadingKey)}
              onClick={() => setConfirmAction(null)}
            >
              取消
            </Button>
            <Button
              variant={confirmAction?.action === "stop" ? "destructive" : "secondary"}
              disabled={Boolean(actionLoadingKey)}
              onClick={async () => {
                const target = confirmAction
                if (!target) return
                try {
                  setActionLoadingKey(`${target.name}:${target.action}`)
                  await Promise.resolve(onControl(target.name, target.action))
                } finally {
                  setActionLoadingKey("")
                  setConfirmAction(null)
                }
              }}
            >
              {actionLoadingKey
                ? confirmAction?.action === "stop"
                  ? "停止中..."
                  : "重启中..."
                : confirmAction?.action === "stop"
                  ? "确认停止"
                  : "确认重启"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardModule>
  )
}
