/**
 * 未启动 Agent 的概览区。
 *
 * 关键点（中文）
 * - 视觉风格与运行态 overview 对齐：顶部信息条 + 参数块。
 * - 未启动时也允许在 overview main 内切换 execution，避免把配置入口分散到其他列表里。
 * - local 模式直接编辑 `plugins.lmp.model`，不再混入 api 模型池。
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
   * 读取可选的本地 GGUF 模型列表。
   */
  onLoadLocalModels: (projectRoot?: string) => Promise<string[]>
  /**
   * 更新当前 agent 的 execution。
   */
  onUpdateExecution: (input: {
    executionMode: "api" | "acp" | "local"
    modelId?: string
    localModel?: string
    agentType?: string
  }) => void
}

function BasicRow(props: { value: string }) {
  return (
    <div className="min-w-0 truncate text-sm text-foreground" title={props.value}>
      {props.value || "-"}
    </div>
  )
}

type StoppedExecutionType = "api" | "local" | "acp"
type StoppedAcpType = "kimi" | "claude" | "codex"

/**
 * 关键点（中文）：停止态和运行态使用同一套 execution 语义，保证配置入口一致。
 */
function deriveExecutionState(input: {
  executionMode?: "api" | "acp" | "local"
  agentType?: string
}): {
  executionType: StoppedExecutionType
  agentType: StoppedAcpType
} {
  if (input.executionMode === "api" || !input.executionMode) {
    return {
      executionType: "api",
      agentType: "kimi",
    }
  }
  if (input.executionMode === "local") {
    return {
      executionType: "local",
      agentType: "kimi",
    }
  }
  const agentType = String(input.agentType || "").trim()
  if (agentType === "claude" || agentType === "codex") {
    return {
      executionType: "acp",
      agentType,
    }
  }
  return {
    executionType: "acp",
    agentType: "kimi",
  }
}

function readExecutionLabel(agent: UiAgentOption): string {
  if (agent.executionMode === "api") {
    return String(agent.modelId || "").trim() || "-"
  }
  if (agent.executionMode === "local") {
    return `local ${String(agent.localModel || "-").trim() || "-"}`
  }
  return `acp ${String(agent.agentType || "-").trim() || "-"}`
}

function buildLocalModelChoices(
  options: string[],
  selected?: string,
): string[] {
  const values = new Set<string>()
  const preferred = String(selected || "").trim()
  if (preferred) values.add(preferred)
  for (const item of options) {
    const normalized = String(item || "").trim()
    if (!normalized) continue
    values.add(normalized)
  }
  return Array.from(values)
}

