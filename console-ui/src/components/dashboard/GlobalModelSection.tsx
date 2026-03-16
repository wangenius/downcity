/**
 * Global 作用域模型管理页。
 *
 * 关键点（中文）
 * - 采用 Workbench 结构：顶部总控 + Providers/Models 双任务流。
 * - 每个任务流都内置筛选与操作区，减少“弹窗前后切换”成本。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { UiModelPoolItem, UiModelProviderItem, UiModelSummary } from "@/types/Dashboard"

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
  /**
   * 当前选中 agent 的模型摘要。
   */
  model: UiModelSummary | null
  /**
   * provider 列表。
   */
  providers: UiModelProviderItem[]
  /**
   * model 列表。
   */
  poolItems: UiModelPoolItem[]
  /**
   * 是否刷新中。
   */
  loading: boolean
  /**
   * 刷新当前模型摘要。
   */
  onRefresh: () => void
  /**
   * 刷新模型池。
   */
  onRefreshPool: () => void
  /**
   * 保存 provider。
   */
  onUpsertProvider: (input: {
    id: string
    type: string
    baseUrl?: string
    apiKey?: string
    clearBaseUrl?: boolean
    clearApiKey?: boolean
  }) => void
  /**
   * 删除 provider。
   */
  onRemoveProvider: (providerId: string) => void
  /**
   * 测试 provider。
   */
  onTestProvider: (providerId: string) => void
  /**
   * 发现 provider 模型。
   */
  onDiscoverProvider: (params: { providerId: string; autoAdd?: boolean; prefix?: string }) => void
  /**
   * 保存 model。
   */
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
  }) => void
  /**
   * 删除 model。
   */
  onRemoveModel: (modelId: string) => void
  /**
   * 设置 model pause。
   */
  onPauseModel: (modelId: string, isPaused: boolean) => void
  /**
   * 测试 model。
   */
  onTestModel: (modelId: string, prompt?: string) => void
}

function formatTime(raw?: string): string {
  const text = String(raw || "").trim()
  if (!text) return "-"
  const t = Date.parse(text)
  if (!Number.isFinite(t) || Number.isNaN(t)) return "-"
  return new Date(t).toLocaleString("zh-CN", { hour12: false })
}

function MetricChip(props: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-border/60 bg-background/65 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-lg font-semibold">{props.value}</div>
      {props.hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{props.hint}</div> : null}
    </article>
  )
}

