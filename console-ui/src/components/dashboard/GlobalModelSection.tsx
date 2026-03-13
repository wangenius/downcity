/**
 * Global 作用域模型管理页。
 */

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UiModelSummary } from "@/types/Dashboard"

export interface GlobalModelSectionProps {
  /**
   * 模型快照。
   */
  model: UiModelSummary | null
  /**
   * 是否刷新中。
   */
  loading: boolean
  /**
   * 刷新回调。
   */
  onRefresh: () => void
}

export function GlobalModelSection(props: GlobalModelSectionProps) {
  const { model, loading, onRefresh } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>Global Model</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {model ? (
          <>
            <div className="grid gap-2 rounded-xl border border-border/70 bg-background/70 p-3 text-xs">
              <div>{`total models: ${availableModels.length}`}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Console Model Pool</div>
              <div className="grid gap-2">
                {availableModels.map((item) => {
                  const modelId = String(item.id || "").trim()
                  if (!modelId) return null
                  return (
                    <div
                      key={modelId}
                      className="grid gap-1 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs"
                    >
                      <div className="font-medium text-foreground">{modelId}</div>
                      <div className="text-muted-foreground">{`name: ${item.name || "-"}`}</div>
                      <div className="text-muted-foreground">{`provider: ${item.providerKey || "-"} (${item.providerType || "-"})`}</div>
                      <div className="text-muted-foreground">{`status: ${item.isPaused ? "paused" : "active"}`}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            当前未加载到模型数据，请检查 console ui 与模型池状态
          </div>
        )}
      </CardContent>
    </Card>
  )
}
