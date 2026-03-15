/**
 * Global 作用域模型管理页。
 *
 * 关键点（中文）
 * - 保留原有 provider/model 的增删改查与测试能力。
 * - 通过“编辑区 + 列表区”的双栏结构降低操作噪音。
 * - 使用 Tabs 分离 Provider 与 Model 任务流，避免单屏过载。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
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

function StatCard(props: { label: string; value: string; sub?: string }) {
  const { label, value, sub } = props
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

function EmptyRow(props: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={props.colSpan} className="text-sm text-muted-foreground">
        {props.text}
      </TableCell>
    </TableRow>
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
  const [discoverPrefix, setDiscoverPrefix] = React.useState("")
  const [testPrompt, setTestPrompt] = React.useState("Reply with exactly: OK")
  const [providerEditorOpen, setProviderEditorOpen] = React.useState(false)
  const [modelEditorOpen, setModelEditorOpen] = React.useState(false)

  const providerIds = React.useMemo(
    () => providers.map((item) => String(item.id || "").trim()).filter(Boolean),
    [providers],
  )

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
    <section className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Global Model Control</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRefreshPool} disabled={loading}>
              刷新模型池
            </Button>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
              刷新当前绑定
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Providers" value={String(providers.length)} sub="global pool" />
          <StatCard label="Models" value={String(poolItems.length)} sub="global pool" />
          <StatCard label="Agent Primary" value={model?.agentPrimaryModelId || "-"} sub="selected agent binding" />
          <StatCard
            label="Runtime Provider"
            value={model?.providerType || "-"}
            sub={model?.providerKey ? `key: ${model.providerKey}` : "-"}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-4">
          <Card className="border-border/70">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Provider List</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  resetProviderForm()
                  setProviderEditorOpen(true)
                }}
              >
                新建 Provider
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">模型发现前缀（可选）</div>
                <Input
                  placeholder="例如 gpt- 或 claude-"
                  value={discoverPrefix}
                  onChange={(event) => setDiscoverPrefix(event.target.value)}
                  className="max-w-sm"
                />
                <div className="text-[11px] text-muted-foreground">在表格中点击“发现”会用该前缀过滤并自动添加。</div>
              </div>
              <Separator />
              <div className="overflow-hidden rounded-xl border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/35">
                    <TableRow>
                      <TableHead>Id</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Base URL</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.length === 0 ? (
                      <EmptyRow colSpan={6} text="暂无 provider" />
                    ) : (
                      providers.map((item) => {
                        const providerId = String(item.id || "").trim()
                        if (!providerId) return null
                        return (
                          <TableRow key={providerId}>
                            <TableCell className="font-medium">{providerId}</TableCell>
                            <TableCell>{item.type || "-"}</TableCell>
                            <TableCell className="max-w-[18rem] truncate" title={item.baseUrl || ""}>
                              {item.baseUrl || "-"}
                            </TableCell>
                            <TableCell>
                              {item.hasApiKey ? (
                                <Badge variant="outline" className="border-border bg-muted/45 text-foreground">
                                  {item.apiKeyMasked || "configured"}
                                </Badge>
                              ) : (
                                <Badge variant="outline">empty</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTime(item.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
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
                                <Button size="sm" variant="outline" onClick={() => onTestProvider(providerId)}>
                                  测试
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
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
                                <Button size="sm" variant="destructive" onClick={() => onRemoveProvider(providerId)}>
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
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
          <Card className="border-border/70">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Model List</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  resetModelForm()
                  setModelEditorOpen(true)
                }}
              >
                新建 Model
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">测试 Prompt</div>
                <Textarea
                  className="min-h-[90px]"
                  value={testPrompt}
                  onChange={(event) => setTestPrompt(event.target.value)}
                />
              </div>
              <Separator />
              <div className="overflow-hidden rounded-xl border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/35">
                    <TableRow>
                      <TableHead>Id</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Params</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poolItems.length === 0 ? (
                      <EmptyRow colSpan={7} text="暂无 model" />
                    ) : (
                      poolItems.map((item) => {
                        const modelId = String(item.id || "").trim()
                        if (!modelId) return null
                        const isPaused = item.isPaused === true
                        return (
                          <TableRow key={modelId}>
                            <TableCell className="font-medium">{modelId}</TableCell>
                            <TableCell>{item.providerId || "-"}</TableCell>
                            <TableCell>{item.name || "-"}</TableCell>
                            <TableCell>
                              {isPaused ? (
                                <Badge variant="outline" className="border-border bg-muted/35 text-muted-foreground">
                                  paused
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-border bg-muted/45 text-foreground">
                                  active
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <div>{`temp ${item.temperature ?? "-"}`}</div>
                              <div>{`max ${item.maxTokens ?? "-"}`}</div>
                              <div>{`topP ${item.topP ?? "-"}`}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatTime(item.updatedAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
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
                                <Button size="sm" variant="outline" onClick={() => onTestModel(modelId, testPrompt)}>
                                  测试
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onPauseModel(modelId, !isPaused)}>
                                  {isPaused ? "恢复" : "暂停"}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => onRemoveModel(modelId)}>
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
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
