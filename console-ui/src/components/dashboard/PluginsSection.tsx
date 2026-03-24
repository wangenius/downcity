/**
 * Plugin 状态卡片区。
 *
 * 关键点（中文）
 * - 这一区域把 plugin 当成“状态卡片”，不是命令面板。
 * - toggle 负责启用态切换；status / doctor 是辅助检查工具。
 * - UI 采用“本地即时切换 + 后台刷新校准”的模型，避免状态延迟感。
 */

import * as React from "react"
import { ActivityIcon, ChevronDownIcon, Loader2Icon, WrenchIcon } from "lucide-react"
import { DashboardModule } from "./DashboardModule"
import { useConfirmDialog } from "../ui/confirm-dialog"
import { Input } from "../ui/input"
import type {
  UiPluginActionExecutionResult,
  UiPluginActionItem,
  UiPluginRuntimeItem,
} from "../../types/Dashboard"

type PendingActionKind = "toggle" | "status" | "doctor"

export interface PluginsSectionProps {
  /**
   * plugin 列表。
   */
  plugins: UiPluginRuntimeItem[]
  /**
   * 当前是否存在运行中的 agent。
   */
  hasRunningAgent: boolean
  /**
   * 当前选中 agent 的展示名。
   */
  selectedAgentName?: string
  /**
   * 时间格式化（保留签名，供上层兼容）。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 状态映射（保留签名，供上层兼容）。
   */
  statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad"
  /**
   * 运行无需额外参数的 plugin action。
   */
  onRunAction: (
    pluginName: string,
    actionName: string,
  ) => Promise<UiPluginActionExecutionResult>
}

function hasAction(actionItems: UiPluginActionItem[], actionName: string): boolean {
  return actionItems.some((item) => String(item.name || "").trim() === actionName)
}

function getSnapshotMode(item: UiPluginRuntimeItem): "enabled" | "disabled" | "unavailable" {
  const raw = String(item.state || "").trim().toLowerCase()
  if (raw === "disabled") return "disabled"
  if (raw === "available") return "enabled"
  return "unavailable"
}

function getSnapshotEnabled(item: UiPluginRuntimeItem): boolean {
  return getSnapshotMode(item) !== "disabled"
}

function getCardTone(mode: "enabled" | "disabled" | "unavailable"): {
  cardClass: string
  badgeLabel: string
  badgeClass: string
  dotClass: string
} {
  if (mode === "enabled") {
    return {
      cardClass:
        "border-border/55 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_96%,var(--secondary)_4%)_0%,var(--background)_100%)] hover:border-border/70",
      badgeLabel: "Enabled",
      badgeClass: "bg-emerald-500/10 text-emerald-700",
      dotClass: "bg-emerald-600",
    }
  }
  if (mode === "disabled") {
    return {
      cardClass:
        "border-border/50 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_98%,var(--secondary)_2%)_0%,color-mix(in_oklab,var(--background)_95%,var(--secondary)_5%)_100%)] hover:border-border/65",
      badgeLabel: "Disabled",
      badgeClass: "border border-border/60 bg-background text-muted-foreground",
      dotClass: "bg-muted-foreground/35",
    }
  }
  return {
    cardClass:
      "border-amber-200/70 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_97%,oklch(0.92_0.02_85)_3%)_0%,color-mix(in_oklab,var(--background)_93%,oklch(0.92_0.02_85)_7%)_100%)] hover:border-amber-300/70",
    badgeLabel: "Unavailable",
    badgeClass: "bg-amber-500/10 text-amber-700",
    dotClass: "bg-amber-500",
  }
}

