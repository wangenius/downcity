/**
 * 未启动 Agent 的概览区。
 *
 * 关键点（中文）
 * - 视觉风格与运行态 overview 对齐：顶部信息条 + 参数块。
 * - 未启动时也允许在 overview main 内切换 execution，避免把配置入口分散到其他列表里。
 */

import * as React from "react"
import { Loader2Icon, PlayIcon } from "lucide-react"
import { Button } from "@downcity/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { UiAgentOption, UiModelSummary } from "@/types/Dashboard"

export interface AgentOverviewStoppedSectionProps {
  /**
   * 当前选中的 agent。
   */
  agent: UiAgentOption | null
  /**
   * 当前模型概览快照。
   */
  model: UiModelSummary | null
  /**
   * 启动 agent 回调。
   */
  onStart: (agentId: string) => Promise<void> | void
  /**
   * 更新当前 agent 的 execution。
   */
  onUpdateExecution: (input: {
    executionMode: "model" | "acp"
    modelId?: string
    agentType?: string
  }) => void
}

function BasicRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className="min-w-0 truncate text-foreground" title={props.value}>
        {props.value || "-"}
      </div>
    </div>
  )
}

type StoppedExecutionChoice = "model" | "kimi" | "claude" | "codex"

/**
 * 关键点（中文）：停止态和运行态使用同一套 execution 语义，保证配置入口一致。
 */
function deriveExecutionChoice(input: {
  executionMode?: "model" | "acp"
  agentType?: string
}): StoppedExecutionChoice {
  if (input.executionMode === "model" || !input.executionMode) return "model"
  const agentType = String(input.agentType || "").trim()
  if (agentType === "kimi" || agentType === "claude" || agentType === "codex") {
    return agentType
  }
  return "kimi"
}

export function AgentOverviewStoppedSection(props: AgentOverviewStoppedSectionProps) {
  const { agent, model, onStart, onUpdateExecution } = props
  const [starting, setStarting] = React.useState(false)

  if (!agent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 Agent</div>
  }

  const executionLabel =
    agent.executionMode === "model"
      ? String(agent.modelId || "").trim() || "-"
      : `acp ${String(agent.agentType || "-").trim() || "-"}`
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const currentModelId = String(
    model?.agentPrimaryModelId || model?.primaryModelId || agent.modelId || "",
  ).trim()
  const fallbackModelId = String(availableModels[0]?.id || "").trim()
  const resolvedModelId = currentModelId || fallbackModelId
  const currentExecutionChoice = deriveExecutionChoice({
    executionMode: agent.executionMode,
    agentType: agent.agentType,
  })
  const path = String(agent.projectRoot || agent.id || "").trim() || "-"
  const lastStoppedAt = agent.stoppedAt
    ? new Date(agent.stoppedAt).toLocaleString("zh-CN", { hour12: false })
    : "-"

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <img src="/image.png" alt="bot" className="mt-0.5 size-8 shrink-0 rounded-[4px] object-cover" />
            <div className="min-w-0 space-y-1">
              <div className="truncate text-xl font-semibold leading-none text-foreground/74">{agent.name || "Unknown Agent"}</div>
              <div className="truncate text-xs text-muted-foreground">{path}</div>
            </div>
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="secondary"
          disabled={starting}
          title={starting ? "启动中" : "启动"}
          aria-label={starting ? "启动中" : "启动"}
          onClick={async () => {
            try {
              setStarting(true)
              await Promise.resolve(onStart(agent.id))
            } finally {
              setStarting(false)
            }
          }}
        >
          {starting ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
        </Button>
      </div>

      <section className="rounded-[18px] bg-secondary/72 px-3.5 py-3">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Execution</div>
          <div className="min-w-0 space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 justify-start rounded-[12px] bg-background px-3 text-left text-sm font-medium"
                  />
                }
              >
                <span className="truncate">
                  {currentExecutionChoice === "model" ? "Model" : `ACP · ${currentExecutionChoice}`}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 min-w-[18rem]">
                <DropdownMenuItem
                  disabled={!resolvedModelId}
                  onClick={() => {
                    if (!resolvedModelId) return
                    if (currentExecutionChoice === "model" && resolvedModelId === currentModelId) return
                    onUpdateExecution({
                      executionMode: "model",
                      modelId: resolvedModelId,
                    })
                  }}
                >
                  {resolvedModelId ? `Model · ${resolvedModelId}` : "Model · 无可用模型"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (currentExecutionChoice === "kimi") return
                    onUpdateExecution({
                      executionMode: "acp",
                      agentType: "kimi",
                    })
                  }}
                >
                  ACP · Kimi
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (currentExecutionChoice === "claude") return
                    onUpdateExecution({
                      executionMode: "acp",
                      agentType: "claude",
                    })
                  }}
                >
                  ACP · Claude
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (currentExecutionChoice === "codex") return
                    onUpdateExecution({
                      executionMode: "acp",
                      agentType: "codex",
                    })
                  }}
                >
                  ACP · Codex
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {currentExecutionChoice === "model" ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 justify-start rounded-[12px] bg-background px-3 text-left text-sm font-medium"
                    />
                  }
                >
                  <span className="truncate">
                    {resolvedModelId || "选择 execution.modelId"}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 min-w-[18rem]">
                  {availableModels.length === 0 ? (
                    <DropdownMenuItem disabled>无可选模型</DropdownMenuItem>
                  ) : (
                    availableModels.map((item) => {
                      const modelId = String(item.id || "").trim()
                      if (!modelId) return null
                      return (
                        <DropdownMenuItem
                          key={modelId}
                          onClick={() => {
                            if (modelId === currentModelId) return
                            onUpdateExecution({
                              executionMode: "model",
                              modelId,
                            })
                          }}
                        >
                          {`${modelId} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                        </DropdownMenuItem>
                      )
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="text-xs text-muted-foreground">{executionLabel}</div>
            )}
          </div>
        </div>
        <BasicRow label="Path" value={path} />
        <BasicRow label="Host" value={String(agent.host || "-")} />
        <BasicRow label="Port" value={agent.port ? String(agent.port) : "-"} />
        <BasicRow label="Last Stop" value={lastStoppedAt} />
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Status</div>
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/45" />
            <span>stopped</span>
          </div>
        </div>
      </section>
    </section>
  )
}
