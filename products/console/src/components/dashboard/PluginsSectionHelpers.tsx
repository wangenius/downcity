/**
 * Plugin Section 类型、状态计算与表单 payload helper。
 *
 * 关键点（中文）
 * - 将 PluginsSection.tsx 的纯 helper 拆出，主组件只保留状态编排和 JSX。
 * - helper 不访问组件内部 state，方便后续继续补测试。
 */

import * as React from "react"
import { Loader2Icon } from "lucide-react"
import type {
  UiPluginActionExecutionResult,
  UiPluginActionItem,
  UiPluginRuntimeItem,
  UiPluginSetupDefinition,
  UiPluginSetupField,
  UiPluginSetupFieldOption,
  UiPluginUsageDefinition,
  UiPluginUsageField,
  UiPluginUsageFieldOption,
} from "../../types/Dashboard"

export type PendingActionKind =
  | "toggle"
  | "status"
  | "doctor"
  | "setup"
  | "usage"
  | "setupOptions"
  | "usageOptions"

export type EditorDraftValue = string | boolean

export type EditorDraftState = Record<string, EditorDraftValue>

export type SetupOptionsState = Record<string, UiPluginSetupFieldOption[]>

export type UsageOptionsState = Record<string, UiPluginUsageFieldOption[]>

export type PluginsSectionBaseProps = {
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
       * 当前选中 agent 的项目 id。
       */
      selectedAgentProjectId?: string
    })

export function hasAction(actionItems: UiPluginActionItem[], actionName: string): boolean {
  return actionItems.some((item) => String(item.name || "").trim() === actionName)
}

export function getSnapshotMode(item: UiPluginRuntimeItem): "enabled" | "disabled" | "attention" {
  const raw = String(item.state || "").trim().toLowerCase()
  if (raw === "disabled") return "disabled"
  if (raw === "available") return "enabled"
  return "attention"
}

export function getSnapshotEnabled(item: UiPluginRuntimeItem): boolean {
  return getSnapshotMode(item) !== "disabled"
}

export function getCardTone(mode: "enabled" | "disabled" | "attention"): {
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

export function ToolAction(props: {
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

export function normalizeSetupDraft(
  setup: UiPluginSetupDefinition | undefined,
  data: unknown,
): EditorDraftState {
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

  const next: EditorDraftState = {}
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

export function extractSetupOptions(
  field: UiPluginSetupField,
  data: unknown,
): UiPluginSetupFieldOption[] {
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

export function buildSetupPayload(
  setup: UiPluginSetupDefinition | undefined,
  draft: EditorDraftState,
): Record<string, unknown> {
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

export function getPrimaryActionLabel(mode: UiPluginSetupDefinition["mode"], needsAttention: boolean): string {
  if (mode === "install") return needsAttention ? "修复安装" : "重新安装"
  if (mode === "configure") return "保存配置"
  return needsAttention ? "修复并更新配置" : "更新安装配置"
}

export function normalizeUsageDraft(
  usage: UiPluginUsageDefinition | undefined,
  data: unknown,
): EditorDraftState {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const plugin =
    payload?.plugin && typeof payload.plugin === "object"
      ? (payload.plugin as Record<string, unknown>)
      : payload

  const next: EditorDraftState = {}
  for (const field of usage?.fields || []) {
    const raw = plugin?.[field.key]
    if (field.type === "boolean") {
      next[field.key] = raw === true
      continue
    }
    if (typeof raw === "string" && raw.trim()) {
      next[field.key] = raw.trim()
      continue
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      next[field.key] = String(raw)
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

export function extractUsageOptions(
  field: UiPluginUsageField,
  data: unknown,
): UiPluginUsageFieldOption[] {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const optionRows = Array.isArray(payload?.options)
    ? payload.options
    : Array.isArray(payload?.models)
      ? payload.models
      : []
  const options: UiPluginUsageFieldOption[] = []

  for (const item of optionRows) {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null
    const value = String(row?.value || row?.id || "").trim()
    if (!value) continue
    options.push({
      label: String(row?.label || value).trim() || value,
      value,
      description: String(row?.description || row?.hint || "").trim() || undefined,
    })
  }

  return options
}

export function buildUsagePayload(
  usage: UiPluginUsageDefinition | undefined,
  draft: EditorDraftState,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of usage?.fields || []) {
    const value = draft[field.key]
    if (field.type === "boolean") {
      payload[field.key] = value === true
      continue
    }
    const text = typeof value === "string" ? value.trim() : ""
    if (!text) continue
    if (field.type === "number") {
      const parsed = Number(text)
      if (Number.isFinite(parsed)) {
        payload[field.key] = parsed
      }
      continue
    }
    payload[field.key] = text
  }
  return payload
}
