/**
 * GlobalModelSection 表单类型与 UI action helper。
 *
 * 关键点（中文）
 * - 将 provider/model 表单类型、模型发现命名和按钮 helper 从主组件拆出。
 * - 主组件继续只负责状态编排与渲染。
 */

import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
import type {
  UiModelPoolItem,
  UiModelProviderDiscoverResult,
  UiModelProviderItem,
  UiModelSummary,
} from "@/types/Dashboard"

export const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "open-compatible",
  "open-responses",
  "moonshot-cn",
  "moonshot-ai",
  "kimi-code",
  "xai",
  "huggingface",
  "openrouter",
] as const

export type ProviderFormState = {
  id: string
  type: string
  baseUrl: string
  apiKey: string
  hasExistingApiKey: boolean
  apiKeyMasked: string
}

export type ModelFormState = {
  id: string
  providerId: string
  name: string
  temperature: string
  maxTokens: string
  topP: string
  frequencyPenalty: string
  presencePenalty: string
  anthropicVersion: string
}

export interface GlobalModelSectionProps {
  model: UiModelSummary | null
  providers: UiModelProviderItem[]
  poolItems: UiModelPoolItem[]
  loading: boolean
  onUpsertProvider: (input: {
    id: string
    type: string
    baseUrl?: string
    apiKey?: string
    clearBaseUrl?: boolean
    clearApiKey?: boolean
  }) => Promise<void> | void
  onRemoveProvider: (providerId: string) => Promise<void> | void
  onTestProvider: (providerId: string) => Promise<void> | void
  onDiscoverProvider: (params: {
    providerId: string
    autoAdd?: boolean
    prefix?: string
  }) => Promise<UiModelProviderDiscoverResult | null> | UiModelProviderDiscoverResult | null
  onUpsertModel: (input: {
    id: string
    providerId: string
    name: string
    temperature?: string
    maxTokens?: string
    topP?: string
    frequencyPenalty?: string
    presencePenalty?: string
    anthropicVersion?: string
    isPaused?: boolean
  }) => Promise<void> | void
  onRemoveModel: (modelId: string) => Promise<void> | void
  onPauseModel: (modelId: string, isPaused: boolean) => Promise<void> | void
  onTestModel: (modelId: string, prompt?: string) => Promise<void> | void
}

export function formatTime(raw?: string): string {
  const text = String(raw || "").trim()
  if (!text) return "-"
  const t = Date.parse(text)
  if (!Number.isFinite(t) || Number.isNaN(t)) return "-"
  return new Date(t).toLocaleString("zh-CN", { hour12: false })
}

export function normalizeDiscoverName(raw?: string): string {
  return String(raw || "").trim()
}

export function buildDiscoverTargetModelId(remoteName: string, prefix: string): string {
  return prefix ? `${prefix}${remoteName}` : remoteName
}

export function HeaderAction(props: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${dashboardIconButtonClass}`}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      title={props.label}
      aria-label={props.label}
    >
      {props.loading ? <Loader2Icon className="size-4 animate-spin" /> : props.icon}
    </button>
  )
}

export function RowAction(props: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50 ${
        props.danger ? dashboardDangerIconButtonClass : dashboardIconButtonClass
      }`}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      title={props.label}
      aria-label={props.label}
    >
      {props.loading ? <Loader2Icon className="size-3.5 animate-spin" /> : props.icon}
    </button>
  )
}
