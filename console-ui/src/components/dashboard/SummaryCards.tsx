/**
 * Agent 概览主视图。
 *
 * 关键点（中文）
 * - 使用统一的 DashboardModule 组织 Agent、Model、Services、Signals 四个主区块。
 * - Services 改为“每个 service 一个独立 section”，减少大容器内再分组的混杂感。
 * - 保留 agent、model、chat/task/context 等关键动作，但整体表达更极简。
 */

import * as React from "react"
import {
  ArrowRightIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
} from "lucide-react"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Button } from "@downcity/ui"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  UiAgentOption,
  UiChannelAccountItem,
  UiChatChannelStatus,
  UiConfigStatusItem,
  UiContextSummary,
  UiModelSummary,
  UiOverviewResponse,
  UiServiceItem,
  UiSkillSummaryItem,
  UiTaskItem,
} from "../../types/Dashboard"

export interface SummaryCardsProps {
  /**
   * 当前路由对应的 agent。
   */
  selectedAgent: UiAgentOption | null
  /**
   * 概览数据快照。
   */
  overview: UiOverviewResponse | null
  /**
   * service 列表快照。
   */
  services: UiServiceItem[]
  /**
   * skills 列表快照（来自 skill service 的 list）。
   */
  skills: UiSkillSummaryItem[]
  /**
   * task 列表快照。
   */
  tasks: UiTaskItem[]
  /**
   * context 列表（用于 chat overview 跳转）。
   */
  contexts: UiContextSummary[]
  /**
   * channel account 列表（用于显示当前绑定账号名称）。
   */
  channelAccounts: UiChannelAccountItem[]
  /**
   * consoleui channel 默认 context id。
   */
  consoleUiContextId: string
  /**
   * 配置状态列表。
   */
  configStatus: UiConfigStatusItem[]
  /**
   * 模型快照。
   */
  model: UiModelSummary | null
  /**
   * 切换 model.primary。
   */
  onSwitchModel: (primaryModelId: string) => void
  /**
   * 启动当前 agent。
   */
  onStartAgent: () => Promise<void> | void
  /**
   * 重启当前 agent。
   */
  onRestartAgent: () => Promise<void> | void
  /**
   * 停止当前 agent。
   */
  onStopAgent: () => Promise<void> | void
  /**
   * 打开 task 详情。
   */
  onOpenTask: (taskTitle: string) => void
  /**
   * 打开 context workspace。
   */
  onOpenContext: (contextId: string) => void
  /**
   * 控制 service 生命周期。
   */
  onControlService: (serviceName: string, action: string) => Promise<void> | void
  /**
   * chat channel 状态快照。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * 执行 chat channel 动作。
   */
  onChatAction: (
    action: "test" | "reconnect" | "open" | "close",
    channel: string,
  ) => Promise<void> | void
}

function formatLastRun(rawInput?: string): string {
  const raw = String(rawInput || "").trim()
  if (!raw) return "-"
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/)
  if (!match) return raw

  const [, y, m, d, hh, mm, ss, ms] = match
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    Number(ms),
  )
  if (Number.isNaN(date.getTime())) return raw

  const absolute = date.toLocaleString("zh-CN", { hour12: false })
  const deltaMs = Date.now() - date.getTime()
  if (!Number.isFinite(deltaMs)) return absolute
  if (deltaMs < 60_000) return `${absolute} · 刚刚`
  if (deltaMs < 3_600_000) return `${absolute} · ${Math.floor(deltaMs / 60_000)} 分钟前`
  if (deltaMs < 86_400_000) return `${absolute} · ${Math.floor(deltaMs / 3_600_000)} 小时前`
  return `${absolute} · ${Math.floor(deltaMs / 86_400_000)} 天前`
}

function KvRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3 py-2 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className="truncate text-foreground" title={props.value}>
        {props.value}
      </div>
    </div>
  )
}

