/**
 * Global 作用域的 agent 管理页。
 *
 * 关键点（中文）
 * - 在同一列表中统一承载“创建 / 启动 / 初始化并启动 / 重启 / 停止”。
 * - 初始化动作只在用户显式触发时执行，避免误覆盖现有项目配置。
 * - 新建与初始化共用同一弹窗表单，减少维护分叉。
 */

import * as React from "react"
import {
  BotIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RotateCwIcon,
  SquareIcon,
  WandSparklesIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UiAgentCreatePayload, UiAgentOption, UiModelPoolItem } from "@/types/Dashboard"

type AgentDialogMode = "create" | "initialize"

type AgentFormState = {
  projectRoot: string
  agentName: string
  primaryModelId: string
}

function createEmptyForm(defaultModelId: string): AgentFormState {
  return {
    projectRoot: "",
    agentName: "",
    primaryModelId: defaultModelId,
  }
}

export interface GlobalAgentsSectionProps {
  /**
   * 当前可用 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前可用模型池。
   */
  modelPoolItems: UiModelPoolItem[]
  /**
   * 新建 agent。
   */
  onCreateAgent: (input: UiAgentCreatePayload) => void
  /**
   * 打开系统目录选择器。
   */
  onPickAgentDirectory: () => Promise<string>
  /**
   * 重启运行中的 agent。
   */
  onRestartAgent: (agentId: string) => void
  /**
   * 停止运行中的 agent。
   */
  onStopAgent: (agentId: string) => void
  /**
   * 启动历史 agent。
   */
  onStartAgent: (agentId: string) => void
  /**
   * 初始化并启动 agent。
   */
  onStartAgentWithInitialization: (agentId: string, input: {
    agentName?: string
    primaryModelId: string
  }) => void
}