export function GlobalModelSection(props: GlobalModelSectionProps) {
  const {
    model,
    providers,
    poolItems,
    loading,
    onRefresh,
    onRefreshPool,
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
  const [testPrompt, setTestPrompt] = React.useState("Reply with exactly: OK")
  const [providerEditorOpen, setProviderEditorOpen] = React.useState(false)
  const [modelEditorOpen, setModelEditorOpen] = React.useState(false)

  const providerIds = React.useMemo(
    () => providers.map((item) => String(item.id || "").trim()).filter(Boolean),
    [providers],
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

  const resetProviderForm = React.useCallback(() => {
    setProviderForm({
      id: "",
      type: "openai",
      baseUrl: "",
      apiKey: "",
    })
  }, [])

  return (
    <section className="space-y-5">
      <Card>
        <CardHeader className="border-b border-border/55 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Model Operations Workbench</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onRefreshPool} disabled={loading}>
                刷新模型池
              </Button>
              <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
                刷新当前绑定
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricChip label="Providers" value={String(providers.length)} hint="global pool" />
            <MetricChip label="Models" value={String(poolItems.length)} hint="global pool" />
            <MetricChip label="Primary Snapshot" value={model?.agentPrimaryModelId || "-"} hint="runtime snapshot" />
            <MetricChip
              label="Runtime Provider"
              value={model?.providerType || "-"}
              hint={model?.providerKey ? `key: ${model.providerKey}` : "-"}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border/55 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Provider Registry</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    resetProviderForm()
                    setProviderEditorOpen(true)
                  }}
                >
                  新建 Provider
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                <Input
                  value={providerQuery}
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder="筛选 provider（id/type/baseUrl）"
                />
                <Input
                  placeholder="发现前缀（如 gpt-/claude-）"
                  value={discoverPrefix}
                  onChange={(event) => setDiscoverPrefix(event.target.value)}
                />
              </div>

              {filteredProviders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/65 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  没有匹配的 provider。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Id</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Base URL</th>
                        <th className="px-3 py-2 font-medium">API Key</th>
                        <th className="px-3 py-2 font-medium">Updated</th>
                        <th className="px-3 py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProviders.map((item) => {
                        const providerId = String(item.id || "").trim()
                        if (!providerId) return null
                        return (
                          <tr key={providerId} className="border-t border-border/60">
                            <td className="px-3 py-2 text-sm font-medium">{providerId}</td>
                            <td className="px-3 py-2 text-sm">{item.type || "-"}</td>
                            <td className="max-w-[20rem] truncate px-3 py-2 text-sm text-muted-foreground" title={item.baseUrl || ""}>
                              {item.baseUrl || "-"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {item.hasApiKey ? (
                                <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-700">
                                  {item.apiKeyMasked || "configured"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-border/60 bg-muted/35 text-muted-foreground">
                                  empty
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{formatTime(item.updatedAt)}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    setProviderForm({
                                      id: providerId,
                                      type: String(item.type || "openai"),
                                      baseUrl: String(item.baseUrl || ""),
                                      apiKey: "",
                                    })
                                    setProviderEditorOpen(true)
                                  }}
                                >
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onTestProvider(providerId)}>
                                  测试
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() =>
                                    onDiscoverProvider({
                                      providerId,
                                      autoAdd: true,
                                      prefix: discoverPrefix.trim() || undefined,
                                    })
                                  }
                                >
                                  发现
                                </Button>
                                <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]" onClick={() => onRemoveProvider(providerId)}>
                                  删除
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={providerEditorOpen} onOpenChange={setProviderEditorOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Provider Editor</DialogTitle>
                <DialogDescription>在弹窗中维护 provider 配置，API Key 会加密存储。</DialogDescription>
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
                  disabled={!canSaveProvider || loading}
                  onClick={() => {
                    onUpsertProvider({
                      id: providerForm.id.trim(),
                      type: providerForm.type.trim(),
                      baseUrl: providerForm.baseUrl.trim() || undefined,
                      apiKey: providerForm.apiKey || undefined,
                    })
                    setProviderEditorOpen(false)
                  }}
                >
                  保存 Provider
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border/55 pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Model Registry</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    resetModelForm()
                    setModelEditorOpen(true)
                  }}
                >
                  新建 Model
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <Input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="筛选 model（id/provider/name）"
              />

              <Textarea
                className="min-h-[88px]"
                value={testPrompt}
                onChange={(event) => setTestPrompt(event.target.value)}
                placeholder="测试 prompt"
              />

              {filteredModels.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/65 bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  没有匹配的 model。
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Id</th>
                        <th className="px-3 py-2 font-medium">Provider</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Params</th>
                        <th className="px-3 py-2 font-medium">Updated</th>
                        <th className="px-3 py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.map((item) => {
                        const modelId = String(item.id || "").trim()
                        if (!modelId) return null
                        const isPaused = item.isPaused === true
                        return (
                          <tr key={modelId} className="border-t border-border/60">
                            <td className="px-3 py-2 text-sm font-medium">{modelId}</td>
                            <td className="px-3 py-2 text-sm text-muted-foreground">{item.providerId || "-"}</td>
                            <td className="px-3 py-2 text-sm">{item.name || "-"}</td>
                            <td className="px-3 py-2 text-xs">
                              {isPaused ? (
                                <Badge variant="outline" className="border-border/65 bg-muted/35 text-muted-foreground">
                                  paused
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-emerald-500/35 bg-emerald-500/10 text-emerald-700">
                                  active
                                </Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-muted-foreground">
                              <div>{`temp ${item.temperature ?? "-"}`}</div>
                              <div>{`max ${item.maxTokens ?? "-"}`}</div>
                              <div>{`topP ${item.topP ?? "-"}`}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{formatTime(item.updatedAt)}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={() => {
                                    setModelForm({
                                      id: modelId,
                                      providerId: String(item.providerId || ""),
                                      name: String(item.name || ""),
                                      temperature: item.temperature === undefined ? "" : String(item.temperature),
                                      maxTokens: item.maxTokens === undefined ? "" : String(item.maxTokens),
                                      topP: item.topP === undefined ? "" : String(item.topP),
                                      frequencyPenalty:
                                        item.frequencyPenalty === undefined ? "" : String(item.frequencyPenalty),
                                      presencePenalty:
                                        item.presencePenalty === undefined ? "" : String(item.presencePenalty),
                                      anthropicVersion: String(item.anthropicVersion || ""),
                                    })
                                    setModelEditorOpen(true)
                                  }}
                                >
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onTestModel(modelId, testPrompt)}>
                                  测试
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onPauseModel(modelId, !isPaused)}>
                                  {isPaused ? "恢复" : "暂停"}
                                </Button>
                                <Button size="sm" variant="destructive" className="h-7 px-2 text-[11px]" onClick={() => onRemoveModel(modelId)}>
                                  删除
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={modelEditorOpen} onOpenChange={setModelEditorOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Model Editor</DialogTitle>
                <DialogDescription>在弹窗中编辑模型配置，保存后立即写入全局模型池。</DialogDescription>
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
                    onChange={(event) =>
                      setModelForm((prev) => ({ ...prev, frequencyPenalty: event.target.value }))
                    }
                    className="col-span-2"
                  />
                  <Input
                    placeholder="presence penalty"
                    value={modelForm.presencePenalty}
                    onChange={(event) =>
                      setModelForm((prev) => ({ ...prev, presencePenalty: event.target.value }))
                    }
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
                  disabled={!canSaveModel || loading}
                  onClick={() => {
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
                    })
                    setModelEditorOpen(false)
                  }}
                >
                  保存 Model
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </section>
  )
}
