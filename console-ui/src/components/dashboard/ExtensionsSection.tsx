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

  return (
    <section className="min-h-0 space-y-3 overflow-y-auto px-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
            active {summary.active}
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            inactive {summary.inactive}
          </span>
          {summary.error > 0 ? (
            <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
              error {summary.error}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索 extension"
            className="h-8 w-[220px]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">没有匹配的 extension。</div>
      ) : (
        <div>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 text-left font-medium">Extension</th>
                <th className="w-[100px] py-2 text-left font-medium">State</th>
                <th className="w-[220px] py-2 text-left font-medium">Updated</th>
                <th className="w-[360px] py-2 text-left font-medium">Info</th>
                <th className="w-[144px] py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const name = String(item.name || "unknown")
                const state = String(item.state || "unknown").toLowerCase()
                const supportsLifecycle = item.supportsLifecycle === true
                const lifecycle = item.config?.lifecycle || {}
                const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
                const isRunning = state === "running"
                const isIdle = state === "idle"
                const isError = state === "error"
                const loadingStart = actionLoadingKey === `${name}:start`
                const loadingStop = actionLoadingKey === `${name}:stop`
                const loadingRestart = actionLoadingKey === `${name}:restart`
                const loadingTest = actionLoadingKey === `${name}:test`

                return (
                  <tr
                    key={name}
                    className={`align-middle ${
                      isError
                        ? "text-foreground"
                        : isRunning || isIdle
                          ? "text-foreground"
                          : "text-muted-foreground opacity-60"
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold">{name}</div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {String(item.description || "").trim() || "-"}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] ${
                          isError
                            ? "bg-destructive/10 text-destructive"
                            : isRunning || isIdle
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {state}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      <div>{formatTime(item.updatedAt)}</div>
                      <div className="truncate">
                        {item.lastCommand ? `${item.lastCommand} @ ${formatTime(item.lastCommandAt)}` : "-"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-1">
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          lifecycle s:{lifecycle.start ? "on" : "off"} t:{lifecycle.stop ? "on" : "off"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          actions {actionItems.length}
                        </span>
                        {item.lastError ? (
                          <span className="inline-flex max-w-full items-center truncate rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                            {String(item.lastError)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {actionItems.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground">-</span>
                        ) : (
                          actionItems.map((action) => {
                            const actionName = String(action?.name || "unknown")
                            const modeLabel = [
                              action?.supportsCommand ? "cmd" : "",
                              action?.supportsApi ? "api" : "",
                            ].filter(Boolean).join("+") || "none"
                            return (
                              <span
                                key={`${name}:${actionName}`}
                                className="inline-flex h-5 items-center rounded-full bg-muted px-2 font-mono text-[11px] text-foreground/85"
                                title={`${actionName} · ${modeLabel}${
                                  action?.apiMethod && action?.apiPath ? ` · ${action.apiMethod} ${action.apiPath}` : ""
                                }`}
                              >
                                {`${actionName}·${modeLabel}`}
                              </span>
                            )
                          })
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      {supportsLifecycle ? (
                        <div className="flex items-center justify-end gap-1">
                          {isError ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                              aria-label="restart"
                              title="restart"
                              onClick={() => setConfirmAction({ name, action: "restart" })}
                            >
                              {loadingRestart ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                            </Button>
                          ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
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
                              {isRunning || state === "idle" ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                                    aria-label="restart"
                                    title="restart"
                                    onClick={() => setConfirmAction({ name, action: "restart" })}
                                  >
                                    {loadingRestart ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-8 w-8 p-0"
                                    disabled={loadingStart || loadingStop || loadingRestart || loadingTest}
                                    aria-label="stop"
                                    title="stop"
                                    onClick={() => setConfirmAction({ name, action: "stop" })}
                                  >
                                    {loadingStop ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
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
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
    </section>
  )
}
