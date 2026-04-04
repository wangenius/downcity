/**
 * Agent 视角模型绑定面板。
 *
 * 关键点（中文）
 * - 只处理当前选中 agent 的 `model.primary` 绑定。
 * - 全局模型池的维护与浏览不在本组件内。
 */

import * as React from "react"
import { Button } from "@downcity/ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { UiAgentOption, UiModelSummary } from "@/types/Dashboard"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

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
   * 更新 agent 绑定模型回调。
   */
  onSwitchModel: (primaryModelId: string) => void
}

export function AgentModelBindingSection(props: AgentModelBindingSectionProps) {
  const { selectedAgent, model, onSwitchModel } = props
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const [targetModelId, setTargetModelId] = React.useState("")
  const currentModelId = String(model?.agentPrimaryModelId || model?.primaryModelId || "").trim()

  React.useEffect(() => {
    setTargetModelId(currentModelId)
  }, [currentModelId])

  if (!selectedAgent) {
    return <div className="py-4 text-sm text-muted-foreground">未选择 agent</div>
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
          provider {model?.providerType || "-"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-[min(30rem,65vw)] justify-between gap-1 px-2 text-xs"
              />
            }
          >
            <span className="truncate">{targetModelId || "选择 model.primary"}</span>
            <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 min-w-[min(30rem,65vw)]">
            {availableModels.map((item) => {
              const modelId = String(item.id || "").trim()
              if (!modelId) return null
              const checked = modelId === targetModelId
              return (
                <DropdownMenuItem
                  key={modelId}
                  onClick={() => {
                    const nextModelId = String(modelId || "").trim()
                    setTargetModelId(nextModelId)
                    // 关键点（中文）：在下拉菜单切换时直接提交，不再需要额外“保存”步骤。
                    if (!nextModelId || nextModelId === currentModelId) return
                    onSwitchModel(nextModelId)
                  }}
                >
                  {checked ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                  <span className="truncate">{`${modelId} · ${item.name || "-"} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="text-xs text-muted-foreground">切换后需重启生效</div>
    </section>
  )
}
