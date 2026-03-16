/**
 * Extension 状态区。
 *
 * 关键点（中文）
 * - 从纯表格切换为状态分组看板，优先暴露 error 与可操作节点。
 * - 保留 lifecycle 操作，强调“快速定位 -> 立即控制”流程。
 */

import * as React from "react"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
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
   * 状态映射。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 刷新操作。
   */
  onRefresh: () => void
  /**
   * 执行 lifecycle。
   */
  onControl: (extensionName: string, action: "start" | "stop" | "restart") => void
}

function groupKeyFromState(raw?: string): "error" | "running" | "idle" {
  const state = String(raw || "").toLowerCase()
  if (state === "error") return "error"
  if (state === "running") return "running"
  return "idle"
}

export function ExtensionsSection(props: ExtensionsSectionProps) {
  const { extensions, formatTime, statusBadgeVariant, onRefresh, onControl } = props
  const [search, setSearch] = React.useState("")
  const [groupFilter, setGroupFilter] = React.useState<"all" | "error" | "running" | "idle">("all")

  const filtered = extensions.filter((item) => {
    const key = String(item.name || "").toLowerCase()
    const query = search.trim().toLowerCase()
    if (!query) return true
    return key.includes(query)
  })

  const grouped = {
    error: filtered.filter((item) => groupKeyFromState(item.state) === "error"),
    running: filtered.filter((item) => groupKeyFromState(item.state) === "running"),
    idle: filtered.filter((item) => groupKeyFromState(item.state) === "idle"),
  }

  const sections: Array<{ key: "error" | "running" | "idle"; title: string; items: UiExtensionRuntimeItem[] }> = [
    { key: "error", title: "Error", items: grouped.error },
    { key: "running", title: "Running", items: grouped.running },
    { key: "idle", title: "Idle", items: grouped.idle },
  ]

  const visibleSections = sections.filter((section) => groupFilter === "all" || groupFilter === section.key)

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status)
    if (tone === "ok") return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700"
    if (tone === "bad") return "border-destructive/35 bg-destructive/10 text-destructive"
    return "border-border/65 bg-muted/40 text-muted-foreground"
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/55 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Extension Operations</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onRefresh}>
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 extension 名称"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                ["all", `all (${filtered.length})`],
                ["error", `error (${grouped.error.length})`],
                ["running", `running (${grouped.running.length})`],
                ["idle", `idle (${grouped.idle.length})`],
              ] as const).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={groupFilter === key ? "secondary" : "outline"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setGroupFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">没有匹配的 extension。</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {visibleSections.map((section) => (
            <Card key={section.key} className={section.key === "error" ? "border-destructive/30" : ""}>
              <CardHeader className="border-b border-border/55 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className={section.key === "error" ? "text-destructive" : ""}>{section.title}</CardTitle>
                  <span className="text-xs text-muted-foreground">{section.items.length}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-3">
                {section.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 bg-background/60 px-3 py-4 text-xs text-muted-foreground">
                    空分组
                  </div>
                ) : (
                  section.items.map((item) => {
                    const name = String(item.name || "unknown")
                    const state = String(item.state || "unknown")
                    const supportsLifecycle = item.supportsLifecycle === true
                    const lifecycle = item.config?.lifecycle || {}
                    const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
                    return (
                      <article key={name} className="rounded-xl border border-border/60 bg-background/65 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="truncate text-sm font-medium text-foreground">{name}</h4>
                          <Badge variant="outline" className={badgeClass(state)}>
                            {state}
                          </Badge>
                        </div>

                        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                          <div>{`updated: ${formatTime(item.updatedAt)}`}</div>
                          <div>{`last command: ${item.lastCommand ? `${item.lastCommand} @ ${formatTime(item.lastCommandAt)}` : "-"}`}</div>
                          <div className="truncate" title={item.lastError || ""}>
                            {`last error: ${item.lastError || "-"}`}
                          </div>
                        </div>

                        <div className="mt-2 space-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                          <div className="font-medium text-foreground/80">config</div>
                          <div>{`lifecycle.start: ${lifecycle.start ? "on" : "off"}`}</div>
                          <div>{`lifecycle.stop: ${lifecycle.stop ? "on" : "off"}`}</div>
                          <div>{`lifecycle.command: ${lifecycle.command ? "on" : "off"}`}</div>
                          <div>{`actions: ${actionItems.length}`}</div>
                          {actionItems.length > 0 ? (
                            <div className="max-h-28 space-y-1 overflow-auto">
                              {actionItems.map((action) => {
                                const actionName = String(action?.name || "unknown")
                                const supportsApi = action?.supportsApi === true
                                const supportsCmd = action?.supportsCommand === true
                                const apiMethod = String(action?.apiMethod || "").trim()
                                const apiPath = String(action?.apiPath || "").trim()
                                const commandDescription = String(action?.commandDescription || "").trim()
                                const modeLabel = [
                                  supportsCmd ? "cmd" : "",
                                  supportsApi ? "api" : "",
                                ].filter(Boolean).join("+") || "none"
                                return (
                                  <div key={`${name}:${actionName}`} className="truncate" title={commandDescription || apiPath || actionName}>
                                    {`${actionName} · ${modeLabel}${
                                      supportsApi && apiMethod && apiPath ? ` · ${apiMethod} ${apiPath}` : ""
                                    }`}
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {supportsLifecycle ? (
                            <>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onControl(name, "start")}>
                                start
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onControl(name, "restart")}>
                                restart
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onControl(name, "stop")}>
                                stop
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">lifecycle unsupported</span>
                          )}
                        </div>
                      </article>
                    )
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
