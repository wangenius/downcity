/**
 * Global 作用域模型管理页（简化重构版）。
 *
 * 关键点（中文）
 * - 顺序布局：Summary -> Providers -> Models。
 * - 所有异步 action 都提供 loading 显示与禁用态。
 * - discover 采用“先发现，再勾选添加”的两步交互。
 */

import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import type {
  UiModelPoolItem,
  UiModelProviderDiscoverResult,
  UiModelProviderItem,
  UiModelSummary,
} from "@/types/Dashboard"

const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "open-compatible",
  "open-responses",
  "moonshot",
  "xai",
  "huggingface",
  "openrouter",
] as const

type ProviderFormState = {
  id: string
  type: string
  baseUrl: string
  apiKey: string
  hasExistingApiKey: boolean
  apiKeyMasked: string
}

type ModelFormState = {
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

function formatTime(raw?: string): string {
  const text = String(raw || "").trim()
  if (!text) return "-"
  const t = Date.parse(text)
  if (!Number.isFinite(t) || Number.isNaN(t)) return "-"
  return new Date(t).toLocaleString("zh-CN", { hour12: false })
}

function HeaderAction(props: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      title={props.label}
      aria-label={props.label}
    >
      {props.loading ? <Loader2Icon className="size-4 animate-spin" /> : props.icon}
    </button>
  )
}