function SurfaceTag(props: {
  children: React.ReactNode
  tone?: "default" | "success" | "danger"
}) {
  const toneClassName =
    props.tone === "success"
      ? "bg-emerald-500/8 text-emerald-700"
      : props.tone === "danger"
        ? "bg-destructive/8 text-destructive"
        : "bg-background/80 text-muted-foreground"
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] ${toneClassName}`}>
      {props.children}
    </span>
  )
}

function ServiceActionIcon(props: { action: string }) {
  if (props.action === "start" || props.action === "resume") return <PlayIcon className="size-3.5" />
  if (props.action === "pause") return <PauseIcon className="size-3.5" />
  if (props.action === "restart") return <RotateCwIcon className="size-3.5" />
  return <SquareIcon className="size-3.5" />
}

export function SummaryCards(props: SummaryCardsProps) {
  const {
    selectedAgent,
    overview,
    services,
    skills,
    tasks,
    contexts,
    channelAccounts,
    consoleUiContextId,
    configStatus,
    model,
    onSwitchModel,
    onStartAgent,
    onRestartAgent,
    onStopAgent,
    onOpenTask,
    onOpenContext,
    onControlService,
    chatChannels,
    onChatAction,
  } = props
  const confirm = useConfirmDialog()

  const overviewContexts = Array.isArray(overview?.contexts?.items) ? overview.contexts.items : []
  const consoleUiExists = overviewContexts.some((item) => item.contextId === consoleUiContextId)
  const chatProfiles = Array.isArray(selectedAgent?.chatProfiles) ? selectedAgent.chatProfiles : []
  const executingContexts = React.useMemo(
    () => contexts.filter((item) => item.executing === true),
    [contexts],
  )
  const agentExecuting = executingContexts.length > 0
  const agentConfigItems = configStatus.filter((item) => item.scope === "agent")
  const badConfigItems = agentConfigItems.filter(
    (item) => String(item.status || "").toLowerCase() !== "ok",
  )
  const memoryConfigItems = agentConfigItems.filter((item) => {
    const key = String(item.key || "").toLowerCase()
    const label = String(item.label || "").toLowerCase()
    const path = String(item.path || "").toLowerCase()
    return key.includes("memory") || label.includes("memory") || path.includes("/memory")
  })

  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : []
  const currentModelId = String(
    model?.agentPrimaryModelId || model?.primaryModelId || selectedAgent?.primaryModelId || "",
  ).trim()
  const [targetModelId, setTargetModelId] = React.useState(currentModelId)
  const [pendingAgentAction, setPendingAgentAction] = React.useState<"" | "start" | "restart" | "stop">("")
  const [pendingServiceActions, setPendingServiceActions] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    setTargetModelId(currentModelId)
  }, [currentModelId])

  const isServiceActionPending = React.useCallback(
    (key: string) => Boolean(pendingServiceActions[key]),
    [pendingServiceActions],
  )

  /**
   * 关键点（中文）：统一按 channel 建索引，方便渲染当前绑定账号与动作禁用态。
   */
  const chatStatusByChannel = React.useMemo(() => {
    const map = new Map<string, { enabled?: boolean; configured?: boolean; channelAccountId?: string }>()
    for (const item of chatChannels) {
      const channel = String(item.channel || "").trim().toLowerCase()
      if (!channel) continue
      const detail = item.detail
      const detailRecord =
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as Record<string, unknown>)
          : null
      const configRecord =
        detailRecord?.config &&
        typeof detailRecord.config === "object" &&
        !Array.isArray(detailRecord.config)
          ? (detailRecord.config as Record<string, unknown>)
          : null
      map.set(channel, {
        enabled: item.enabled,
        configured: item.configured,
        channelAccountId: String(configRecord?.channelAccountId || "").trim(),
      })
    }
    return map
  }, [chatChannels])

  /**
   * 关键点（中文）：account id 映射到可读名称，agent overview 直接显示当前账号名。
   */
  const channelAccountNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of channelAccounts) {
      const id = String(item.id || "").trim()
      if (!id) continue
      const label = String(item.name || item.id || "").trim() || id
      map.set(id, label)
    }
    return map
  }, [channelAccounts])

  /**
   * 关键点（中文）：补齐核心 service，避免后端缺项时 overview 整体断层。
   */
  const normalizedServices = React.useMemo(() => {
    const baseOrder = ["chat", "task", "skill", "memory", "context"]
    const mapByName = new Map<string, UiServiceItem>()
    for (const item of services) {
      const name = String(item.name || "").trim().toLowerCase()
      if (!name) continue
      if (!mapByName.has(name)) mapByName.set(name, item)
    }

    const merged: UiServiceItem[] = baseOrder.map((name) => {
      const hit = mapByName.get(name)
      if (hit) return hit
      return {
        name,
        state: "stopped",
      }
    })

    for (const [name, item] of mapByName.entries()) {
      if (baseOrder.includes(name)) continue
      merged.push(item)
    }
    return merged
  }, [services])

  const resolveContextIdByChatProfile = React.useCallback(
    (channelInput?: string): string => {
      const channel = String(channelInput || "").trim().toLowerCase()
      if (!channel) return ""
      const contextCandidates = contexts
        .map((item) => String(item.contextId || "").trim())
        .filter((contextId) => contextId.startsWith(`${channel}-`))
      if (contextCandidates.length === 0) return ""
      return contextCandidates[0] || ""
    },
    [contexts],
  )

  /**
   * 关键点（中文）：保持 service 动作集合足够小，只暴露高频操作。
   */
  const resolveServiceActions = React.useCallback((stateRaw: string): string[] => {
    const state = String(stateRaw || "").trim().toLowerCase()
    if (state === "running") return ["pause", "restart", "stop"]
    if (state === "paused") return ["resume", "restart", "stop"]
    if (state === "stopped" || state === "idle" || state === "unknown") return ["start", "restart"]
    return ["start", "restart", "stop"]
  }, [])

  if (!selectedAgent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 agent</div>
  }

  return (
    <section className="space-y-4">
      <DashboardModule
        title="Agent"
        actions={
          <>
            <SurfaceTag tone={selectedAgent.running ? "success" : "default"}>
              {selectedAgent.running ? "running" : "stopped"}
            </SurfaceTag>
            <SurfaceTag tone={agentExecuting ? "success" : "default"}>
              {agentExecuting ? `executing ${executingContexts.length}` : "idle"}
            </SurfaceTag>
            {selectedAgent.running ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className={dashboardIconButtonClass}
                  onClick={() => {
                    setPendingAgentAction("restart")
                    void Promise.resolve(onRestartAgent()).finally(() => setPendingAgentAction(""))
                  }}
                  disabled={pendingAgentAction !== ""}
                >
                  {pendingAgentAction === "restart" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RotateCwIcon className="size-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={dashboardDangerIconButtonClass}
                  onClick={() => {
                    void (async () => {
                      const confirmed = await confirm({
                        title: "停止 Agent",
                        description: `确认停止 "${selectedAgent.name || "unknown-agent"}"？`,
                        confirmText: "停止",
                        confirmVariant: "destructive",
                      })
                      if (!confirmed) return
                      setPendingAgentAction("stop")
                      void Promise.resolve(onStopAgent()).finally(() => setPendingAgentAction(""))
                    })()
                  }}
                  disabled={pendingAgentAction !== ""}
                >
                  {pendingAgentAction === "stop" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SquareIcon className="size-4" />
                  )}
                </Button>
              </>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className={dashboardIconButtonClass}
                onClick={() => {
                  setPendingAgentAction("start")
                  void Promise.resolve(onStartAgent()).finally(() => setPendingAgentAction(""))
                }}
                disabled={pendingAgentAction !== ""}
              >
                {pendingAgentAction === "start" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlayIcon className="size-4" />
                )}
              </Button>
            )}
          </>
        }
      >
        <div className="rounded-[18px] bg-secondary/85 p-2">
          <div className="rounded-[14px] bg-transparent px-3 py-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex items-start gap-3">
                <img
                  src="/image.png"
                  alt="bot"
                  className="size-9 shrink-0 rounded-[6px] object-cover"
                />
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-base font-medium text-foreground">
                    {selectedAgent.name || "-"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {selectedAgent.projectRoot || selectedAgent.id || "-"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-x-8 md:grid-cols-2">
              <div>
                <KvRow label="DC" value={String(overview?.cityVersion || "-")} />
                <KvRow label="PID" value={String(selectedAgent.daemonPid || "-")} />
                <KvRow label="Host" value={String(selectedAgent.host || "-")} />
              </div>
              <div>
                <KvRow
                  label="Port"
                  value={selectedAgent.port ? String(selectedAgent.port) : "-"}
                />
                <KvRow label="Path" value={String(selectedAgent.projectRoot || "-")} />
                <KvRow label="ID" value={String(selectedAgent.id || "-")} />
              </div>
            </div>
          </div>
        </div>
      </DashboardModule>

      <DashboardModule
        title="Model"
        actions={
          <>
            <SurfaceTag>{model?.providerType || "provider -"}</SurfaceTag>
            <SurfaceTag>{`available ${availableModels.length}`}</SurfaceTag>
          </>
        }
      >
        <div className="rounded-[18px] bg-secondary/85 p-2">
          <div className="rounded-[14px] bg-transparent px-3 py-3">
            <div className="grid gap-3 md:grid-cols-[6rem_minmax(0,1fr)] md:items-center">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Primary</div>
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
                    {targetModelId || "选择 model.primary"}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 min-w-[20rem]">
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
                            const nextModelId = String(modelId || "").trim()
                            setTargetModelId(nextModelId)
                            if (!nextModelId || nextModelId === currentModelId) return
                            onSwitchModel(nextModelId)
                          }}
                        >
                          {`${modelId} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                        </DropdownMenuItem>
                      )
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </DashboardModule>

      {normalizedServices.map((service, index) => {
            const name = String(service.name || service.service || `service-${index}`)
              .trim()
              .toLowerCase()
            const displayName = name === "skill" ? "skills" : name
            const state = String(service.state || service.status || "unknown")
              .trim()
              .toLowerCase()
            const serviceActions = resolveServiceActions(state)
            const isRunning = state === "running"
            const isError = state === "error" || state === "failed"
            const stateTagTone = isError ? "danger" : isRunning ? "success" : "default"

            const isTaskOverview = name.includes("task")
            const isChatOverview = name.includes("chat")
            const isSkillOverview = name.includes("skill")
            const isMemoryOverview = name.includes("memory")
            const isContextOverview = name.includes("context")

            const chatItems = isChatOverview
              ? chatProfiles.map((profile) => {
                  const channel = String(profile.channel || "-")
                  const link = String(profile.linkState || profile.statusText || "unknown")
                  const contextId = resolveContextIdByChatProfile(channel)
                  const status = chatStatusByChannel.get(channel.trim().toLowerCase())
                  const channelAccountId = String(status?.channelAccountId || "").trim()
                  const accountName = channelAccountId
                    ? String(channelAccountNameById.get(channelAccountId) || channelAccountId)
                    : "no binding"
                  return {
                    channel,
                    link,
                    contextId,
                    clickable: Boolean(contextId),
                    enabled: status?.enabled === true,
                    configured: status?.configured === true,
                    accountName,
                  }
                })
              : []

            const taskItems = isTaskOverview ? tasks.slice(0, 5) : []
            const skillItems = isSkillOverview ? skills.slice(0, 5) : []
            const contextItems = isContextOverview
              ? contexts.slice(0, 5).map((item) => String(item.contextId || "-"))
              : []

            const detailLines = isMemoryOverview
              ? memoryConfigItems.length > 0
                ? memoryConfigItems.map((item) => `${item.label} · ${item.status}`)
                : ["无 memory 配置"]
              : isContextOverview && contextItems.length === 0
                ? [`consoleui · ${consoleUiExists ? "ok" : "missing"}`]
                : !isTaskOverview && !isChatOverview && !isSkillOverview && !isContextOverview
                  ? ["无额外明细"]
                  : []

            return (
              <DashboardModule
                key={`${name}:${index}`}
                title={displayName}
                actions={
                  <>
                    <SurfaceTag tone={stateTagTone}>{state || "-"}</SurfaceTag>
                    <div className="flex items-center gap-1">
                      {serviceActions.map((action) => {
                        const pendingKey = `${name}:${action}`
                        return (
                          <button
                            key={pendingKey}
                            type="button"
                            className={
                              action === "stop"
                                ? `inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${dashboardDangerIconButtonClass}`
                                : `inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${dashboardIconButtonClass}`
                            }
                            disabled={isServiceActionPending(pendingKey)}
                            onClick={() => {
                              void (async () => {
                                if (action === "stop") {
                                  const confirmed = await confirm({
                                    title: "停止 Service",
                                    description: `确认停止 service「${displayName}」吗？`,
                                    confirmText: "停止",
                                    confirmVariant: "destructive",
                                  })
                                  if (!confirmed) return
                                }
                                setPendingServiceActions((prev) => ({ ...prev, [pendingKey]: true }))
                                void Promise.resolve(onControlService(name, action)).finally(() => {
                                  setPendingServiceActions((prev) => ({ ...prev, [pendingKey]: false }))
                                })
                              })()
                            }}
                            title={action}
                            aria-label={action}
                          >
                            {isServiceActionPending(pendingKey) ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <ServiceActionIcon action={action} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                }
              >
                <div className="rounded-[18px] bg-secondary/85 p-2">
                  <div className="space-y-3 rounded-[14px] bg-transparent px-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {service.description || service.name || service.service || "-"}
                      </div>
                    </div>

                  {isChatOverview && chatItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {chatItems.map((chatItem, chatIndex) => {
                        const normalizedChannel = String(chatItem.channel || "").trim()
                        const hasValidChannel =
                          Boolean(normalizedChannel) && normalizedChannel !== "-"
                        const runtimeActionDisabled =
                          !hasValidChannel || !(chatItem.enabled && chatItem.configured)
                        const openDisabled = !hasValidChannel || chatItem.enabled
                        const closeDisabled = !hasValidChannel || !chatItem.enabled
                        const openKey = `${name}:chat:${normalizedChannel}:open`
                        const closeKey = `${name}:chat:${normalizedChannel}:close`
                        const testKey = `${name}:chat:${normalizedChannel}:test`
                        const reconnectKey = `${name}:chat:${normalizedChannel}:reconnect`

                        return (
                          <div
                            key={`${name}:chat:${chatItem.channel}:${chatIndex}`}
                            className="flex flex-col gap-2 rounded-[12px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
                          >
                            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                              <div className="min-w-0">
                                <div className="truncate text-foreground">{chatItem.channel}</div>
                                <div className="truncate">{`${chatItem.link} · ${chatItem.accountName}`}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                  onClick={() => onOpenContext(chatItem.contextId)}
                                  disabled={!chatItem.clickable}
                                >
                                  context
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                  disabled={openDisabled || isServiceActionPending(openKey)}
                                  onClick={() => {
                                    setPendingServiceActions((prev) => ({ ...prev, [openKey]: true }))
                                    void Promise.resolve(onChatAction("open", normalizedChannel)).finally(() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [openKey]: false }))
                                    })
                                  }}
                                >
                                  {isServiceActionPending(openKey) ? (
                                    <Loader2Icon className="size-3 animate-spin" />
                                  ) : null}
                                  <span>open</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                  disabled={closeDisabled || isServiceActionPending(closeKey)}
                                  onClick={() => {
                                    setPendingServiceActions((prev) => ({ ...prev, [closeKey]: true }))
                                    void Promise.resolve(onChatAction("close", normalizedChannel)).finally(() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [closeKey]: false }))
                                    })
                                  }}
                                >
                                  {isServiceActionPending(closeKey) ? (
                                    <Loader2Icon className="size-3 animate-spin" />
                                  ) : null}
                                  <span>close</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                  disabled={runtimeActionDisabled || isServiceActionPending(testKey)}
                                  onClick={() => {
                                    setPendingServiceActions((prev) => ({ ...prev, [testKey]: true }))
                                    void Promise.resolve(onChatAction("test", normalizedChannel)).finally(() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [testKey]: false }))
                                    })
                                  }}
                                >
                                  {isServiceActionPending(testKey) ? (
                                    <Loader2Icon className="size-3 animate-spin" />
                                  ) : null}
                                  <span>test</span>
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-7 items-center rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                  disabled={runtimeActionDisabled || isServiceActionPending(reconnectKey)}
                                  onClick={() => {
                                    setPendingServiceActions((prev) => ({
                                      ...prev,
                                      [reconnectKey]: true,
                                    }))
                                    void Promise.resolve(onChatAction("reconnect", normalizedChannel)).finally(() => {
                                      setPendingServiceActions((prev) => ({
                                        ...prev,
                                        [reconnectKey]: false,
                                      }))
                                    })
                                  }}
                                >
                                  {isServiceActionPending(reconnectKey) ? (
                                    <Loader2Icon className="size-3 animate-spin" />
                                  ) : null}
                                  <span>reconnect</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {isTaskOverview && taskItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {taskItems.map((task, taskIndex) => {
                        const title = String(task.title || `task-${taskIndex}`).trim()
                        const status = String(task.status || "unknown").trim().toLowerCase()
                        return (
                          <div
                            key={`${name}:task:${title}:${taskIndex}`}
                            className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-foreground">{title}</div>
                              <div className="truncate">{`${status} · ${formatLastRun(task.lastRunTimestamp)}`}</div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-7 items-center gap-1 rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground"
                              onClick={() => onOpenTask(title)}
                            >
                              <span>open</span>
                              <ArrowRightIcon className="size-3 shrink-0" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}

                  {isSkillOverview && skillItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {skillItems.map((item, skillIndex) => (
                        <div
                          key={`${name}:skill:${item.id || item.name || skillIndex}`}
                          className="rounded-[12px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
                        >
                          <div className="truncate text-foreground">{item.name || item.id || "-"}</div>
                          <div className="truncate">
                            {`${item.source || "-"} · ${
                              Array.isArray(item.allowedTools) && item.allowedTools.length > 0
                                ? item.allowedTools.join(", ")
                                : "-"
                            }`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {isContextOverview && contextItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {contextItems.map((contextId) => (
                        <div
                          key={`${name}:context:${contextId}`}
                          className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
                        >
                          <div className="min-w-0 truncate">{contextId}</div>
                          <button
                            type="button"
                            className="inline-flex h-7 items-center gap-1 rounded-[10px] px-2.5 transition-colors hover:bg-secondary hover:text-foreground"
                            onClick={() => onOpenContext(contextId)}
                          >
                            <span>open</span>
                            <ArrowRightIcon className="size-3 shrink-0" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {detailLines.length > 0 ? (
                    <div className="space-y-1">
                      {detailLines.map((line, lineIndex) => (
                        <div
                          key={`${name}:detail:${lineIndex}`}
                          className="truncate rounded-[12px] px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-background"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              </DashboardModule>
            )
          })}

      <DashboardModule
        title="Signals"
        actions={
          <SurfaceTag tone={badConfigItems.length > 0 ? "danger" : "default"}>
            {`issues ${badConfigItems.length}`}
          </SurfaceTag>
        }
      >
        <div className="rounded-[18px] bg-secondary/85 p-2">
          {badConfigItems.length > 0 ? (
            badConfigItems.map((item) => (
              <div
                key={`${item.key}:${item.path}`}
                className="rounded-[14px] bg-transparent px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-background"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-foreground">{item.label}</div>
                  <span className="text-xs text-destructive">{item.status}</span>
                </div>
                <div className="mt-1 truncate text-xs" title={item.reason || item.path}>
                  {item.reason || item.path || "-"}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[14px] bg-transparent px-3 py-6 text-sm text-muted-foreground">
              当前没有异常信号
            </div>
          )}
        </div>
      </DashboardModule>
    </section>
  )
}
