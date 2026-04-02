/**
 * Global 作用域的 agent 管理页。
 *
 * 关键点（中文）
 * - 主路径是“打开文件夹”，而不是先创建抽象 agent 条目。
 * - execution 只在 agent overview main 中编辑，这里只负责接入与运行控制。
 * - 项目执行模式只分两类：`model` 或 `acp`。
 */

import * as React from "react"
import {
  BotIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
  WandSparklesIcon,
} from "lucide-react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@downcity/ui"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import type { UiAgentDirectoryInspection, UiAgentOption, UiModelPoolItem } from "@/types/Dashboard"

type AgentExecutionChoice = "model" | "kimi" | "claude" | "codex"

type AgentFormState = {
  projectRoot: string
  agentName: string
  executionChoice: AgentExecutionChoice
  modelId: string
}

function createEmptyForm(defaultModelId: string): AgentFormState {
  return {
    projectRoot: "",
    agentName: "",
    executionChoice: defaultModelId ? "model" : "kimi",
    modelId: defaultModelId,
  }
}

function deriveFolderName(projectRoot: string): string {
  const normalized = String(projectRoot || "").trim().replace(/[\\/]+$/, "")
  if (!normalized) return "selected-folder"
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] || normalized
}

function deriveExecutionChoice(input: {
  executionMode?: "model" | "acp"
  agentType?: string
  defaultChoice: AgentExecutionChoice
}): AgentExecutionChoice {
  if (input.executionMode === "model") return "model"
  const agentType = String(input.agentType || "").trim()
  if (agentType === "kimi" || agentType === "claude" || agentType === "codex") {
    return agentType
  }
  return input.defaultChoice
}

function readRuntimeLabel(input: {
  executionChoice: AgentExecutionChoice
  selectedModelLabel: string
}): string {
  return input.executionChoice === "model"
    ? (input.selectedModelLabel || "-")
    : `ACP · ${input.executionChoice}`
}

export interface GlobalAgentsSectionProps {
  agents: UiAgentOption[]
  modelPoolItems: UiModelPoolItem[]
  onPickAgentDirectory: () => Promise<string>
  onInspectAgentDirectory: (projectRoot: string) => Promise<UiAgentDirectoryInspection | null>
  onRestartAgent: (agentId: string) => void
  onStopAgent: (agentId: string) => void
  onStartAgent: (agentId: string) => void
  onStartAgentWithInitialization: (agentId: string, input: {
    agentName?: string
    executionMode: "model" | "acp"
    modelId?: string
    agentType?: string
  }) => void
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const {
    agents,
    modelPoolItems,
    onPickAgentDirectory,
    onInspectAgentDirectory,
    onRestartAgent,
    onStopAgent,
    onStartAgent,
    onStartAgentWithInitialization,
  } = props
  const confirm = useConfirmDialog()
  const [startingAgentId, setStartingAgentId] = React.useState("")
  const [restartingAgentId, setRestartingAgentId] = React.useState("")
  const [stoppingAgentId, setStoppingAgentId] = React.useState("")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [dialogTargetAgentId, setDialogTargetAgentId] = React.useState("")
  const [pickingDirectory, setPickingDirectory] = React.useState(false)
  const [submittingDialog, setSubmittingDialog] = React.useState(false)
  const activeModelOptions = React.useMemo(
    () => modelPoolItems.filter((item) => item.isPaused !== true),
    [modelPoolItems],
  )
  const defaultModelId = React.useMemo(
    () => String(activeModelOptions[0]?.id || modelPoolItems[0]?.id || "").trim(),
    [activeModelOptions, modelPoolItems],
  )
  const [form, setForm] = React.useState<AgentFormState>(() => createEmptyForm(defaultModelId))

  React.useEffect(() => {
    setForm((current) => {
      if (current.modelId) return current
      if (!defaultModelId) return current
      return {
        ...current,
        modelId: defaultModelId,
      }
    })
  }, [defaultModelId])

  const resetDialog = React.useCallback(() => {
    setDialogOpen(false)
    setDialogTargetAgentId("")
    setSubmittingDialog(false)
    setForm(createEmptyForm(defaultModelId))
  }, [defaultModelId])

