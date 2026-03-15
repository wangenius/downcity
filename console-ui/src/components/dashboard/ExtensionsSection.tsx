/**
 * Extension 状态区。
 */

import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
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

export function ExtensionsSection(props: ExtensionsSectionProps) {
  const { extensions, formatTime, statusBadgeVariant, onRefresh, onControl } = props

  const badgeClass = (status?: string): string => {
    const tone = statusBadgeVariant(status)
    if (tone === "ok") return "border-border bg-muted/45 text-foreground"
    if (tone === "bad") return "border-destructive/40 bg-destructive/10 text-destructive"
    return "border-border bg-muted/35 text-muted-foreground"
  }

  return (
    <Card className="border-border/80 bg-card/90">
      <CardHeader>
        <CardTitle>Extension Status</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent>
        {extensions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            暂无 extension 数据
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Extension</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Last Command</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {extensions.map((item) => {
                  const name = String(item.name || "unknown")
                  const state = String(item.state || "unknown")
                  const supportsLifecycle = item.supportsLifecycle === true
                  return (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badgeClass(state)}>
                          {state}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatTime(item.updatedAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.lastCommand ? `${item.lastCommand} @ ${formatTime(item.lastCommandAt)}` : "-"}
                      </TableCell>
                      <TableCell>
                        {supportsLifecycle ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => onControl(name, "start")}>start</Button>
                            <Button size="sm" variant="outline" onClick={() => onControl(name, "restart")}>restart</Button>
                            <Button size="sm" variant="outline" onClick={() => onControl(name, "stop")}>stop</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">lifecycle unsupported</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