export function AgentOverviewStoppedSection(props: AgentOverviewStoppedSectionProps) {
  const { agent, model, onStart, onLoadLocalModels, onUpdateExecution } = props
  const [starting, setStarting] = React.useState(false)

  if (!agent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 Agent</div>
  }

  const executionLabel = readExecutionLabel(agent)
  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const currentModelId = String(
    model?.agentPrimaryModelId || model?.primaryModelId || agent.modelId || "",
  ).trim()
  const fallbackModelId = String(availableModels[0]?.id || "").trim()
  const resolvedModelId = currentModelId || fallbackModelId
  const currentLocalModel = String(agent.localModel || "").trim()
  const currentExecutionState = deriveExecutionState({
    executionMode: agent.executionMode,
    agentType: agent.agentType,
  })
  const [targetExecutionType, setTargetExecutionType] = React.useState<StoppedExecutionType>(currentExecutionState.executionType)
  const [targetAgentType, setTargetAgentType] = React.useState<StoppedAcpType>(currentExecutionState.agentType)
  const [targetLocalModel, setTargetLocalModel] = React.useState(currentLocalModel)
  const [localModelOptions, setLocalModelOptions] = React.useState<string[]>([])
  const [loadingLocalModels, setLoadingLocalModels] = React.useState(false)
  const path = String(agent.projectRoot || agent.id || "").trim() || "-"
  const lastStoppedAt = agent.stoppedAt
    ? new Date(agent.stoppedAt).toLocaleString("zh-CN", { hour12: false })
    : "-"

  React.useEffect(() => {
    setTargetExecutionType(currentExecutionState.executionType)
    setTargetAgentType(currentExecutionState.agentType)
  }, [currentExecutionState])

  React.useEffect(() => {
    setTargetLocalModel(currentLocalModel)
  }, [currentLocalModel])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        setLoadingLocalModels(true)
        const models = await onLoadLocalModels(agent.projectRoot || agent.id)
        if (cancelled) return
        setLocalModelOptions(models)
      } finally {
        if (!cancelled) {
          setLoadingLocalModels(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agent.id, agent.projectRoot, onLoadLocalModels])

  const availableLocalModelOptions = React.useMemo(
    () => buildLocalModelChoices(localModelOptions, targetLocalModel || currentLocalModel),
    [currentLocalModel, localModelOptions, targetLocalModel],
  )

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

      <section className="rounded-[18px] bg-secondary/72 px-3.5 py-3 space-y-3">
        <div className="space-y-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 justify-start rounded-[12px] bg-background px-3 text-left text-sm font-medium w-full"
                />
              }
            >
              <span className="truncate">
                {targetExecutionType === "api"
                  ? "API"
                  : targetExecutionType === "local"
                    ? "Local"
                    : "ACP"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 min-w-[18rem]">
              <DropdownMenuItem
                onClick={() => {
                  setTargetExecutionType("api")
                  if (!resolvedModelId) return
                  if (currentExecutionState.executionType === "api" && resolvedModelId === currentModelId) return
                  onUpdateExecution({
                    executionMode: "api",
                    modelId: resolvedModelId,
                  })
                }}
              >
                API
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTargetExecutionType("local")
                  const nextLocalModel = String(targetLocalModel || currentLocalModel || availableLocalModelOptions[0] || "").trim()
                  if (!nextLocalModel) return
                  if (currentExecutionState.executionType === "local" && nextLocalModel === currentLocalModel) return
                  onUpdateExecution({
                    executionMode: "local",
                    localModel: nextLocalModel,
                  })
                }}
              >
                Local
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTargetExecutionType("acp")
                  const nextAgentType = targetAgentType || currentExecutionState.agentType || "kimi"
                  if (currentExecutionState.executionType === "acp" && currentExecutionState.agentType === nextAgentType) return
                  onUpdateExecution({
                    executionMode: "acp",
                    agentType: nextAgentType,
                  })
                }}
              >
                ACP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {targetExecutionType === "api" ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 justify-start rounded-[12px] bg-background px-3 text-left text-sm font-medium w-full"
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
                          if (modelId === currentModelId && currentExecutionState.executionType === "api") return
                          onUpdateExecution({
                            executionMode: "api",
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
          ) : targetExecutionType === "local" ? (
            <div className="flex items-center gap-2">
              <select
                value={targetLocalModel}
                className="flex h-9 flex-1 rounded-[12px] border border-input bg-background px-3 font-mono text-[12px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                onChange={(event) => setTargetLocalModel(event.target.value)}
                disabled={loadingLocalModels || availableLocalModelOptions.length === 0}
              >
                {availableLocalModelOptions.length === 0 ? (
                  <option value="">
                    {loadingLocalModels ? "正在读取本地模型" : "没有发现本地 GGUF 模型"}
                  </option>
                ) : null}
                {availableLocalModelOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-[12px] bg-background px-3 text-xs"
                disabled={!String(targetLocalModel || "").trim() || loadingLocalModels}
                onClick={() => {
                  const nextLocalModel = String(targetLocalModel || "").trim()
                  if (!nextLocalModel) return
                  if (currentExecutionState.executionType === "local" && nextLocalModel === currentLocalModel) return
                  onUpdateExecution({
                    executionMode: "local",
                    localModel: nextLocalModel,
                  })
                }}
              >
                应用
              </Button>
            </div>
          ) : targetExecutionType === "acp" ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 justify-start rounded-[12px] bg-background px-3 text-left text-sm font-medium w-full"
                  />
                }
              >
                <span className="truncate">
                  {`ACP · ${targetAgentType}`}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 min-w-[18rem]">
                {(["kimi", "claude", "codex"] as const).map((agentType) => (
                  <DropdownMenuItem
                    key={agentType}
                    onClick={() => {
                      setTargetAgentType(agentType)
                      if (currentExecutionState.executionType === "acp" && currentExecutionState.agentType === agentType) return
                      onUpdateExecution({
                        executionMode: "acp",
                        agentType,
                      })
                    }}
                  >
                    {`ACP · ${agentType}`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="text-xs text-muted-foreground">{executionLabel}</div>
          )}
        </div>
        <div className="space-y-1 text-sm">
          <BasicRow value={path} />
          <BasicRow value={String(agent.host || "-")} />
          <BasicRow value={agent.port ? String(agent.port) : "-"} />
          <BasicRow value={lastStoppedAt} />
        </div>
        <div className="inline-flex items-center gap-1 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/45" />
          <span>stopped</span>
        </div>
      </section>
    </section>
  )
}
