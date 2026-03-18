/**
 * ContextOverview 配置辅助模块。
 *
 * 关键点（中文）
 * - 负责解析 channel configuration 元数据、生成 draft 与 patch。
 * - 把配置项展示组件抽离，降低主视图文件复杂度。
 */

import type {
  UiChannelAccountItem,
  UiChatChannelConfigurationDescriptor,
  UiChatChannelConfigurationField,
  UiChatChannelDetail,
  UiChatChannelStatus,
} from "@/types/Dashboard"

export type ChannelConfigDraft = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  return undefined
}

export function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined) return "-"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "-"
  if (typeof value === "string") {
    const text = value.trim()
    return text || "-"
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function toInputText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return ""
}

export function parseChannelDetail(channel: UiChatChannelStatus): UiChatChannelDetail | undefined {
  const detail = channel.detail
  return isRecord(detail) ? (detail as UiChatChannelDetail) : undefined
}

export function parseChannelConfigSummary(channel: UiChatChannelStatus): Record<string, unknown> {
  const detail = parseChannelDetail(channel)
  if (!detail) return {}
  const raw = detail.config
  return isRecord(raw) ? raw : {}
}

function normalizeFieldType(input: unknown): UiChatChannelConfigurationField["type"] {
  const raw = String(input || "").trim().toLowerCase()
  if (raw === "string" || raw === "boolean" || raw === "number" || raw === "secret" || raw === "enum") {
    return raw
  }
  return "string"
}

function normalizeFieldSource(input: unknown): UiChatChannelConfigurationField["source"] {
  const raw = String(input || "").trim().toLowerCase()
  if (raw === "ship_json" || raw === "bot_account" || raw === "env_fallback") {
    return raw
  }
  return "ship_json"
}

function normalizeFieldOptions(input: unknown): UiChatChannelConfigurationField["options"] {
  if (!Array.isArray(input)) return undefined
  const items = input
    .map((item) => {
      if (!isRecord(item)) return null
      const value = String(item.value || "").trim()
      if (!value) return null
      const label = String(item.label || value).trim() || value
      const description = String(item.description || "").trim()
      return {
        value,
        label,
        description,
      }
    })
    .filter((item): item is NonNullable<typeof item> => !!item)
  return items.length > 0 ? items : undefined
}

function normalizeField(input: unknown): UiChatChannelConfigurationField | null {
  if (!isRecord(input)) return null
  const key = String(input.key || "").trim()
  if (!key) return null
  const label = String(input.label || key).trim() || key
  const description = String(input.description || "").trim()
  const type = normalizeFieldType(input.type)
  return {
    key,
    label,
    description,
    type,
    source: normalizeFieldSource(input.source),
    required: input.required === true,
    nullable: input.nullable === true,
    writable: input.writable === true,
    restartRequired: input.restartRequired === true,
    defaultValue:
      typeof input.defaultValue === "string" ||
      typeof input.defaultValue === "number" ||
      typeof input.defaultValue === "boolean" ||
      input.defaultValue === null
        ? input.defaultValue
        : undefined,
    example:
      typeof input.example === "string" ||
      typeof input.example === "number" ||
      typeof input.example === "boolean" ||
      input.example === null
        ? input.example
        : undefined,
    options: normalizeFieldOptions(input.options),
  }
}

function normalizeFieldList(input: unknown): UiChatChannelConfigurationField[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => normalizeField(item))
    .filter((item): item is UiChatChannelConfigurationField => !!item)
}

export function parseChannelConfigurationDescriptor(channel: UiChatChannelStatus): UiChatChannelConfigurationDescriptor | null {
  const detail = parseChannelDetail(channel)
  if (!detail) return null
  const raw = detail.configuration
  if (!isRecord(raw)) return null

  const rawFields: Record<string, unknown> = isRecord(raw.fields) ? raw.fields : {}
  return {
    channel: String(raw.channel || channel.channel || "").trim(),
    title: String(raw.title || `${String(channel.channel || "").trim()} Configuration`).trim(),
    description: String(raw.description || "").trim(),
    version: String(raw.version || "1.0.0").trim(),
    capabilities: isRecord(raw.capabilities)
      ? {
          canToggleEnabled: raw.capabilities.canToggleEnabled === true,
          canBindChannelAccount: raw.capabilities.canBindChannelAccount === true,
          canConfigure: raw.capabilities.canConfigure === true,
        }
      : undefined,
    fields: {
      ship: normalizeFieldList(rawFields.ship),
      channelAccount: normalizeFieldList(rawFields.channelAccount),
      envFallback: normalizeFieldList(rawFields.envFallback),
    },
  }
}

function normalizeDraftValueForField(field: UiChatChannelConfigurationField, value: unknown): unknown {
  if (value === undefined || value === null) {
    if (value === null && field.nullable) return null
    if (field.defaultValue !== undefined) return field.defaultValue
    if (field.type === "boolean") return false
    return ""
  }

  if (field.type === "boolean") {
    return value === true || String(value).trim().toLowerCase() === "true"
  }

  if (field.type === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    const text = String(value || "").trim()
    return text
  }

  const text = String(value).trim()
  if (!text) {
    if (field.nullable) return null
    return ""
  }
  return text
}

function normalizeDraftFieldForPatch(field: UiChatChannelConfigurationField, value: unknown): string | number | boolean | null | undefined {
  if (field.type === "boolean") {
    const normalized = toOptionalBoolean(value)
    if (normalized !== undefined) return normalized
    return false
  }

  if (field.type === "number") {
    const text = String(value ?? "").trim()
    if (!text) return field.nullable ? null : undefined
    const parsed = Number(text)
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return undefined
    return parsed
  }

  const text = String(value ?? "").trim()
  if (!text) return field.nullable ? null : undefined
  return text
}

