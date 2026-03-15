/**
 * Global 作用域模型管理页。
 *
 * 关键点（中文）
 * - 覆盖 provider/model 的增删改查与测试能力。
 * - 所有操作均走 console ui 网关，不直接依赖本地命令行交互。
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
  if (!Number.isFinite(t) || Number.isNaN(t)) return text
  return new Date(t).toLocaleString("zh-CN", { hour12: false })
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

  const providerIds = React.useMemo(
    () => providers.map((item) => String(item.id || "").trim()).filter(Boolean),
    [providers],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Global Model</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRefreshPool} disabled={loading}>
              刷新模型池
            </Button>
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
              刷新当前模型
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/35 p-3 text-xs">
            <div>{`providers: ${providers.length}`}</div>
            <div>{`models: ${poolItems.length}`}</div>
            <div>{`agent primary: ${model?.agentPrimaryModelId || "-"}`}</div>
            <div>{`active provider: ${model?.providerType || "-"} (${model?.providerKey || "-"})`}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/35 p-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              placeholder="provider id"
              value={providerForm.id}
              onChange={(event) => setProviderForm((prev) => ({ ...prev, id: event.target.value }))}
            />
            <Select
              value={providerForm.type}
              onValueChange={(value) => setProviderForm((prev) => ({ ...prev, type: value }))}
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
            <div className="flex items-center gap-2 md:col-span-2 xl:col-span-4">
              <Button
                size="sm"
                onClick={() =>
                  onUpsertProvider({
                    id: providerForm.id.trim(),
                    type: providerForm.type.trim(),
                    baseUrl: providerForm.baseUrl.trim() || undefined,
                    apiKey: providerForm.apiKey || undefined,
                  })
                }
                disabled={!providerForm.id.trim() || !providerForm.type.trim()}
              >
                保存 Provider
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setProviderForm({
                    id: "",
                    type: "openai",
                    baseUrl: "",
                    apiKey: "",
                  })
                }
              >
                清空
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/70">
            <Table>
              <TableHeader className="bg-muted/35">
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
                {providers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      暂无 provider
                    </TableCell>
                  </TableRow>
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
                              onClick={() =>
                                setProviderForm({
                                  id: providerId,
                                  type: String(item.type || "openai"),
                                  baseUrl: String(item.baseUrl || ""),
                                  apiKey: "",
                                })
                              }
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
                              发现并添加
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

          <div className="flex items-center gap-2">
            <Input
              placeholder="discover prefix (optional)"
              value={discoverPrefix}
              onChange={(event) => setDiscoverPrefix(event.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/35 p-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              placeholder="model id"
              value={modelForm.id}
              onChange={(event) => setModelForm((prev) => ({ ...prev, id: event.target.value }))}
            />
            <Select
              value={modelForm.providerId || undefined}
              onValueChange={(value) => setModelForm((prev) => ({ ...prev, providerId: value }))}
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
              placeholder="frequency penalty"
              value={modelForm.frequencyPenalty}
              onChange={(event) => setModelForm((prev) => ({ ...prev, frequencyPenalty: event.target.value }))}
            />
            <Input
              placeholder="presence penalty"
              value={modelForm.presencePenalty}
              onChange={(event) => setModelForm((prev) => ({ ...prev, presencePenalty: event.target.value }))}
            />
            <Input
              placeholder="anthropic version"
              value={modelForm.anthropicVersion}
              onChange={(event) => setModelForm((prev) => ({ ...prev, anthropicVersion: event.target.value }))}
              className="xl:col-span-2"
            />
            <div className="flex items-center gap-2 md:col-span-2 xl:col-span-2">
              <Button
                size="sm"
                onClick={() =>
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
                }
                disabled={!modelForm.id.trim() || !modelForm.providerId.trim() || !modelForm.name.trim()}
              >
                保存 Model
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
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
                }
              >
                清空
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input
              className="max-w-xl"
              placeholder="test prompt"
              value={testPrompt}
              onChange={(event) => setTestPrompt(event.target.value)}
            />
          </div>

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
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poolItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      暂无 model
                    </TableCell>
                  </TableRow>
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
                              onClick={() =>
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
                              }
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
    </div>
  )
}
