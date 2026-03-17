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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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

  const [providerForm, setProviderForm] = React.useState<ProviderFormState>({
    id: "",
    type: "openai",
    baseUrl: "",
    apiKey: "",
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
      <section className="space-y-3 rounded-md bg-muted/55 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Providers</div>
          <HeaderAction
            label="新增 Provider"
            icon={<PlusIcon className="size-4" />}
            onClick={() => {
              resetProviderForm()
              setProviderEditorOpen(true)
            }}
            disabled={loading}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[18rem] flex-1">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
              placeholder="筛选 provider（id/type/baseUrl）"
              className="h-8 pl-7"
            />
          </div>
          <Input
            placeholder="发现前缀（可选）"
            value={discoverPrefix}
            onChange={(event) => setDiscoverPrefix(event.target.value)}
            className="h-8 w-44"
          />
        </div>

        {filteredProviders.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">没有 provider</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProviders.map((item) => {
                const providerId = String(item.id || "").trim()
                if (!providerId) return null
                return (
                  <TableRow key={providerId}>
                    <TableCell className="font-medium">{providerId}</TableCell>
                    <TableCell>{item.type || "-"}</TableCell>
                    <TableCell className="max-w-[20rem] truncate" title={item.baseUrl || ""}>
                      {item.baseUrl || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.hasApiKey ? item.apiKeyMasked || "configured" : "empty"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(item.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <RowAction
                          label="编辑"
                          icon={<PencilIcon className="size-3.5" />}
                          onClick={() => {
                            setProviderForm({
                              id: providerId,
                              type: String(item.type || "openai"),
                              baseUrl: String(item.baseUrl || ""),
                              apiKey: "",
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
                            void runWithPending(`provider:delete:${providerId}`, async () => {
                              await Promise.resolve(onRemoveProvider(providerId))
                            })
                          }}
                          loading={isPending(`provider:delete:${providerId}`)}
                          danger
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3 rounded-md bg-muted/75 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Models</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {`current ${String(model?.agentPrimaryModelId || "-")} · provider ${String(model?.providerType || "-")} · providers ${providers.length} · models ${poolItems.length}`}
            </div>
          </div>
          <HeaderAction
            label="新增 Model"
            icon={<PlusIcon className="size-4" />}
            onClick={() => {
              resetModelForm()
              setModelEditorOpen(true)
            }}
            disabled={loading}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[18rem] flex-1">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={modelQuery}
              onChange={(event) => setModelQuery(event.target.value)}
              placeholder="筛选 model（id/provider/name）"
              className="h-8 pl-7"
            />
          </div>
        </div>

        {filteredModels.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground">没有 model</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Id</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Params</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredModels.map((item) => {
                const modelId = String(item.id || "").trim()
                if (!modelId) return null
                const isPaused = item.isPaused === true
                return (
                  <TableRow key={modelId}>
                    <TableCell className="font-medium">{modelId}</TableCell>
                    <TableCell>{item.providerId || "-"}</TableCell>
                    <TableCell>{item.name || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs ${isPaused ? "text-muted-foreground" : "text-emerald-700"}`}>
                        <span className={`size-1.5 rounded-full ${isPaused ? "bg-muted-foreground/70" : "bg-emerald-600"}`} />
                        <span>{isPaused ? "paused" : "active"}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {`temp ${item.temperature ?? "-"} · max ${item.maxTokens ?? "-"} · topP ${item.topP ?? "-"}`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(item.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
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
                            void runWithPending(`model:delete:${modelId}`, async () => {
                              await Promise.resolve(onRemoveModel(modelId))
                            })
                          }}
                          loading={isPending(`model:delete:${modelId}`)}
                          danger
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog open={discoverDialogOpen} onOpenChange={setDiscoverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discover Models</DialogTitle>
            <DialogDescription>{`Provider: ${discoverResultProviderId || "-"} · Prefix: ${discoverResultPrefix || "(none)"}`}</DialogDescription>
          </DialogHeader>
          {discoveredModelNames.length === 0 ? (
            <div className="px-4 pb-2 text-sm text-muted-foreground">未发现可用模型</div>
          ) : (
            <div className="max-h-[50vh] overflow-auto px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Add</TableHead>
                    <TableHead>Remote Name</TableHead>
                    <TableHead>Model ID</TableHead>
                    <TableHead className="text-right">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discoveredModelNames.map((remoteNameRaw) => {
                    const remoteName = String(remoteNameRaw || "").trim()
                    const targetModelId = discoverResultPrefix ? `${discoverResultPrefix}${remoteName}` : remoteName
                    const exists = existingModelIds.has(targetModelId)
                    const checked = selectedDiscoveredModelNames.includes(remoteName)
                    return (
                      <TableRow key={`discover:${remoteName}`}>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>{remoteName}</TableCell>
                        <TableCell className="text-muted-foreground">{targetModelId}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {exists ? "exists" : "new"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDiscoverDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provider</DialogTitle>
            <DialogDescription>维护 provider 配置，API Key 会加密存储。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-2">
            <Input
              placeholder="provider id"
              value={providerForm.id}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, id: event.target.value }))}
            />
            <Select
              value={providerForm.type}
              onValueChange={(value) => setProviderForm((prev) => ({ ...prev, type: value || "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="provider type" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="base url (optional)"
              value={providerForm.baseUrl}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
            />
            <Input
              placeholder="api key (optional)"
              value={providerForm.apiKey}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, apiKey: event.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setProviderEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>测试 Model</DialogTitle>
            <DialogDescription>{`Model: ${modelTestTargetId || "-"}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-2">
            <Textarea
              className="min-h-[112px]"
              value={modelTestPrompt}
              onChange={(event) => setModelTestPrompt(event.target.value)}
              placeholder="输入测试 prompt"
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setModelTestDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Model</DialogTitle>
            <DialogDescription>维护模型池配置，保存后立即生效。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-2">
            <Input
              placeholder="model id"
              value={modelForm.id}
              onChange={(event) => setModelForm((prev) => ({ ...prev, id: event.target.value }))}
            />
            <Select
              value={modelForm.providerId || undefined}
              onValueChange={(value) => setModelForm((prev) => ({ ...prev, providerId: value || "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="provider" />
              </SelectTrigger>
              <SelectContent>
                {providerIds.map((providerId) => (
                  <SelectItem key={providerId} value={providerId}>
                    {providerId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="upstream model name"
              value={modelForm.name}
              onChange={(event) => setModelForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="temperature"
                value={modelForm.temperature}
                onChange={(event) => setModelForm((prev) => ({ ...prev, temperature: event.target.value }))}
              />
              <Input
                placeholder="max tokens"
                value={modelForm.maxTokens}
                onChange={(event) => setModelForm((prev) => ({ ...prev, maxTokens: event.target.value }))}
              />
              <Input
                placeholder="top p"
                value={modelForm.topP}
                onChange={(event) => setModelForm((prev) => ({ ...prev, topP: event.target.value }))}
              />
              <Input
                placeholder="anthropic version"
                value={modelForm.anthropicVersion}
                onChange={(event) => setModelForm((prev) => ({ ...prev, anthropicVersion: event.target.value }))}
              />
              <Input
                placeholder="frequency penalty"
                value={modelForm.frequencyPenalty}
                onChange={(event) => setModelForm((prev) => ({ ...prev, frequencyPenalty: event.target.value }))}
                className="col-span-2"
              />
              <Input
                placeholder="presence penalty"
                value={modelForm.presencePenalty}
                onChange={(event) => setModelForm((prev) => ({ ...prev, presencePenalty: event.target.value }))}
                className="col-span-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setModelEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
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