  const openExecutionDialog = React.useCallback((input: {
    agentId?: string
    projectRoot: string
    agentName?: string
    executionMode?: "model" | "acp"
    modelId?: string
    agentType?: string
  }) => {
    setDialogTargetAgentId(String(input.agentId || input.projectRoot || "").trim())
    setForm({
      projectRoot: String(input.projectRoot || "").trim(),
      agentName: String(input.agentName || "").trim(),
      executionChoice: deriveExecutionChoice({
        executionMode: input.executionMode,
        agentType: input.agentType,
        defaultChoice: defaultModelId ? "model" : "kimi",
      }),
      modelId: String(input.modelId || defaultModelId || "").trim(),
    })
    setDialogOpen(true)
  }, [defaultModelId])

  const handleOpenFolder = React.useCallback(async () => {
    try {
      setPickingDirectory(true)
      const projectRoot = await onPickAgentDirectory()
      if (!projectRoot) return
      const inspection = await onInspectAgentDirectory(projectRoot)
      if (!inspection) return
      if (inspection.initialized) {
        try {
          setStartingAgentId(inspection.projectRoot)
          await Promise.resolve(onStartAgent(inspection.projectRoot))
        } finally {
          setStartingAgentId("")
        }
        return
      }
      openExecutionDialog({
        agentId: inspection.knownAgent ? inspection.projectRoot : "",
        projectRoot: inspection.projectRoot,
        agentName: inspection.displayName,
        executionMode: inspection.executionMode,
        modelId: inspection.modelId,
        agentType: inspection.agentType,
      })
    } finally {
      setPickingDirectory(false)
    }
  }, [onInspectAgentDirectory, onPickAgentDirectory, onStartAgent, openExecutionDialog])

  const pickDirectoryForDialog = React.useCallback(async () => {
    try {
      setPickingDirectory(true)
      const projectRoot = await onPickAgentDirectory()
      if (!projectRoot) return
      const inspection = await onInspectAgentDirectory(projectRoot)
      if (!inspection) return
      if (inspection.initialized) {
        resetDialog()
        try {
          setStartingAgentId(inspection.projectRoot)
          await Promise.resolve(onStartAgent(inspection.projectRoot))
        } finally {
          setStartingAgentId("")
        }
        return
      }
      setForm((current) => ({
        ...current,
        projectRoot: inspection.projectRoot,
        agentName: inspection.displayName || current.agentName,
        executionChoice: deriveExecutionChoice({
          executionMode: inspection.executionMode,
          agentType: inspection.agentType,
          defaultChoice: current.executionChoice,
        }),
        modelId: String(inspection.modelId || current.modelId || "").trim(),
      }))
    } finally {
      setPickingDirectory(false)
    }
  }, [onInspectAgentDirectory, onPickAgentDirectory, onStartAgent, resetDialog])

  const canSubmitDialog =
    Boolean(String(form.projectRoot || "").trim()) &&
    (form.executionChoice !== "model" || (
      Boolean(String(form.modelId || "").trim()) &&
      activeModelOptions.length > 0
    ))
  const resolvedAgentName = String(form.agentName || "").trim() || deriveFolderName(form.projectRoot)
  const selectedModelLabel = React.useMemo(() => {
    const matched = activeModelOptions.find(
      (item) => String(item.id || "").trim() === String(form.modelId || "").trim(),
    )
    return String(matched?.name || matched?.id || form.modelId || "").trim()
  }, [activeModelOptions, form.modelId])
  const runtimeLabel = readRuntimeLabel({
    executionChoice: form.executionChoice,
    selectedModelLabel,
  })

