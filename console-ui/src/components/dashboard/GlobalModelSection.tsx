/**
 * Global 作用域模型管理页。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  /**
   * 更新 agent 绑定模型回调。
   */
  onSwitchModel: (primaryModelId: string) => void
}

export function GlobalModelSection(props: GlobalModelSectionProps) {
  const { model, loading, onRefresh, onSwitchModel } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const [targetModelId, setTargetModelId] = React.useState("")

  React.useEffect(() => {
    const activeId = String(model?.agentPrimaryModelId || model?.primaryModelId || "").trim()
    setTargetModelId(activeId)
  }, [model?.agentPrimaryModelId, model?.primaryModelId])

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
              <div>{`agent primary: ${model.agentPrimaryModelId || "-"}`}</div>
              <div>{`model id: ${model.primaryModelId || "-"}`}</div>
              <div>{`model name: ${model.primaryModelName || "-"}`}</div>
              <div>{`provider: ${model.providerType || "-"} (${model.providerKey || "-"})`}</div>
              <div className="truncate">{`baseUrl: ${model.baseUrl || "-"}`}</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bind Agent Primary Model</div>
              <Select
                value={targetModelId || undefined}
                onValueChange={(value) => {
                  setTargetModelId(String(value || ""))
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择 agent primary model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((item) => {
                    const modelId = String(item.id || "").trim()
                    if (!modelId) return null
                    return (
                      <SelectItem key={modelId} value={modelId}>
                        {`${modelId} · ${item.name || "-"} · ${item.providerType || "-"}`}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => onSwitchModel(targetModelId)}
                  disabled={!targetModelId || targetModelId === (model.agentPrimaryModelId || model.primaryModelId)}
                >
                  保存 model.primary
                </Button>
                <Badge variant="outline" className="border-amber-300 text-amber-700">
                  切换后需重启 agent 生效
                </Badge>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            当前 runtime 未提供模型管理接口
          </div>
        )}
      </CardContent>
    </Card>
  )
}