export function GlobalAgentsSection(props: GlobalAgentsSectionProps) {
  const {
    agents,
    modelPoolItems,
    onCreateAgent,
    onPickAgentDirectory,
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
  const [dialogMode, setDialogMode] = React.useState<AgentDialogMode>("create")
  const [dialogTargetAgentId, setDialogTargetAgentId] = React.useState("")
  const [pickingDirectory, setPickingDirectory] = React.useState(false)
  const activeModelOptions = React.useMemo(
    () => modelPoolItems.filter((item) => item.isPaused !== true),
    [modelPoolItems],
  )
  const defaultModelId = React.useMemo(
    () => String(activeModelOptions[0]?.id || modelPoolItems[0]?.id || "").trim(),
    [activeModelOptions, modelPoolItems],
  )
  const [form, setForm] = React.useState<AgentFormState>(() => createEmptyForm(defaultModelId))
  const [submittingDialog, setSubmittingDialog] = React.useState(false)

  React.useEffect(() => {
    setForm((current) => {
      if (current.primaryModelId) return current
      if (!defaultModelId) return current
      return {
        ...current,
        primaryModelId: defaultModelId,
      }
    })
  }, [defaultModelId])

  const resetDialog = React.useCallback(() => {
    setDialogOpen(false)
    setDialogMode("create")
    setDialogTargetAgentId("")
    setSubmittingDialog(false)
    setForm(createEmptyForm(defaultModelId))
  }, [defaultModelId])

  const openCreateDialog = React.useCallback(() => {
    setDialogMode("create")
    setDialogTargetAgentId("")
    setForm(createEmptyForm(defaultModelId))
    setDialogOpen(true)
  }, [defaultModelId])

  const openInitializeDialog = React.useCallback((agent: UiAgentOption) => {
    setDialogMode("initialize")
    setDialogTargetAgentId(agent.id)
    setForm({
      projectRoot: String(agent.projectRoot || agent.id || "").trim(),
      agentName: String(agent.name || "").trim(),
      primaryModelId: String(agent.primaryModelId || defaultModelId || "").trim(),
    })
    setDialogOpen(true)
  }, [defaultModelId])

  const pickDirectory = React.useCallback(async () => {
    try {
      setPickingDirectory(true)
      const nextPath = await onPickAgentDirectory()
      if (!nextPath) return
      setForm((current) => ({ ...current, projectRoot: nextPath }))
    } finally {
      setPickingDirectory(false)
    }
  }, [onPickAgentDirectory])

  const canSubmitDialog =
    Boolean(String(form.projectRoot || "").trim()) &&
    Boolean(String(form.primaryModelId || "").trim()) &&
    activeModelOptions.length > 0

  return (
    <section className="min-h-0 overflow-y-auto">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{`agent ${agents.length}`}</div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={dashboardIconButtonClass}
          onClick={openCreateDialog}
          aria-label="新建 Agent"
          title="新建 Agent"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-[20px] bg-secondary px-4 py-5 text-sm text-muted-foreground">暂无 agent，点击右上角 + 新建</div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => {
            const isRunning = agent.running === true
            const primaryModelId = String(agent.primaryModelId || "")
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
                      {primaryModelId || "-"}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`pid ${isRunning ? String(agent.daemonPid || "-") : "-"}`}
                    </span>
                    <span className={isRunning ? "inline-flex h-7 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground" : "inline-flex h-7 items-center rounded-full bg-secondary/75 px-2.5 font-mono text-[11px] text-muted-foreground"}>
                      {`port ${isRunning ? String(agent.port || "-") : "-"}`}
                    </span>
                    {isRunning ? (
                      <div className="ml-auto flex items-center gap-1.5">
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
                      </div>
                    ) : (
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={dashboardIconButtonClass}
                          disabled={isStarting || isRestarting || isStopping}
                          aria-label="初始化并启动"
                          title="初始化并启动"
                          onClick={() => openInitializeDialog(agent)}
                        >
                          <WandSparklesIcon className="size-4" />
                        </Button>
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
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : resetDialog())}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "新建 Agent" : "初始化并启动 Agent"}</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {dialogMode === "create"
                ? "创建新的 agent 项目骨架，并立即启动到 Console UI。"
                : "当目标目录还没完成初始化时，可以在启动前补齐 PROFILE.md、ship.json 和 .ship 结构。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-project-root">项目路径</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="agent-project-root"
                  value={form.projectRoot}
                  placeholder="请选择目录"
                  readOnly
                  disabled
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={dashboardIconButtonClass}
                  onClick={() => void pickDirectory()}
                  disabled={dialogMode === "initialize" || pickingDirectory}
                  aria-label="选择目录"
                  title="选择目录"
                >
                  {pickingDirectory ? <Loader2Icon className="size-4 animate-spin" /> : <FolderOpenIcon className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-name">Agent 名称</Label>
              <Input
                id="agent-name"
                value={form.agentName}
                placeholder="my-agent"
                onChange={(event) => setForm((current) => ({ ...current, agentName: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agent-model">主模型</Label>
              <select
                id="agent-model"
                className="flex h-10 w-full rounded-[12px] border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.primaryModelId}
                onChange={(event) => setForm((current) => ({ ...current, primaryModelId: event.target.value }))}
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

          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={resetDialog} disabled={submittingDialog}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!canSubmitDialog || submittingDialog}
              onClick={async () => {
                try {
                  setSubmittingDialog(true)
                  if (dialogMode === "create") {
                    await Promise.resolve(onCreateAgent({
                      projectRoot: form.projectRoot.trim(),
                      agentName: form.agentName.trim() || undefined,
                      primaryModelId: form.primaryModelId.trim(),
                      autoStart: true,
                    }))
                  } else {
                    await Promise.resolve(onStartAgentWithInitialization(
                      dialogTargetAgentId || form.projectRoot.trim(),
                      {
                        agentName: form.agentName.trim() || undefined,
                        primaryModelId: form.primaryModelId.trim(),
                      },
                    ))
                  }
                  resetDialog()
                } finally {
                  setSubmittingDialog(false)
                }
              }}
            >
              {submittingDialog ? <Loader2Icon className="size-4 animate-spin" /> : dialogMode === "create" ? "创建并启动" : "初始化并启动"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