  return (
    <section className="min-h-0 overflow-y-auto">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{`agent ${agents.length}`}</div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={dashboardIconButtonClass}
          onClick={() => void handleOpenFolder()}
          disabled={pickingDirectory}
          aria-label="打开文件夹"
          title="打开文件夹"
        >
          {pickingDirectory ? <Loader2Icon className="size-4 animate-spin" /> : <FolderOpenIcon className="size-4" />}
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-[20px] bg-secondary px-4 py-5 text-sm text-muted-foreground">暂无 agent，点击右上角打开文件夹</div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => {
            const isRunning = agent.running === true
            const executionChip =
              agent.executionMode === "model"
                ? String(agent.modelId || "").trim() || "-"
                : `acp ${String(agent.agentType || "-").trim() || "-"}`
            const isStarting = startingAgentId === agent.id
            const isRestarting = restartingAgentId === agent.id
            const isStopping = stoppingAgentId === agent.id
            return (
              <article
                key={agent.id}
                className={
                  isRunning
                    ? "rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary"
                    : "rounded-[20px] bg-transparent px-4 py-3 text-muted-foreground opacity-58 transition-all hover:bg-secondary hover:opacity-78"
                }
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={isRunning ? "mt-0.5 rounded-full bg-emerald-500/12 p-2 text-emerald-700" : "mt-0.5 rounded-full bg-secondary/80 p-2 text-muted-foreground"}>
                      <BotIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className={isRunning ? "truncate text-[15px] font-semibold text-foreground" : "truncate text-[15px] font-semibold text-foreground/72"}>
                        {agent.name || "unknown-agent"}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">{agent.id}</div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
                    <span className={isRunning ? "inline-flex h-7 max-w-full items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-foreground/86" : "inline-flex h-7 max-w-full items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-foreground/62"}>
                      {executionChip}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`pid ${isRunning ? String(agent.daemonPid || "-") : "-"}`}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`port ${isRunning ? String(agent.port || "-") : "-"}`}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      {isRunning ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={dashboardIconButtonClass}
                            onClick={async () => {
                              try {
                                setRestartingAgentId(agent.id)
                                await Promise.resolve(onRestartAgent(agent.id))
                              } finally {
                                setRestartingAgentId("")
                              }
                            }}
                            disabled={isRestarting || isStopping}
                            aria-label="重启"
                            title="重启"
                          >
                            {isRestarting ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={dashboardDangerIconButtonClass}
                            onClick={() => {
                              void (async () => {
                                const confirmed = await confirm({
                                  title: "停止 Agent",
                                  description: `确认停止 "${agent.name || "unknown-agent"}"？停止前会检查当前是否有正在执行的 context 和 task。`,
                                  confirmText: "停止",
                                  confirmVariant: "destructive",
                                })
                                if (!confirmed) return
                                try {
                                  setStoppingAgentId(agent.id)
                                  await Promise.resolve(onStopAgent(agent.id))
                                } finally {
                                  setStoppingAgentId("")
                                }
                              })()
                            }}
                            disabled={isRestarting || isStopping}
                            aria-label="停止"
                            title="停止"
                          >
                            {isStopping ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={dashboardIconButtonClass}
                          disabled={isStarting || isRestarting || isStopping}
                          aria-label="启动"
                          title="启动"
                          onClick={async () => {
                            try {
                              setStartingAgentId(agent.id)
                              await Promise.resolve(onStartAgent(agent.id))
                            } finally {
                              setStartingAgentId("")
                            }
                          }}
                        >
                          {isStarting ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : resetDialog())}>
        <DialogContent className="w-[min(92vw,640px)] overflow-hidden border border-border/80 bg-[linear-gradient(180deg,rgba(250,250,250,0.98),rgba(246,247,249,0.98))] p-0 shadow-[0_28px_90px_rgba(15,23,42,0.14)]">
          <DialogHeader className="gap-3 border-b border-border/70 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-[16px] border border-foreground/8 bg-foreground/[0.03] p-2.5 text-foreground">
                <WandSparklesIcon className="size-4" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-[1.05rem] font-semibold tracking-[0.01em]">
                  初始化并启动 Agent
                </DialogTitle>
                <DialogDescription className="max-w-[46ch] text-[12px] leading-5 text-muted-foreground">
                  当前文件夹还没有完成 Downcity 初始化。确认后会补齐运行骨架，再把它接入 Console。
                </DialogDescription>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[18px] border border-border/75 bg-background/78 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Folder</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground" title={form.projectRoot || "-"}>
                  {deriveFolderName(form.projectRoot)}
                </div>
              </div>
              <div className="rounded-[18px] border border-border/75 bg-background/78 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Agent Name</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground" title={resolvedAgentName}>
                  {resolvedAgentName}
                </div>
              </div>
              <div className="rounded-[18px] border border-border/75 bg-background/78 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Execution</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground" title={runtimeLabel || "-"}>
                  {runtimeLabel || "-"}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="rounded-[22px] border border-border/75 bg-background/82 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Source Folder</div>
                  <div className="mt-1 text-sm font-medium text-foreground">选择要接入或编辑的项目目录</div>
                </div>
                <span className="inline-flex items-center rounded-full border border-border/70 bg-secondary/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                  step 1
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id="agent-project-root"
                  value={form.projectRoot}
                  placeholder="请选择目录"
                  readOnly
                  disabled
                  className="h-11 rounded-[14px] border-border/80 bg-secondary/55 px-3 font-mono text-[12px] text-foreground/88"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={dashboardIconButtonClass}
                  onClick={() => void pickDirectoryForDialog()}
                  disabled={pickingDirectory}
                  aria-label="选择目录"
                  title="选择目录"
                >
                  {pickingDirectory ? <Loader2Icon className="size-4 animate-spin" /> : <FolderOpenIcon className="size-4" />}
                </Button>
              </div>
              <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                已初始化目录会直接启动；未初始化目录会自动补齐 `PROFILE.md`、`SOUL.md` 和 `downcity.json`。
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="rounded-[22px] border border-border/75 bg-background/82 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Identity</div>
                    <div className="mt-1 text-sm font-medium text-foreground">确认这个文件夹在 Console 里的名称</div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-secondary/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                    step 2
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-name" className="text-[12px] font-medium text-foreground/82">Agent 名称</Label>
                  <Input
                    id="agent-name"
                    value={form.agentName}
                    placeholder={deriveFolderName(form.projectRoot)}
                    className="h-11 rounded-[14px] border-border/80 bg-background px-3 text-sm"
                    onChange={(event) => setForm((current) => ({ ...current, agentName: event.target.value }))}
                  />
                </div>
              </div>

              <div className="rounded-[22px] border border-border/75 bg-background/82 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Execution</div>
                    <div className="mt-1 text-sm font-medium text-foreground">统一选择 model 或 acp</div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-secondary/75 px-2.5 py-1 text-[11px] text-muted-foreground">
                    step 3
                  </span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-runtime" className="text-[12px] font-medium text-foreground/82">执行模式</Label>
                  <select
                    id="agent-runtime"
                    className="flex h-11 w-full rounded-[14px] border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={form.executionChoice}
                    onChange={(event) => setForm((current) => ({ ...current, executionChoice: event.target.value as AgentExecutionChoice }))}
                  >
                    <option value="model">Model</option>
                    <option value="kimi">ACP · Kimi</option>
                    <option value="claude">ACP · Claude</option>
                    <option value="codex">ACP · Codex</option>
                  </select>
                </div>
                {form.executionChoice === "model" ? (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="agent-model" className="text-[12px] font-medium text-foreground/82">模型 ID</Label>
                    <select
                      id="agent-model"
                      className="flex h-11 w-full rounded-[14px] border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                      value={form.modelId}
                      onChange={(event) => setForm((current) => ({ ...current, modelId: event.target.value }))}
                      disabled={activeModelOptions.length === 0}
                    >
                      {activeModelOptions.length === 0 ? (
                        <option value="">请先在 Global / Model 创建可用模型</option>
                      ) : null}
                      {activeModelOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {String(item.id || "").trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
                    将通过本机 ACP 命令启动 `{form.executionChoice}` coding agent。首次运行前请确认对应命令已安装。
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-[20px] border border-dashed border-border/85 bg-secondary/45 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">What Will Be Written</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[12px] text-foreground/78">
                <span className="rounded-full bg-background/85 px-2.5 py-1">`downcity.json.execution`</span>
                <span className="rounded-full bg-background/85 px-2.5 py-1">`PROFILE.md`</span>
                <span className="rounded-full bg-background/85 px-2.5 py-1">`SOUL.md`</span>
                <span className="rounded-full bg-background/85 px-2.5 py-1">`.downcity/*`</span>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 bg-background/74 px-5 py-4 sm:px-6 sm:justify-end">
            <Button type="button" variant="ghost" onClick={resetDialog} disabled={submittingDialog}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!canSubmitDialog || submittingDialog}
              className="min-w-[8.5rem] rounded-[14px] bg-foreground px-4 text-background hover:bg-foreground/92"
              onClick={async () => {
                try {
                  setSubmittingDialog(true)
                  const executionPayload =
                    form.executionChoice === "model"
                      ? { executionMode: "model" as const, modelId: form.modelId.trim() }
                      : { executionMode: "acp" as const, agentType: form.executionChoice }
                  await Promise.resolve(onStartAgentWithInitialization(
                    dialogTargetAgentId || form.projectRoot.trim(),
                    {
                      agentName: form.agentName.trim() || undefined,
                      ...executionPayload,
                    },
                  ))
                  resetDialog()
                } finally {
                  setSubmittingDialog(false)
                }
              }}
            >
              {submittingDialog ? <Loader2Icon className="size-4 animate-spin" /> : "初始化并启动"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