function PluginSwitch(props: {
  checked: boolean
  syncing: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const { checked, syncing, disabled = false, onClick } = props

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || syncing}
      aria-busy={syncing}
      aria-pressed={checked}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-all disabled:pointer-events-none disabled:opacity-50 ${
        checked
          ? "border-foreground/10 bg-foreground/80"
          : "border-border/70 bg-secondary"
      } ${syncing ? "shadow-[0_0_0_3px_rgba(24,119,242,0.08)]" : ""}`}
    >
      {syncing ? (
        <span className="absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute inset-y-0 left-[-35%] w-[55%] animate-[plugin-switch-glide_0.9s_linear_infinite] rounded-full bg-white/18" />
        </span>
      ) : null}
      <span
        className={`absolute flex size-[18px] items-center justify-center rounded-full bg-background shadow-sm transition-transform ${
          checked ? "translate-x-[1.15rem]" : "translate-x-[0.2rem]"
        }`}
      >
        {syncing ? <Loader2Icon className="size-2.5 animate-spin text-foreground/70" /> : null}
      </span>
    </button>
  )
}

function ToolAction(props: {
  icon: React.ReactNode
  label: string
  loading: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const { icon, label, loading, disabled = false, onClick } = props

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border/60 hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {loading ? <Loader2Icon className="size-3.5 animate-spin" /> : icon}
      <span>{label}</span>
    </button>
  )
}

export function PluginsSection(props: PluginsSectionProps) {
  const { plugins, hasRunningAgent, selectedAgentName, onRunAction } = props
  const confirm = useConfirmDialog()
  const [search, setSearch] = React.useState("")
  const [pendingActions, setPendingActions] = React.useState<Record<string, PendingActionKind | null>>({})
  const [enabledOverrides, setEnabledOverrides] = React.useState<Record<string, boolean | undefined>>({})
  const [expandedItems, setExpandedItems] = React.useState<Record<string, boolean>>({})

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
      return String(item.name || "").toLowerCase().includes(query)
    })
  }, [plugins, search])

  const summary = React.useMemo(() => {
    let enabled = 0
    let disabled = 0
    let unavailable = 0
    for (const item of filtered) {
      const mode = getSnapshotMode(item)
      if (mode === "enabled") enabled += 1
      else if (mode === "disabled") disabled += 1
      else unavailable += 1
    }
    return { enabled, disabled, unavailable }
  }, [filtered])

  const executeAction = React.useCallback(
    async (pluginName: string, pendingKind: PendingActionKind, actionName: string) => {
      const startedAt = Date.now()
      setPendingActions((current) => ({
        ...current,
        [pluginName]: pendingKind,
      }))

      try {
        const result = await onRunAction(pluginName, actionName)

        if (pendingKind === "toggle") {
          const targetEnabled = actionName === "on"
          if (result.success) {
            setEnabledOverrides((current) => ({
              ...current,
              [pluginName]: targetEnabled,
            }))
          }
          const elapsed = Date.now() - startedAt
          if (elapsed < 260) {
            await new Promise((resolve) => window.setTimeout(resolve, 260 - elapsed))
          }
          return
        }
      } finally {
        setPendingActions((current) => ({
          ...current,
          [pluginName]: null,
        }))
      }
    },
    [onRunAction],
  )

  return (
    <DashboardModule
      title="Plugins"
      description={`enabled ${summary.enabled} · disabled ${summary.disabled}${summary.unavailable > 0 ? ` · unavailable ${summary.unavailable}` : ""}`}
      bodyClassName="min-h-0 overflow-y-auto"
      actions={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索 plugin"
          className="w-[220px]"
        />
      }
    >
      {!hasRunningAgent && filtered.length === 0 ? (
        <div className="rounded-[18px] bg-secondary px-4 py-6 text-sm text-muted-foreground">
          {selectedAgentName
            ? `${selectedAgentName} 当前未运行，Console UI 无法读取 runtime plugins。先启动 agent 再查看。`
            : "当前没有运行中的 agent，Console UI 无法读取 runtime plugins。先启动 agent 再查看。"}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[18px] bg-secondary px-4 py-6 text-sm text-muted-foreground">
          当前运行中的 agent 没有可展示的 plugin。
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const name = String(item.name || "unknown").trim() || "unknown"
            const title = String(item.title || name).trim() || name
            const actionItems = Array.isArray(item.config?.actions) ? item.config?.actions : []
            const description = String(item.description || "").trim()
            const snapshotMode = getSnapshotMode(item)
            const snapshotEnabled = getSnapshotEnabled(item)
            const effectiveEnabled = enabledOverrides[name] ?? snapshotEnabled
            const pending = pendingActions[name] || null
            const toggleLoading = pending === "toggle"
            const statusLoading = pending === "status"
            const doctorLoading = pending === "doctor"
            const canRunStatus = hasAction(actionItems, "status")
            const canRunDoctor = hasAction(actionItems, "doctor")
            const canRunOn = hasAction(actionItems, "on")
            const canRunOff = hasAction(actionItems, "off")
            const canToggle = canRunOn || canRunOff
            const tone = getCardTone(
              effectiveEnabled
                ? snapshotMode === "unavailable"
                  ? "unavailable"
                  : "enabled"
                : "disabled",
            )
            const reasons = Array.isArray(item.availability?.reasons) ? item.availability?.reasons : []
            const availabilityMessage =
              snapshotMode === "unavailable"
                ? reasons.filter((entry) => String(entry || "").trim()).join("; ")
                : ""
            const expanded = expandedItems[name] === true
            const pipelineItems = Array.isArray(item.pipelines) ? item.pipelines : []
            const guardItems = Array.isArray(item.guards) ? item.guards : []
            const effectItems = Array.isArray(item.effects) ? item.effects : []
            const resolveItems = Array.isArray(item.resolves) ? item.resolves : []
            const requiredAssets = Array.isArray(item.requiredAssets) ? item.requiredAssets : []

            return (
              <article
                key={name}
                className={`rounded-[24px] border px-5 py-4 shadow-[0_1px_0_rgba(17,17,19,0.02)] transition-all ${tone.cardClass}`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex shrink-0 flex-col items-center">
                        <div className={`size-2.5 rounded-full ${tone.dotClass}`} />
                        <div className="mt-2 h-full min-h-10 w-px bg-border/55" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-[16px] font-semibold tracking-[-0.02em] text-foreground">{title}</div>
                          <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 font-mono text-[11px] text-muted-foreground">
                            {name}
                          </span>
                          <span className={`inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] ${tone.badgeClass}`}>
                            {tone.badgeLabel}
                          </span>
                          {toggleLoading ? (
                            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-[11px] font-medium text-primary">
                              <Loader2Icon className="size-3 animate-spin" />
                              <span>Updating</span>
                            </span>
                          ) : null}
                        </div>
                        {description ? (
                          <div className="mt-1 max-w-2xl text-[13px] leading-6 text-foreground/72">{description}</div>
                        ) : null}
                        {availabilityMessage ? (
                          <div className="mt-3 rounded-[14px] bg-amber-500/8 px-3 py-2 text-[12px] leading-5 text-amber-700">
                            {availabilityMessage}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-full bg-secondary/70 p-1 lg:justify-end">
                    <div className="flex items-center gap-1">
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
                        <ChevronDownIcon
                          className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                        <span>{expanded ? "Hide details" : "Show details"}</span>
                      </button>
                      {canRunStatus ? (
                          <ToolAction
                            icon={<ActivityIcon className="size-3.5" />}
                            label="Status"
                            loading={statusLoading}
                            disabled={toggleLoading || doctorLoading}
                            onClick={() => {
                              void executeAction(name, "status", "status")
                            }}
                          />
                        ) : null}
                      {canRunDoctor ? (
                          <ToolAction
                            icon={<WrenchIcon className="size-3.5" />}
                            label="Doctor"
                            loading={doctorLoading}
                            disabled={toggleLoading || statusLoading}
                            onClick={() => {
                              void executeAction(name, "doctor", "doctor")
                            }}
                          />
                        ) : null}
                    </div>
                    {canToggle ? (
                      <div className="ml-1 flex items-center pl-1">
                        <PluginSwitch
                          checked={effectiveEnabled}
                          syncing={toggleLoading}
                          disabled={statusLoading || doctorLoading}
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
                      </div>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-4 border-t border-border/55 pt-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div>
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Hooks
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {pipelineItems.map((entry) => (
                            <span
                              key={`${name}:pipeline:${entry}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {`pipeline · ${entry}`}
                            </span>
                          ))}
                          {guardItems.map((entry) => (
                            <span
                              key={`${name}:guard:${entry}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {`guard · ${entry}`}
                            </span>
                          ))}
                          {effectItems.map((entry) => (
                            <span
                              key={`${name}:effect:${entry}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {`effect · ${entry}`}
                            </span>
                          ))}
                          {resolveItems.map((entry) => (
                            <span
                              key={`${name}:resolve:${entry}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {`resolve · ${entry}`}
                            </span>
                          ))}
                          {pipelineItems.length === 0 &&
                          guardItems.length === 0 &&
                          effectItems.length === 0 &&
                          resolveItems.length === 0 ? (
                            <span className="text-[12px] text-muted-foreground">No hooks declared.</span>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Capabilities
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {requiredAssets.map((entry) => (
                            <span
                              key={`${name}:asset:${entry}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {entry}
                            </span>
                          ))}
                          {actionItems.map((entry) => (
                            <span
                              key={`${name}:action:${String(entry.name || "unknown")}`}
                              className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground/82"
                            >
                              {String(entry.name || "unknown")}
                            </span>
                          ))}
                          {requiredAssets.length === 0 && actionItems.length === 0 ? (
                            <span className="text-[12px] text-muted-foreground">
                              No additional capabilities exposed.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </DashboardModule>
  )
}