function RowAction(props: {
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
      className={`inline-flex h-6 w-6 items-center justify-center rounded-sm hover:bg-foreground/15 ${
        props.danger ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"
      } disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      title={props.label}
      aria-label={props.label}
    >
      {props.loading ? <Loader2Icon className="size-3.5 animate-spin" /> : props.icon}
    </button>
  )
}

export function GlobalModelSection(props: GlobalModelSectionProps) {
  const {
    model,
    providers,
    poolItems,
    loading,
    onUpsertProvider,
    onRemoveProvider,
    onTestProvider,
    onDiscoverProvider,
    onUpsertModel,
    onRemoveModel,
    onPauseModel,
    onTestModel,
  } = props
  const confirm = useConfirmDialog()

  const [providerForm, setProviderForm] = React.useState<ProviderFormState>({
    id: "",
    type: "openai",
    baseUrl: "",
    apiKey: "",
    hasExistingApiKey: false,
    apiKeyMasked: "",
  })
  const [modelForm, setModelForm] = React.useState<ModelFormState>({
    id: "",
    providerId: "",
    name: "",
    temperature: "",
    maxTokens: "",
    topP: "",
    frequencyPenalty: "",
    presencePenalty: "",
    anthropicVersion: "",
  })

  const [providerQuery, setProviderQuery] = React.useState("")
  const [modelQuery, setModelQuery] = React.useState("")
  const [discoverPrefix, setDiscoverPrefix] = React.useState("")
  const [providerEditorOpen, setProviderEditorOpen] = React.useState(false)
  const [modelEditorOpen, setModelEditorOpen] = React.useState(false)
  const [modelTestDialogOpen, setModelTestDialogOpen] = React.useState(false)
  const [modelTestPrompt, setModelTestPrompt] = React.useState("Reply with exactly: OK")
  const [modelTestTargetId, setModelTestTargetId] = React.useState("")

  const [discoverDialogOpen, setDiscoverDialogOpen] = React.useState(false)
  const [discoverResultProviderId, setDiscoverResultProviderId] = React.useState("")
  const [discoverResultPrefix, setDiscoverResultPrefix] = React.useState("")
  const [discoveredModelNames, setDiscoveredModelNames] = React.useState<string[]>([])
  const [selectedDiscoveredModelNames, setSelectedDiscoveredModelNames] = React.useState<string[]>([])

  const [pendingActions, setPendingActions] = React.useState<Record<string, boolean>>({})

  const isPending = React.useCallback((key: string) => Boolean(pendingActions[key]), [pendingActions])
  const runWithPending = React.useCallback(async (key: string, runner: () => Promise<void>) => {
    setPendingActions((prev) => ({ ...prev, [key]: true }))
    try {
      await runner()
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }))
    }
  }, [])

  const providerIds = React.useMemo(
    () => providers.map((item) => String(item.id || "").trim()).filter(Boolean),
    [providers],
  )
  const existingModelIds = React.useMemo(
    () => new Set(poolItems.map((item) => String(item.id || "").trim()).filter(Boolean)),
    [poolItems],
  )

  const filteredProviders = React.useMemo(() => {
    const query = providerQuery.trim().toLowerCase()
    if (!query) return providers
    return providers.filter((item) => {
      const id = String(item.id || "").toLowerCase()
      const type = String(item.type || "").toLowerCase()
      const base = String(item.baseUrl || "").toLowerCase()
      return id.includes(query) || type.includes(query) || base.includes(query)
    })
  }, [providerQuery, providers])

  const filteredModels = React.useMemo(() => {
    const query = modelQuery.trim().toLowerCase()
    if (!query) return poolItems
    return poolItems.filter((item) => {
      const id = String(item.id || "").toLowerCase()
      const providerId = String(item.providerId || "").toLowerCase()
      const name = String(item.name || "").toLowerCase()
      return id.includes(query) || providerId.includes(query) || name.includes(query)
    })
  }, [modelQuery, poolItems])

  const canSaveProvider = providerForm.id.trim().length > 0 && providerForm.type.trim().length > 0
  const canSaveModel =
    modelForm.id.trim().length > 0 &&
    modelForm.providerId.trim().length > 0 &&
    modelForm.name.trim().length > 0

  const resetProviderForm = React.useCallback(() => {
    setProviderForm({
      id: "",
      type: "openai",
      baseUrl: "",
      apiKey: "",
      hasExistingApiKey: false,
      apiKeyMasked: "",
    })
  }, [])
  const resetModelForm = React.useCallback(() => {
    setModelForm({
      id: "",
      providerId: "",
      name: "",
      temperature: "",
      maxTokens: "",
      topP: "",
      frequencyPenalty: "",
      presencePenalty: "",
      anthropicVersion: "",
    })
  }, [])

  return (
    <section className="space-y-4">
      <DashboardModule
        title="Providers"
        description="配置可用的模型 Provider，支持自定义 baseUrl 与 API Key。"
        actions={
          <>
            <Input
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
              placeholder="筛选 provider"
              className="w-[220px]"
            />
            <Input
              placeholder="发现前缀"
              value={discoverPrefix}
              onChange={(event) => setDiscoverPrefix(event.target.value)}
              className="w-40"
            />
            <HeaderAction
              label="新增 Provider"
              icon={<PlusIcon className="size-4" />}
              onClick={() => {
                resetProviderForm()
                setProviderEditorOpen(true)
              }}
              disabled={loading}
            />
          </>
        }
      >
        {filteredProviders.length === 0 ? (
          <div className="rounded-[18px] bg-secondary px-3 py-3 text-sm text-muted-foreground">没有 provider</div>
        ) : (
          <div className="space-y-1.5 rounded-[18px] bg-secondary/85 p-2">
            {filteredProviders.map((item) => {
              const providerId = String(item.id || "").trim()
              if (!providerId) return null
              return (
                <article key={providerId} className="group flex flex-col gap-3 rounded-[16px] bg-transparent px-3 py-3 transition-colors hover:bg-background lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-foreground">{providerId}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                        {item.type || "-"}
                      </span>
                      <span className="truncate" title={item.baseUrl || ""}>{item.baseUrl || "-"}</span>
                      <span>{item.hasApiKey ? item.apiKeyMasked || "configured" : "empty"}</span>
                      <span>{formatTime(item.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                          <RowAction
                            label="编辑"
                            icon={<PencilIcon className="size-3.5" />}
                            onClick={() => {
                              setProviderForm({
                                id: providerId,
                                type: String(item.type || "openai"),
                                baseUrl: String(item.baseUrl || ""),
                                apiKey: "",
                                hasExistingApiKey: item.hasApiKey === true,
                                apiKeyMasked: String(item.apiKeyMasked || ""),
                              })
                              setProviderEditorOpen(true)
                            }}
                          />
                          <RowAction
                            label="测试"
                            icon={<PlayIcon className="size-3.5" />}
                            onClick={() => {
                              void runWithPending(`provider:test:${providerId}`, async () => {
                                await Promise.resolve(onTestProvider(providerId))
                              })
                            }}
                            loading={isPending(`provider:test:${providerId}`)}
                          />
                          <RowAction
                            label="发现"
                            icon={<WandSparklesIcon className="size-3.5" />}
                            onClick={() => {
                              void runWithPending(`provider:discover:${providerId}`, async () => {
                                const prefix = discoverPrefix.trim()
                                const result = await Promise.resolve(
                                  onDiscoverProvider({
                                    providerId,
                                    autoAdd: false,
                                    prefix: prefix || undefined,
                                  }),
                                )
                                if (!result) return
                                const discovered = Array.isArray(result.discoveredModels) ? result.discoveredModels : []
                                setDiscoverResultProviderId(providerId)
                                setDiscoverResultPrefix(prefix)
                                setDiscoveredModelNames(discovered)
                                const selectable = discovered.filter((remoteName) => {
                                  const normalized = String(remoteName || "").trim()
                                  if (!normalized) return false
                                  const modelId = prefix ? `${prefix}${normalized}` : normalized
                                  return !existingModelIds.has(modelId)
                                })
                                setSelectedDiscoveredModelNames(selectable)
                                setDiscoverDialogOpen(true)
                              })
                            }}
                            loading={isPending(`provider:discover:${providerId}`)}
                          />
                          <RowAction
                            label="删除"
                            icon={<Trash2Icon className="size-3.5" />}
                            onClick={() => {
                              void (async () => {
                                const confirmed = await confirm({
                                  title: "删除 Provider",
                                  description: `确认删除 provider「${providerId}」吗？关联模型也可能受影响。`,
                                  confirmText: "删除",
                                  confirmVariant: "destructive",
                                })
                                if (!confirmed) return
                                await runWithPending(`provider:delete:${providerId}`, async () => {
                                  await Promise.resolve(onRemoveProvider(providerId))
                                })
                              })()
                            }}
                            loading={isPending(`provider:delete:${providerId}`)}
                            danger
                          />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <DashboardModule
        title="Models"
        description={`current ${String(model?.agentPrimaryModelId || "-")} · provider ${String(model?.providerType || "-")} · providers ${providers.length} · models ${poolItems.length}`}
        actions={
          <>
            <span className="text-xs text-muted-foreground">{`${filteredModels.length} items`}</span>
            <Input
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              placeholder="筛选 model"
              className="w-[220px]"
            />
            <HeaderAction
              label="新增 Model"
              icon={<PlusIcon className="size-4" />}
              onClick={() => {
                resetModelForm()
                setModelEditorOpen(true)
              }}
              disabled={loading}
            />
          </>
        }
      >
        {filteredModels.length === 0 ? (
          <div className="rounded-[18px] bg-secondary px-3 py-3 text-sm text-muted-foreground">没有 model</div>
        ) : (
          <div className="space-y-1.5 rounded-[18px] bg-secondary/85 p-2">
            {filteredModels.map((item) => {
              const modelId = String(item.id || "").trim()
              if (!modelId) return null
              const isPaused = item.isPaused === true
              return (
                <article key={modelId} className="group flex flex-col gap-3 rounded-[16px] bg-transparent px-3 py-3 transition-colors hover:bg-background lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-medium text-foreground">{modelId}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${isPaused ? "bg-secondary text-muted-foreground" : "bg-emerald-500/12 text-emerald-700"}`}>
                        <span className={`size-1.5 rounded-full ${isPaused ? "bg-muted-foreground/70" : "bg-emerald-600"}`} />
                        <span>{isPaused ? "paused" : "active"}</span>
                      </span>
                      <span>{item.providerId || "-"}</span>
                      <span className="truncate">{item.name || "-"}</span>
                      <span>{`temp ${item.temperature ?? "-"}`}</span>
                      <span>{`max ${item.maxTokens ?? "-"}`}</span>
                      <span>{`topP ${item.topP ?? "-"}`}</span>
                      <span>{formatTime(item.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                          <RowAction
                            label="编辑"
                            icon={<PencilIcon className="size-3.5" />}
                            onClick={() => {
                              setModelForm({
                                id: modelId,
                                providerId: String(item.providerId || ""),
                                name: String(item.name || ""),
                                temperature: item.temperature === undefined ? "" : String(item.temperature),
                                maxTokens: item.maxTokens === undefined ? "" : String(item.maxTokens),
                                topP: item.topP === undefined ? "" : String(item.topP),
                                frequencyPenalty: item.frequencyPenalty === undefined ? "" : String(item.frequencyPenalty),
                                presencePenalty: item.presencePenalty === undefined ? "" : String(item.presencePenalty),
                                anthropicVersion: String(item.anthropicVersion || ""),
                              })
                              setModelEditorOpen(true)
                            }}
                          />
                          <RowAction
                            label="测试"
                            icon={<PlayIcon className="size-3.5" />}
                            onClick={() => {
                              setModelTestTargetId(modelId)
                              setModelTestDialogOpen(true)
                            }}
                          />
                          <RowAction
                            label={isPaused ? "恢复" : "暂停"}
                            icon={isPaused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
                            onClick={() => {
                              void runWithPending(`model:pause:${modelId}`, async () => {
                                await Promise.resolve(onPauseModel(modelId, !isPaused))
                              })
                            }}
                            loading={isPending(`model:pause:${modelId}`)}
                          />
                          <RowAction
                            label="删除"
                            icon={<Trash2Icon className="size-3.5" />}
                            onClick={() => {
                              void (async () => {
                                const confirmed = await confirm({
                                  title: "删除 Model",
                                  description: `确认删除模型「${modelId}」吗？该操作不可恢复。`,
                                  confirmText: "删除",
                                  confirmVariant: "destructive",
                                })
                                if (!confirmed) return
                                await runWithPending(`model:delete:${modelId}`, async () => {
                                  await Promise.resolve(onRemoveModel(modelId))
                                })
                              })()
                            }}
                            loading={isPending(`model:delete:${modelId}`)}
                            danger
                          />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>

      <Dialog open={discoverDialogOpen} onOpenChange={setDiscoverDialogOpen}>
        <DialogContent className="w-[min(92vw,720px)]">
          <DialogHeader>
            <DialogTitle>Discover Models</DialogTitle>
            <DialogDescription className="sr-only">
              Discover models dialog
            </DialogDescription>
          </DialogHeader>
          {discoveredModelNames.length === 0 ? (
            <div className="px-4 pb-2 text-sm text-muted-foreground">未发现可用模型</div>
          ) : (
            <div className="max-h-[58vh] space-y-3 overflow-auto px-4 pb-2">
              <div className="rounded-[18px] bg-secondary px-3 py-2 text-xs text-muted-foreground">
                {`provider ${discoverResultProviderId || "-"} · prefix ${discoverResultPrefix || "(none)"}`}
              </div>
              <div className="space-y-1.5 rounded-[18px] bg-secondary/85 p-2">
                {discoveredModelNames.map((remoteNameRaw) => {
                  const remoteName = String(remoteNameRaw || "").trim()
                  const targetModelId = discoverResultPrefix ? `${discoverResultPrefix}${remoteName}` : remoteName
                  const exists = existingModelIds.has(targetModelId)
                  const checked = selectedDiscoveredModelNames.includes(remoteName)
                  return (
                    <label key={`discover:${remoteName}`} className="flex items-center justify-between gap-3 rounded-[14px] bg-transparent px-3 py-2.5 text-sm transition-colors hover:bg-background">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={exists}
                          onChange={(event) => {
                            setSelectedDiscoveredModelNames((prev) => {
                              if (!event.target.checked) return prev.filter((item) => item !== remoteName)
                              if (prev.includes(remoteName)) return prev
                              return [...prev, remoteName]
                            })
                          }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-foreground">{remoteName}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{targetModelId}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-muted-foreground">{exists ? "exists" : "new"}</div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setDiscoverDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={selectedDiscoveredModelNames.length === 0 || loading || isPending("discover:add")}
              onClick={() => {
                void runWithPending("discover:add", async () => {
                  for (const remoteNameRaw of selectedDiscoveredModelNames) {
                    const remoteName = String(remoteNameRaw || "").trim()
                    if (!remoteName) continue
                    const targetModelId = discoverResultPrefix ? `${discoverResultPrefix}${remoteName}` : remoteName
                    if (existingModelIds.has(targetModelId)) continue
                    await Promise.resolve(
                      onUpsertModel({
                        id: targetModelId,
                        providerId: discoverResultProviderId,
                        name: remoteName,
                      }),
                    )
                  }
                  setDiscoverDialogOpen(false)
                })
              }}
            >
              {isPending("discover:add") ? "添加中..." : "添加选中"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={providerEditorOpen} onOpenChange={setProviderEditorOpen}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>Provider</DialogTitle>
            <DialogDescription className="sr-only">
              Provider editor dialog
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto px-4 pb-2">
            <div className="space-y-2 rounded-[18px] bg-secondary p-3">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Input
                placeholder="provider id"
                className="h-10 rounded-[12px]"
                value={providerForm.id}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, id: event.target.value }))}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-between rounded-[12px] px-3"
                    />
                  }
                >
                  <span>{providerForm.type || "provider type"}</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[12rem]">
                  {PROVIDER_TYPES.map((type) => (
                    <DropdownMenuItem key={type} onClick={() => setProviderForm((prev) => ({ ...prev, type }))}>
                      {providerForm.type === type ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                      <span>{type}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2 rounded-[18px] bg-secondary p-3">
              <Label className="text-xs text-muted-foreground">Connection</Label>
              <Input
                placeholder="base url (optional)"
                className="h-10 rounded-[12px]"
                value={providerForm.baseUrl}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
              />
              <Input
                placeholder={
                  providerForm.hasExistingApiKey
                    ? "留空保留当前 API Key"
                    : "api key (optional)"
                }
                className="h-10 rounded-[12px]"
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
              <div className="text-[11px] text-muted-foreground">
                {providerForm.hasExistingApiKey
                  ? `已配置：${providerForm.apiKeyMasked || "configured"}`
                  : "未配置 API Key"}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setProviderEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={!canSaveProvider || loading || isPending("provider:save")}
              onClick={() => {
                void runWithPending("provider:save", async () => {
                  await Promise.resolve(
                    onUpsertProvider({
                      id: providerForm.id.trim(),
                      type: providerForm.type.trim(),
                      baseUrl: providerForm.baseUrl.trim() || undefined,
                      apiKey: providerForm.apiKey || undefined,
                    }),
                  )
                  setProviderEditorOpen(false)
                })
              }}
            >
              {isPending("provider:save") ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelTestDialogOpen} onOpenChange={setModelTestDialogOpen}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>测试 Model</DialogTitle>
            <DialogDescription className="sr-only">
              Model test dialog
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-2">
            <div className="rounded-[18px] bg-secondary px-3 py-2 text-xs text-muted-foreground">
              {`model ${modelTestTargetId || "-"}`}
            </div>
            <Textarea
              className="min-h-[112px] rounded-[12px]"
              value={modelTestPrompt}
              onChange={(event) => setModelTestPrompt(event.target.value)}
              placeholder="输入测试 prompt"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setModelTestDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={!modelTestTargetId || loading || isPending(`model:test:${modelTestTargetId}`)}
              onClick={() => {
                void runWithPending(`model:test:${modelTestTargetId}`, async () => {
                  await Promise.resolve(onTestModel(modelTestTargetId, modelTestPrompt))
                  setModelTestDialogOpen(false)
                })
              }}
            >
              {isPending(`model:test:${modelTestTargetId}`) ? "测试中..." : "运行测试"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modelEditorOpen} onOpenChange={setModelEditorOpen}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>Model</DialogTitle>
            <DialogDescription className="sr-only">
              Model editor dialog
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto px-4 pb-2">
            <div className="space-y-2 rounded-[18px] bg-secondary p-3">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input
                placeholder="model id"
                className="h-10 rounded-[12px]"
                value={modelForm.id}
                onChange={(event) => setModelForm((prev) => ({ ...prev, id: event.target.value }))}
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-between rounded-[12px] px-3"
                    />
                  }
                >
                  <span>{modelForm.providerId || "provider"}</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="min-w-[12rem]">
                  {providerIds.map((providerId) => (
                    <DropdownMenuItem
                      key={providerId}
                      onClick={() => setModelForm((prev) => ({ ...prev, providerId }))}
                    >
                      {modelForm.providerId === providerId ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                      <span>{providerId}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                placeholder="upstream model name"
                className="h-10 rounded-[12px]"
                value={modelForm.name}
                onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-secondary p-3">
              <Input
                placeholder="temperature"
                className="h-10 rounded-[12px]"
                value={modelForm.temperature}
                onChange={(event) => setModelForm((prev) => ({ ...prev, temperature: event.target.value }))}
              />
              <Input
                placeholder="max tokens"
                className="h-10 rounded-[12px]"
                value={modelForm.maxTokens}
                onChange={(event) => setModelForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
              />
              <Input
                placeholder="top p"
                className="h-10 rounded-[12px]"
                value={modelForm.topP}
                onChange={(event) => setModelForm((prev) => ({ ...prev, topP: event.target.value }))}
              />
              <Input
                placeholder="anthropic version"
                className="h-10 rounded-[12px]"
                value={modelForm.anthropicVersion}
                onChange={(event) => setModelForm((prev) => ({ ...prev, anthropicVersion: event.target.value }))}
              />
              <Input
                placeholder="frequency penalty"
                className="col-span-2 h-10 rounded-[12px]"
                value={modelForm.frequencyPenalty}
                onChange={(event) => setModelForm((prev) => ({ ...prev, frequencyPenalty: event.target.value }))}
              />
              <Input
                placeholder="presence penalty"
                className="col-span-2 h-10 rounded-[12px]"
                value={modelForm.presencePenalty}
                onChange={(event) => setModelForm((prev) => ({ ...prev, presencePenalty: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setModelEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={!canSaveModel || loading || isPending("model:save")}
              onClick={() => {
                void runWithPending("model:save", async () => {
                  await Promise.resolve(
                    onUpsertModel({
                      id: modelForm.id.trim(),
                      providerId: modelForm.providerId.trim(),
                      name: modelForm.name.trim(),
                      temperature: modelForm.temperature,
                      maxTokens: modelForm.maxTokens,
                      topP: modelForm.topP,
                      frequencyPenalty: modelForm.frequencyPenalty,
                      presencePenalty: modelForm.presencePenalty,
                      anthropicVersion: modelForm.anthropicVersion,
                    }),
                  )
                  setModelEditorOpen(false)
                })
              }}
            >
              {isPending("model:save") ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