export function initDraftFromChannel(channel: UiChatChannelStatus): ChannelConfigDraft {
  const summary = parseChannelConfigSummary(channel)
  const descriptor = parseChannelConfigurationDescriptor(channel)
  const draft: ChannelConfigDraft = {}

  const shipFields = descriptor?.fields.ship || []
  const writableFields = shipFields.filter((field) => field.writable)
  for (const field of writableFields) {
    draft[field.key] = normalizeDraftValueForField(field, summary[field.key])
  }

  if (!descriptor && Object.prototype.hasOwnProperty.call(summary, "channelAccountId")) {
    draft.channelAccountId = String(summary.channelAccountId || "").trim()
  }

  return draft
}

export function buildConfigPatchFromDraft(params: {
  descriptor: UiChatChannelConfigurationDescriptor | null
  draft: ChannelConfigDraft
}): Record<string, unknown> {
  const { descriptor, draft } = params
  const patch: Record<string, unknown> = {}

  const writableFields = (descriptor?.fields.ship || []).filter((field) => field.writable)
  for (const field of writableFields) {
    if (!Object.prototype.hasOwnProperty.call(draft, field.key)) continue
    const normalizedValue = normalizeDraftFieldForPatch(field, draft[field.key])
    if (normalizedValue === undefined) continue
    patch[field.key] = normalizedValue
  }

  if (!descriptor && Object.prototype.hasOwnProperty.call(draft, "channelAccountId")) {
    const text = String(draft.channelAccountId || "").trim()
    patch.channelAccountId = text || null
  }

  return patch
}

function toTitleCase(input: string): string {
  const text = String(input || "").trim()
  if (!text) return ""
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function resolveSummaryConfiguredValue(summary: Record<string, unknown>, fieldKey: string): boolean | undefined {
  const lower = String(fieldKey || "").trim().toLowerCase()
  if (!lower) return undefined
  if (lower.includes("token")) return toOptionalBoolean(summary.botTokenConfigured)
  if (lower.includes("secret")) return toOptionalBoolean(summary.appSecretConfigured)
  if (lower.includes("appid") || lower.includes("app_id")) {
    return String(summary.appId || "").trim() ? true : false
  }
  return undefined
}

function resolveEnvFallbackSummaryKey(envKey: string): string | undefined {
  const key = String(envKey || "").trim().toUpperCase()
  if (!key) return undefined
  if (key.endsWith("_BOT_TOKEN")) return "botTokenConfigured"
  if (key.endsWith("_APP_SECRET")) return "appSecretConfigured"
  if (key.endsWith("_APP_ID")) return "appId"
  if (key.endsWith("_AUTH_ID")) return "authId"
  if (key.endsWith("_DOMAIN")) return "domain"
  if (key.endsWith("_SANDBOX")) return "sandbox"
  return undefined
}

export function resolveChannelAccountFieldDisplayValue(params: {
  field: UiChatChannelConfigurationField
  account?: UiChannelAccountItem
  summary: Record<string, unknown>
}): string {
  const { field, account, summary } = params

  if (account) {
    const accountRecord = account as unknown as Record<string, unknown>
    const direct = accountRecord[field.key]
    if (direct !== undefined && direct !== null && String(direct).trim() !== "") {
      return formatUnknownValue(direct)
    }

    const maskedKey = `${field.key}Masked`
    const masked = accountRecord[maskedKey]
    if (typeof masked === "string" && masked.trim()) {
      return masked
    }

    const hasKey = `has${toTitleCase(field.key)}`
    const hasValue = toOptionalBoolean(accountRecord[hasKey])
    if (hasValue !== undefined) {
      return hasValue ? "configured" : "not configured"
    }
  }

  if (Object.prototype.hasOwnProperty.call(summary, field.key)) {
    return formatUnknownValue(summary[field.key])
  }

  const configured = resolveSummaryConfiguredValue(summary, field.key)
  if (configured !== undefined) return configured ? "configured" : "not configured"
  return "-"
}

export function resolveEnvFallbackFieldDisplayValue(params: {
  field: UiChatChannelConfigurationField
  summary: Record<string, unknown>
}): string {
  const { field, summary } = params
  const summaryKey = resolveEnvFallbackSummaryKey(field.key)
  if (!summaryKey) return "not exposed"
  const value = summary[summaryKey]

  if (summaryKey.endsWith("Configured")) {
    const configured = toOptionalBoolean(value)
    if (configured === undefined) return "not exposed"
    return configured ? "configured" : "not configured"
  }

  if (field.type === "secret") {
    const configured = toOptionalBoolean(value)
    if (configured === undefined) return "not exposed"
    return configured ? "configured" : "not configured"
  }

  return formatUnknownValue(value)
}

export function ConfigMetaBadges(props: { field: UiChatChannelConfigurationField }) {
  const { field } = props
  const flags: string[] = []
  if (field.required) flags.push("required")
  if (field.nullable) flags.push("nullable")
  if (field.restartRequired) flags.push("restart")
  if (field.writable) flags.push("writable")
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{field.type}</span>
      {flags.map((flag) => (
        <span key={`${field.key}-${flag}`} className="rounded-full border border-border/80 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {flag}
        </span>
      ))}
    </div>
  )
}

export function ConfigFieldReadonly(props: {
  field: UiChatChannelConfigurationField
  value: string
}) {
  const { field, value } = props
  return (
    <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground" title={field.label}>{field.label}</div>
          <div className="mt-1 text-xs text-muted-foreground">{field.description || "-"}</div>
        </div>
        <ConfigMetaBadges field={field} />
      </div>
      <div className="break-all rounded-sm bg-background/80 px-2 py-1.5 font-mono text-xs text-foreground">{value}</div>
    </div>
  )
}
