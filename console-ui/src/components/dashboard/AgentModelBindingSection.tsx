/**
 * Agent 视角模型绑定面板。
 *
 * 关键点（中文）
 * - 只处理当前选中 agent 的 `model.primary` 绑定。
 * - 全局模型池的维护与浏览不在本组件内。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UiAgentOption, UiModelSummary } from "@/types/Dashboard"

export interface AgentModelBindingSectionProps {
  /**
   * 当前选中的 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * 模型快照。
   */
  model: UiModelSummary | null
  /**
   * 是否刷新中。
   */
  loading: boolean
  /**
   * 刷新模型回调。
   */
  onRefresh: () => void
  /**
   * 更新 agent 绑定模型回调。
   */
  onSwitchModel: (primaryModelId: string) => void
}

export function AgentModelBindingSection(props: AgentModelBindingSectionProps) {
  const { selectedAgent, model, loading, onRefresh, onSwitchModel } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const [targetModelId, setTargetModelId] = React.useState("")

  React.useEffect(() => {
    const activeId = String(model?.agentPrimaryModelId || model?.primaryModelId || "").trim()
    setTargetModelId(activeId)
  }, [model?.agentPrimaryModelId, model?.primaryModelId])

  if (!selectedAgent) {
    return <div className="border-b border-dashed border-border py-6 text-sm text-muted-foreground">未选择可用 agent</div>
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/70 pb-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {`Agent Model Binding · ${selectedAgent.name || "-"}`}
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? "刷新中..." : "刷新"}
        </Button>
      </div>

      <div className="grid gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground">
        <div>{`agent primary: ${model?.agentPrimaryModelId || "-"}`}</div>
        <div>{`model id: ${model?.primaryModelId || "-"}`}</div>
        <div>{`model name: ${model?.primaryModelName || "-"}`}</div>
        <div>{`provider: ${model?.providerType || "-"} (${model?.providerKey || "-"})`}</div>
        <div className="truncate">{`baseUrl: ${model?.baseUrl || "-"}`}</div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
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
                  {`${modelId} · ${item.name || "-"} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          onClick={() => onSwitchModel(targetModelId)}
          disabled={!targetModelId || targetModelId === (model?.agentPrimaryModelId || model?.primaryModelId)}
        >
          保存 model.primary
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">切换后需重启 agent 生效</div>
    </section>
  )
}
