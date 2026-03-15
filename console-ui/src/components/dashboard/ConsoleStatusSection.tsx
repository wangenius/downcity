/**
 * Console 级状态总览。
 */

import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import type {
  UiAgentOption,
  UiConfigStatusItem,
  UiExtensionRuntimeItem,
} from "../../types/Dashboard"

export interface ConsoleStatusSectionProps {
  /**
   * 当前选中 agent。
   */
  selectedAgent: UiAgentOption | null
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

export function ConsoleStatusSection(props: ConsoleStatusSectionProps) {
  const {
    selectedAgent,
    topbarStatus,
    topbarError,
    hasPrompt,
    extensions,
    configStatus,
    onRefresh,
  } = props

  const runningExtensions = extensions.filter((item) => String(item.state || "") === "running").length
  const errorExtensions = extensions.filter((item) => String(item.state || "") === "error").length
  const consoleConfigItems = configStatus.filter((item) => item.scope === "console")
  // 关键说明（中文）：
  // 仅必需 console 文件参与“异常”统计；可选文件缺失不算异常。
  const requiredConsoleKeys = new Set(["ship_db", "console_pid", "agents_registry"])
  const requiredConsoleItems = consoleConfigItems.filter((item) => requiredConsoleKeys.has(item.key))
  const optionalConsoleItems = consoleConfigItems.filter((item) => !requiredConsoleKeys.has(item.key))
  const nonOkRequiredConfigItems = requiredConsoleItems.filter((item) => item.status !== "ok")
  const missingOptionalCount = optionalConsoleItems.filter((item) => item.status === "missing").length

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Console Runtime</CardTitle>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background/75 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Console</div>
              <Badge variant="outline" className={topbarError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/45 text-foreground"}>
                {topbarError ? "error" : "running"}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">{topbarStatus}</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/75 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Active Agent</div>
              <Badge variant="outline" className={selectedAgent ? "border-border bg-muted/45 text-foreground" : "border-border bg-muted/35 text-muted-foreground"}>
                {selectedAgent ? "selected" : "none"}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">
                {selectedAgent ? `${selectedAgent.name} (${selectedAgent.host || "127.0.0.1"}:${selectedAgent.port || "-"})` : "未选择 agent"}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/75 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Prompt Runtime</div>
              <Badge variant="outline" className={hasPrompt ? "border-border bg-muted/45 text-foreground" : "border-border bg-muted/35 text-muted-foreground"}>
                {hasPrompt ? "ready" : "unknown"}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">{hasPrompt ? "system prompt resolved" : "waiting runtime context"}</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/75 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Extensions</div>
              <Badge variant="outline" className={errorExtensions > 0 ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/45 text-foreground"}>
                {`${runningExtensions}/${extensions.length} running`}
              </Badge>
              <div className="mt-2 text-xs text-muted-foreground">{`error ${errorExtensions} · total ${extensions.length}`}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Console Config Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {`异常 ${nonOkRequiredConfigItems.length} / 必需 ${requiredConsoleItems.length}（可选缺失 ${missingOptionalCount}）`}
          </div>
          {consoleConfigItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              未获取到 console 级配置文件状态
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/70">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted/35 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-3 py-2 font-medium">File</th>
                    <th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {consoleConfigItems.map((item) => (
                    <tr key={`${item.scope}:${item.key}:${item.path}`} className="border-t border-border/70">
                      <td className="px-3 py-2 text-sm font-medium">{item.label}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex rounded-full border border-border bg-muted/35 px-2 py-0.5 text-muted-foreground">
                          {requiredConsoleKeys.has(item.key) ? "required" : "optional"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            item.status === "ok"
                              ? "inline-flex rounded-full border border-border bg-muted/45 px-2 py-0.5 text-foreground"
                              : item.status === "missing"
                                ? requiredConsoleKeys.has(item.key)
                                  ? "inline-flex rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-destructive"
                                  : "inline-flex rounded-full border border-border bg-muted/35 px-2 py-0.5 text-muted-foreground"
                                : "inline-flex rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-destructive"
                          }
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{item.reason || "-"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {item.mtime ? new Date(item.mtime).toLocaleString("zh-CN", { hour12: false }) : "-"}
                      </td>
                      <td className="max-w-[28rem] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground" title={item.path}>
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
    </div>
  )
}
