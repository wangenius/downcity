/**
 * Plugin 状态与 setup 区。
 *
 * 关键点（中文）
 * - 插件卡片层只保留状态、主动作和少量辅助动作。
 * - 安装/配置统一走 plugin 自己声明的 setup schema。
 * - setup 字段当前严格限制为 `select` / `checkbox`，避免 UI 再退回到自由输入。
 */

import * as React from "react"
import {
  ChevronDownIcon,
  Loader2Icon,
  PowerIcon,
  RefreshCcwIcon,
  SearchIcon,
  Settings2Icon,
  WrenchIcon,
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
import { DashboardModule } from "./DashboardModule"
import { useConfirmDialog } from "../ui/confirm-dialog"
import { cn } from "@/lib/utils"
import type {
  UiPluginActionExecutionResult,
  UiPluginActionItem,
  UiPluginRuntimeItem,
  UiPluginSetupDefinition,
  UiPluginSetupField,
  UiPluginSetupFieldOption,
} from "../../types/Dashboard"

type PendingActionKind = "toggle" | "status" | "doctor" | "setup" | "options"

type SetupDraftValue = string | boolean

type SetupDraftState = Record<string, SetupDraftValue>

type SetupOptionsState = Record<string, UiPluginSetupFieldOption[]>

type PluginsSectionBaseProps = {
  /**
   * plugin 列表。
   */
  plugins: UiPluginRuntimeItem[]
  /**
   * 时间格式化（保留签名，供上层兼容）。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 状态映射（保留签名，供上层兼容）。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 运行 plugin action。
   */
  onRunAction: (
    pluginName: string,
    actionName: string,
    payload?: Record<string, unknown>,
  ) => Promise<UiPluginActionExecutionResult>
}

export type PluginsSectionProps =
  | (PluginsSectionBaseProps & {
      /**
       * 页面作用域。
       */
      scope: "global"
    })
  | (PluginsSectionBaseProps & {
      /**
       * 页面作用域。
       */
      scope: "agent"
      /**
       * 当前是否存在运行中的 agent。
       */
      hasRunningAgent: boolean
      /**
       * 当前选中 agent 的展示名。
       */
      selectedAgentName?: string
    })

function hasAction(actionItems: UiPluginActionItem[], actionName: string): boolean {
  return actionItems.some((item) => String(item.name || "").trim() === actionName)
}

function getSnapshotMode(item: UiPluginRuntimeItem): "enabled" | "disabled" | "attention" {
  const raw = String(item.state || "").trim().toLowerCase()
  if (raw === "disabled") return "disabled"
  if (raw === "available") return "enabled"
  return "attention"
}

function getSnapshotEnabled(item: UiPluginRuntimeItem): boolean {
  return getSnapshotMode(item) !== "disabled"
}

function getCardTone(mode: "enabled" | "disabled" | "attention"): {
  cardClass: string
  badgeLabel: string
  badgeClass: string
  dotClass: string
} {
  if (mode === "enabled") {
    return {
      cardClass: "border-border/70 bg-background",
      badgeLabel: "Enabled",
      badgeClass: "bg-emerald-500/10 text-emerald-700",
      dotClass: "bg-emerald-600",
    }
  }
  if (mode === "disabled") {
    return {
      cardClass: "border-border/65 bg-[color-mix(in_oklab,var(--background)_96%,var(--secondary)_4%)]",
      badgeLabel: "Disabled",
      badgeClass: "bg-secondary text-muted-foreground",
      dotClass: "bg-muted-foreground/45",
    }
  }
  return {
    cardClass: "border-amber-200/80 bg-[color-mix(in_oklab,var(--background)_95%,oklch(0.95_0.02_85)_5%)]",
    badgeLabel: "Setup required",
    badgeClass: "bg-amber-500/10 text-amber-700",
    dotClass: "bg-amber-500",
  }
}

function ToolAction(props: {
  icon: React.ReactNode
  label: string
  loading: boolean
  disabled?: boolean
  tone?: "default" | "danger"
  onClick: () => void
}) {
  const { icon, label, loading, disabled = false, tone = "default", onClick } = props

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        tone === "danger"
          ? "text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          : "text-muted-foreground hover:border-border/60 hover:bg-background hover:text-foreground"
      }`}
    >
      {loading ? <Loader2Icon className="size-3.5 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  )
}

function normalizeSetupDraft(setup: UiPluginSetupDefinition | undefined, data: unknown): SetupDraftState {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const plugin =
    payload?.plugin && typeof payload.plugin === "object"
      ? (payload.plugin as Record<string, unknown>)
      : null
  const transcriber =
    payload?.transcriber && typeof payload.transcriber === "object"
      ? (payload.transcriber as Record<string, unknown>)
      : null
  const source = {
    ...(plugin || {}),
    ...(transcriber || {}),
  }

  const next: SetupDraftState = {}
  for (const field of setup?.fields || []) {
    const raw = source[field.key]
    if (field.type === "checkbox") {
      next[field.key] = raw === true
      continue
    }
    if (typeof raw === "string" && raw.trim()) {
      next[field.key] = raw.trim()
      continue
    }
    if (Array.isArray(field.options) && field.options.length > 0) {
      next[field.key] = field.options[0].value
      continue
    }
    next[field.key] = ""
  }
  return next
}

function extractSetupOptions(field: UiPluginSetupField, data: unknown): UiPluginSetupFieldOption[] {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const optionRows = Array.isArray(payload?.options)
    ? payload.options
    : Array.isArray(payload?.models)
      ? payload.models
      : []
  const options: UiPluginSetupFieldOption[] = []

  for (const item of optionRows) {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null
    const value = String(row?.value || row?.id || "").trim()
    if (!value) continue
    options.push({
      label: String(row?.label || value).trim() || value,
      value,
      hint: String(row?.hint || row?.description || "").trim() || undefined,
    })
  }

  return options
}

function buildSetupPayload(setup: UiPluginSetupDefinition | undefined, draft: SetupDraftState): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of setup?.fields || []) {
    const value = draft[field.key]
    if (field.type === "checkbox") {
      payload[field.key] = value === true
      continue
    }
    if (typeof value === "string" && value.trim()) {
      payload[field.key] = value.trim()
    }
  }
  if (setup?.primaryAction === "install") {
    const modelId = typeof payload.modelId === "string" ? payload.modelId : ""
    if (modelId) {
      payload.modelIds = [modelId]
      payload.activeModel = modelId
    }
  }
  return payload
}

function getPrimaryActionLabel(mode: UiPluginSetupDefinition["mode"], needsAttention: boolean): string {
  if (mode === "install") return needsAttention ? "修复安装" : "重新安装"
  if (mode === "configure") return "保存配置"
  return needsAttention ? "修复并更新配置" : "更新安装配置"
}

export function PluginsSection(props: PluginsSectionProps) {
  const { scope, plugins, onRunAction } = props
  const hasRunningAgent = scope === "agent" ? props.hasRunningAgent : false
  const selectedAgentName = scope === "agent" ? props.selectedAgentName : undefined
  const confirm = useConfirmDialog()
  const [search, setSearch] = React.useState("")
  const [pendingActions, setPendingActions] = React.useState<Record<string, PendingActionKind | null>>({})
  const [enabledOverrides, setEnabledOverrides] = React.useState<Record<string, boolean | undefined>>({})
  const [expandedItems, setExpandedItems] = React.useState<Record<string, boolean>>({})
  const [setupDrafts, setSetupDrafts] = React.useState<Record<string, SetupDraftState>>({})
  const [setupOptions, setSetupOptions] = React.useState<Record<string, SetupOptionsState>>({})
  const [setupLogs, setSetupLogs] = React.useState<Record<string, string[]>>({})
  const [installerPluginName, setInstallerPluginName] = React.useState("")

  React.useEffect(() => {
    setEnabledOverrides((current) => {
      let changed = false
      const next = { ...current }
      for (const plugin of plugins) {
        const key = String(plugin.name || "").trim()
        if (!key) continue
        const override = next[key]
        if (override === undefined) continue
        if (override === getSnapshotEnabled(plugin)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [plugins])

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return plugins.filter((item) => {
      if (!query) return true
      return (
        String(item.name || "").toLowerCase().includes(query) ||
        String(item.title || "").toLowerCase().includes(query) ||
        String(item.description || "").toLowerCase().includes(query)
      )
    })
  }, [plugins, search])

  const summary = React.useMemo(() => {
    let enabled = 0
    let disabled = 0
      let attention = 0
      for (const item of filtered) {
        const mode = getSnapshotMode(item)
        if (mode === "enabled") enabled += 1
        else if (mode === "disabled") disabled += 1
        else attention += 1
      }
      return { enabled, disabled, attention }
    }, [filtered])

  const installerPlugin = React.useMemo(
    () => plugins.find((item) => String(item.name || "").trim() === installerPluginName) || null,
    [plugins, installerPluginName],
  )

  const executeAction = React.useCallback(
    async (
      pluginName: string,
      pendingKind: PendingActionKind,
      actionName: string,
      payload?: Record<string, unknown>,
    ) => {
      const startedAt = Date.now()
      setPendingActions((current) => ({
        ...current,
        [pluginName]: pendingKind,
      }))

      try {
        const result = await onRunAction(pluginName, actionName, payload)
        if (Array.isArray(result?.logs)) {
          setSetupLogs((current) => ({
            ...current,
            [pluginName]: result.logs || [],
          }))
        }
        if (pendingKind === "toggle") {
          const targetEnabled = actionName === "on"
          if (result.success) {
            setEnabledOverrides((current) => ({
              ...current,
              [pluginName]: targetEnabled,
            }))
          }
          const elapsed = Date.now() - startedAt
          if (elapsed < 220) {
            await new Promise((resolve) => window.setTimeout(resolve, 220 - elapsed))
          }
        }
        return result
      } finally {
        setPendingActions((current) => ({
          ...current,
          [pluginName]: null,
        }))
      }
    },
    [onRunAction],
  )

  const syncSetupState = React.useCallback(
    async (plugin: UiPluginRuntimeItem) => {
      const pluginName = String(plugin.name || "").trim()
      const actionItems = Array.isArray(plugin.config?.actions) ? plugin.config?.actions : []
      const setup = plugin.config?.setup
      if (!pluginName || !setup) return

      if (setup.statusAction && hasAction(actionItems, setup.statusAction)) {
        const result = await executeAction(pluginName, "status", setup.statusAction)
        if (result?.success) {
          setSetupDrafts((current) => ({
            ...current,
            [pluginName]: {
              ...(current[pluginName] || {}),
              ...normalizeSetupDraft(setup, result.data),
            },
          }))
        }
      }

      for (const field of setup.fields) {
        if (!field.sourceAction || !hasAction(actionItems, field.sourceAction)) continue
        const result = await executeAction(pluginName, "options", field.sourceAction)
        if (!result?.success) continue
        const options = extractSetupOptions(field, result.data)
        setSetupOptions((current) => ({
          ...current,
          [pluginName]: {
            ...(current[pluginName] || {}),
            [field.key]: options,
          },
        }))
        setSetupDrafts((current) => {
          const draft = { ...(current[pluginName] || {}) }
          if (
            field.type === "select" &&
            typeof draft[field.key] !== "string" &&
            options.length > 0
          ) {
            draft[field.key] = options[0].value
          }
          if (field.type === "select" && !(draft[field.key] as string) && options.length > 0) {
            draft[field.key] = options[0].value
          }
          return {
            ...current,
            [pluginName]: draft,
          }
        })
      }
    },
    [executeAction],
  )

  const openInstaller = React.useCallback(
    (plugin: UiPluginRuntimeItem) => {
      const pluginName = String(plugin.name || "").trim()
      if (!pluginName || !plugin.config?.setup) return
      setInstallerPluginName(pluginName)
      setSetupLogs((current) => ({
        ...current,
        [pluginName]: [],
      }))
      void syncSetupState(plugin)
    },
    [syncSetupState],
  )

  const closeInstaller = React.useCallback(() => {
    setInstallerPluginName("")
  }, [])

  const setSetupField = React.useCallback(
    (pluginName: string, fieldKey: string, value: SetupDraftValue) => {
      setSetupDrafts((current) => ({
        ...current,
        [pluginName]: {
          ...(current[pluginName] || {}),
          [fieldKey]: value,
        },
      }))
    },
    [],
  )

  const runSetupAction = React.useCallback(async () => {
    if (!installerPlugin?.config?.setup) return
    const pluginName = String(installerPlugin.name || "").trim()
    const setup = installerPlugin.config.setup
    const draft = setupDrafts[pluginName] || {}
    const payload = buildSetupPayload(setup, draft)
    const setupActionName = setup.primaryAction
    const result = await executeAction(pluginName, "setup", setupActionName, payload)
    if (!result?.logs?.length) {
      setSetupLogs((current) => ({
        ...current,
        [pluginName]: [result?.success ? "操作完成" : result?.message || "操作失败"],
      }))
    }
    if (setup.statusAction) {
      await syncSetupState(installerPlugin)
    }
    closeInstaller()
  }, [closeInstaller, executeAction, installerPlugin, setupDrafts, syncSetupState])

  return (
    <>
      <DashboardModule
        title="Plugins"
        description={`enabled ${summary.enabled} · disabled ${summary.disabled}${summary.attention > 0 ? ` · attention ${summary.attention}` : ""}`}
        bodyClassName="min-h-0 overflow-y-auto"
        actions={
          <div className="relative w-[220px]">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 plugin"
              className="pl-9"
            />
          </div>
        }
      >
        {scope === "agent" && !hasRunningAgent && filtered.length === 0 ? (
          <div className="rounded-[18px] border border-border/70 bg-secondary/45 px-4 py-6 text-sm text-muted-foreground">
            {selectedAgentName
              ? `${selectedAgentName} 当前未运行，Console UI 无法读取 runtime plugins。先启动 agent 再查看。`
              : "当前没有运行中的 agent，Console UI 无法读取 runtime plugins。先启动 agent 再查看。"}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[18px] border border-border/70 bg-secondary/45 px-4 py-6 text-sm text-muted-foreground">
            当前没有匹配的 plugin。
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const name = String(item.name || "unknown").trim() || "unknown"
              const title = String(item.title || name).trim() || name
              const description = String(item.description || "").trim()
              const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
              const setup = item.config?.setup
              const snapshotMode = getSnapshotMode(item)
              const effectiveEnabled = enabledOverrides[name] ?? getSnapshotEnabled(item)
              const pending = pendingActions[name] || null
              const toggleLoading = pending === "toggle"
              const statusLoading = pending === "status"
              const doctorLoading = pending === "doctor"
              const setupLoading = pending === "setup"
              const optionsLoading = pending === "options"
              const canRunStatus = hasAction(actionItems, "status")
              const canRunDoctor = hasAction(actionItems, "doctor")
              const canRunOn = hasAction(actionItems, "on")
              const canRunOff = hasAction(actionItems, "off")
              const canToggle = canRunOn || canRunOff
              const tone = getCardTone(
                effectiveEnabled
                  ? snapshotMode === "attention"
                    ? "attention"
                    : "enabled"
                  : "disabled",
              )
              const reasons = Array.isArray(item.availability?.reasons) ? item.availability?.reasons : []
              const availabilityMessage = reasons
                .map((entry) => String(entry || "").trim())
                .filter(Boolean)
                .join(" · ")
              const expanded = expandedItems[name] === true
              const pipelineItems = Array.isArray(item.pipelines) ? item.pipelines : []
              const guardItems = Array.isArray(item.guards) ? item.guards : []
              const effectItems = Array.isArray(item.effects) ? item.effects : []
              const resolveItems = Array.isArray(item.resolves) ? item.resolves : []
              const actionNames = actionItems.map((entry) => String(entry.name || "").trim()).filter(Boolean)

              return (
                <article
                  key={name}
                  className={cn(
                    "rounded-[20px] border px-4 py-4 shadow-[0_1px_0_rgba(17,17,19,0.02)] transition-colors",
                    tone.cardClass,
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex size-2 rounded-full", tone.dotClass)} />
                        <div className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                          {title}
                        </div>
                        <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground">
                          {name}
                        </span>
                        <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[11px]", tone.badgeClass)}>
                          {tone.badgeLabel}
                        </span>
                      </div>

                      {description ? (
                        <div className="mt-2 max-w-3xl text-[13px] leading-6 text-foreground/70">
                          {description}
                        </div>
                      ) : null}

                      {availabilityMessage ? (
                        <div className="mt-3 text-[12px] leading-5 text-muted-foreground">
                          {availabilityMessage}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-full bg-secondary/70 p-1 lg:justify-end">
                      {scope === "agent" && setup ? (
                        <ToolAction
                          icon={<Settings2Icon className="size-3.5" />}
                          label={snapshotMode === "attention" ? "修复" : "配置"}
                          loading={setupLoading || optionsLoading}
                          disabled={toggleLoading || statusLoading || doctorLoading}
                          onClick={() => openInstaller(item)}
                        />
                      ) : null}

                      {scope === "agent" && canRunStatus ? (
                        <ToolAction
                          icon={<RefreshCcwIcon className="size-3.5" />}
                          label="同步"
                          loading={statusLoading}
                          disabled={toggleLoading || doctorLoading || setupLoading || optionsLoading}
                          onClick={() => {
                            void executeAction(name, "status", "status")
                          }}
                        />
                      ) : null}

                      {scope === "global" && canToggle ? (
                        <ToolAction
                          icon={<PowerIcon className="size-3.5" />}
                          label={effectiveEnabled ? "停用" : "启用"}
                          loading={toggleLoading}
                          disabled={statusLoading || doctorLoading || setupLoading || optionsLoading}
                          tone={effectiveEnabled ? "danger" : "default"}
                          onClick={() => {
                            const nextAction = effectiveEnabled ? "off" : "on"
                            if (nextAction === "off") {
                              void (async () => {
                                const confirmed = await confirm({
                                  title: "关闭 Plugin",
                                  description: `确认关闭 "${name}"？`,
                                  confirmText: "关闭",
                                  confirmVariant: "destructive",
                                })
                                if (!confirmed) return
                                await executeAction(name, "toggle", "off")
                              })()
                              return
                            }
                            void executeAction(name, "toggle", "on")
                          }}
                        />
                      ) : null}

                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:bg-background hover:text-foreground"
                        onClick={() =>
                          setExpandedItems((current) => ({
                            ...current,
                            [name]: !expanded,
                          }))
                        }
                      >
                        <ChevronDownIcon className={cn("size-3.5 transition-transform", expanded ? "rotate-180" : "")} />
                        <span>{expanded ? "收起" : "详情"}</span>
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="mt-4 border-t border-border/60 pt-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-3">
                          <div>
                            <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                              Hooks
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {[...pipelineItems, ...guardItems, ...effectItems, ...resolveItems].length > 0 ? (
                                <>
                                  {pipelineItems.map((entry) => (
                                    <span key={`${name}:pipeline:${entry}`} className="inline-flex rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82">
                                      {`pipeline · ${entry}`}
                                    </span>
                                  ))}
                                  {guardItems.map((entry) => (
                                    <span key={`${name}:guard:${entry}`} className="inline-flex rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82">
                                      {`guard · ${entry}`}
                                    </span>
                                  ))}
                                  {effectItems.map((entry) => (
                                    <span key={`${name}:effect:${entry}`} className="inline-flex rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82">
                                      {`effect · ${entry}`}
                                    </span>
                                  ))}
                                  {resolveItems.map((entry) => (
                                    <span key={`${name}:resolve:${entry}`} className="inline-flex rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82">
                                      {`resolve · ${entry}`}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                <span className="text-[12px] text-muted-foreground">未声明额外 hooks。</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                              Actions
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {actionNames.length > 0 ? (
                                actionNames.map((entry) => (
                                  <span key={`${name}:action:${entry}`} className="inline-flex rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82">
                                    {entry}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[12px] text-muted-foreground">未暴露额外 actions。</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {scope === "agent" && canRunDoctor ? (
                          <div className="flex items-start">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-[12px] px-3"
                              disabled={toggleLoading || statusLoading || setupLoading || optionsLoading}
                              onClick={() => {
                                void executeAction(name, "doctor", "doctor")
                              }}
                            >
                              {doctorLoading ? <Loader2Icon className="size-3.5 animate-spin" /> : <WrenchIcon className="size-3.5" />}
                              <span>Doctor</span>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <Dialog
        open={Boolean(installerPlugin)}
        onOpenChange={(open) => {
          if (!open) closeInstaller()
        }}
      >
        <DialogContent className="w-[min(92vw,560px)] overflow-hidden border border-border/75 bg-background p-0 shadow-[0_24px_72px_rgba(17,17,19,0.12)]">
          {installerPlugin?.config?.setup ? (
            <>
              <DialogHeader className="border-b border-border/60 px-5 py-4">
                <DialogTitle>{installerPlugin.config.setup.title}</DialogTitle>
                <DialogDescription className="max-w-[40ch] text-[12px] leading-5 text-muted-foreground">
                  {installerPlugin.config.setup.description || "使用统一 setup 流程完成插件安装或配置。"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 px-5 py-5">
                {(() => {
                  const pluginName = String(installerPlugin.name || "").trim()
                  const setup = installerPlugin.config?.setup
                  const busy =
                    pendingActions[pluginName] === "setup" ||
                    pendingActions[pluginName] === "status" ||
                    pendingActions[pluginName] === "options"
                  const mode = getSnapshotMode(installerPlugin)
                  const reasons = Array.isArray(installerPlugin.availability?.reasons)
                    ? installerPlugin.availability?.reasons
                    : []
                  const draft = setupDrafts[pluginName] || {}
                  const optionMap = setupOptions[pluginName] || {}
                  const logs = setupLogs[pluginName] || []

                  return (
                    <>
                      <div className="rounded-[16px] bg-secondary/55 px-4 py-3">
                        <div className="text-sm font-medium text-foreground">
                          {String(installerPlugin.title || pluginName)}
                        </div>
                        <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                          {mode === "attention"
                            ? reasons.join(" · ") || "当前插件需要修复或补全运行环境。"
                            : "当前插件已可用，可在这里更新配置。"}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {setup.fields.map((field) => {
                          if (field.type === "checkbox") {
                            return (
                              <label
                                key={`${pluginName}:field:${field.key}`}
                                className="flex items-center gap-2 rounded-[14px] bg-secondary/55 px-3 py-2 text-[12px] text-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={draft[field.key] === true}
                                  onChange={(event) => setSetupField(pluginName, field.key, event.target.checked)}
                                />
                                <span>{field.label}</span>
                              </label>
                            )
                          }

                          const options = Array.isArray(optionMap[field.key]) && optionMap[field.key].length > 0
                            ? optionMap[field.key]
                            : Array.isArray(field.options)
                              ? field.options
                              : []
                          const currentValue =
                            typeof draft[field.key] === "string"
                              ? String(draft[field.key] || "")
                              : options[0]?.value || ""

                          return (
                            <div key={`${pluginName}:field:${field.key}`} className="space-y-2">
                              <Label htmlFor={`${pluginName}:${field.key}`}>{field.label}</Label>
                              <select
                                id={`${pluginName}:${field.key}`}
                                value={currentValue}
                                onChange={(event) => setSetupField(pluginName, field.key, event.target.value)}
                                className="flex h-10 w-full rounded-[14px] border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                              >
                                {options.map((option) => (
                                  <option key={`${pluginName}:${field.key}:${option.value}`} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {options.find((option) => option.value === currentValue)?.hint ? (
                                <div className="text-[12px] text-muted-foreground">
                                  {options.find((option) => option.value === currentValue)?.hint}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>

                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          安装日志
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-[14px] border border-border/70 bg-secondary/35 px-3 py-2 font-mono text-[11px] leading-5 text-foreground/82">
                          {busy ? <div>正在执行，请稍候...</div> : null}
                          {logs.length > 0 ? (
                            logs.map((line, index) => (
                              <div key={`${pluginName}:log:${index}`}>{line}</div>
                            ))
                          ) : !busy ? (
                            <div className="text-muted-foreground">执行完成后会在这里显示安装过程与错误信息。</div>
                          ) : null}
                        </div>
                      </div>

                      <DialogFooter className="border-t border-border/60 px-0 pt-4 sm:justify-end">
                        <Button type="button" variant="outline" onClick={closeInstaller} disabled={busy}>
                          取消
                        </Button>
                        <Button
                          type="button"
                          disabled={
                            busy ||
                            setup.fields.some((field) => {
                              if (field.required !== true) return false
                              if (field.type === "checkbox") return false
                              return !String(setupDrafts[pluginName]?.[field.key] || "").trim()
                            })
                          }
                          onClick={() => void runSetupAction()}
                        >
                          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                          <span>{getPrimaryActionLabel(setup.mode, mode === "attention")}</span>
                        </Button>
                      </DialogFooter>
                    </>
                  )
                })()}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
