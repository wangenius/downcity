/**
 * Env 管理区。
 *
 * 关键点（中文）
 * - 统一承载 Global Env / Agent Env 的列表、编辑与删除交互。
 * - 交互风格对齐模型页：独立模块、弹窗式新建/编辑、卡片化条目列表。
 */

import * as React from "react"
import { CheckIcon, ChevronDownIcon, InfoIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { UiEnvItem, UiEnvScope } from "@/types/Dashboard"

function formatTime(raw?: string): string {
  const text = String(raw || "").trim()
  if (!text) return "-"
  const timestamp = Date.parse(text)
  if (!Number.isFinite(timestamp) || Number.isNaN(timestamp)) return "-"
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false })
}

function normalizeKey(value: string): string {
  return String(value || "").trim().toUpperCase()
}

function isValidEnvKey(value: string): boolean {
  return /^[A-Z_][A-Z0-9_]*$/.test(normalizeKey(value))
}

export interface EnvSectionProps {
  /**
   * 模块标题。
   */
  title: string
  /**
   * 模块说明。
   */
  description: string
  /**
   * 空态文案。
   */
  emptyText: string
  /**
   * env 列表。
   */
  items: UiEnvItem[]
  /**
   * 页面是否整体 loading。
   */
  loading: boolean
  /**
   * 是否允许写入。
   */
  writable?: boolean
  /**
   * 可选 agent 列表；存在时启用“目标 agent”选择。
   */
  agentOptions?: Array<{
    id: string
    name: string
  }>
  /**
   * 新增/覆盖 env。
   */
  onUpsert?: (input: {
    scope: UiEnvScope
    agentId?: string
    key: string
    value: string
  }) => Promise<void> | void
  /**
   * 删除 env。
   */
  onRemove?: (input: {
    scope: UiEnvScope
    agentId?: string
    key: string
  }) => Promise<void> | void
}

export function EnvSection(props: EnvSectionProps) {
  const {
    title,
    description,
    emptyText,
    items,
    loading,
    writable = true,
    agentOptions = [],
    onUpsert,
    onRemove,
  } = props
  const [draftKey, setDraftKey] = React.useState("")
  const [draftValue, setDraftValue] = React.useState("")
  const [draftScope, setDraftScope] = React.useState<UiEnvScope>("global")
  const [draftAgentId, setDraftAgentId] = React.useState("")
  const [editingKey, setEditingKey] = React.useState("")
  const [editingScope, setEditingScope] = React.useState<UiEnvScope>("global")
  const [pendingKey, setPendingKey] = React.useState("")
  const [editorOpen, setEditorOpen] = React.useState(false)

  const normalizedDraftKey = normalizeKey(draftKey)
  const canUseAgentScope = agentOptions.length > 0
  const requiresAgent = canUseAgentScope && draftScope === "agent"
  const canSubmit =
    writable &&
    normalizedDraftKey.length > 0 &&
    isValidEnvKey(normalizedDraftKey) &&
    (!requiresAgent || Boolean(String(draftAgentId || "").trim()))

  const agentNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of agentOptions) {
      const id = String(item.id || "").trim()
      if (!id) continue
      map.set(id, String(item.name || item.id || "").trim() || id)
    }
    return map
  }, [agentOptions])

  const resetForm = React.useCallback(() => {
    setDraftKey("")
    setDraftValue("")
    setDraftScope("global")
    setDraftAgentId("")
    setEditingKey("")
    setEditingScope("global")
  }, [])

  const openCreate = React.useCallback(() => {
    if (!writable) return
    resetForm()
    setEditorOpen(true)
  }, [resetForm, writable])

  const startEdit = React.useCallback((item: UiEnvItem) => {
    if (!writable) return
    setEditingKey(String(item.key || "").trim())
    setEditingScope(item.scope || "global")
    setDraftKey(String(item.key || "").trim())
    setDraftValue(String(item.value ?? ""))
    setDraftScope(item.scope || "global")
    setDraftAgentId(String(item.agentId || "").trim())
    setEditorOpen(true)
  }, [writable])

  const submit = React.useCallback(async () => {
    if (!canSubmit || !onUpsert) return
    const key = normalizeKey(draftKey)
    setPendingKey(`save:${key}`)
    try {
      await Promise.resolve(
        onUpsert({
          scope: draftScope,
          agentId: draftAgentId || undefined,
          key,
          value: String(draftValue ?? ""),
        }),
      )
      resetForm()
      setEditorOpen(false)
    } finally {
      setPendingKey("")
    }
  }, [canSubmit, draftKey, draftScope, draftValue, onUpsert, resetForm])

  const remove = React.useCallback(async (input: { scope: UiEnvScope; agentId?: string; key: string }) => {
    if (!onRemove) return
    const normalizedKey = normalizeKey(input.key)
    const normalizedAgentId = String(input.agentId || "").trim()
    const normalizedScope = input.scope || "global"
    setPendingKey(`remove:${normalizedScope}:${normalizedAgentId}:${normalizedKey}`)
    try {
      await Promise.resolve(
        onRemove({
          scope: normalizedScope,
          agentId: normalizedAgentId || undefined,
          key: normalizedKey,
        }),
      )
      if (normalizedKey === normalizeKey(editingKey)) {
        resetForm()
      }
    } finally {
      setPendingKey("")
    }
  }, [editingKey, onRemove, resetForm])

  const filledCount = items.filter((item) => String(item.value ?? "").length > 0).length

  return (
    <DashboardModule
      title={title}
      description={`${description} 共 ${items.length} 个条目，非空值 ${filledCount} 个。`}
      actions={
        writable ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon"
                    className="h-8 w-8 rounded-[12px]"
                    onClick={openCreate}
                    disabled={loading}
                    aria-label="新建 Env"
                  />
                }
              >
                <PlusIcon className="size-4" />
              </TooltipTrigger>
              <TooltipContent>新建 Env</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null
      }
    >
      {items.length === 0 ? (
        <div className="rounded-[18px] bg-secondary py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const key = normalizeKey(item.key)
            const value = String(item.value ?? "")
            const valueSummary = value ? `${"*".repeat(Math.min(value.length, 12))} (${value.length})` : "(empty)"
            const scope = item.scope || "global"
            const agentId = String(item.agentId || "").trim()
            const removing = pendingKey === `remove:${scope}:${agentId}:${key}`
            const agentLabel = agentId ? agentNameById.get(agentId) || agentId : ""
            const scopeLabel = scope === "agent" ? "Agent" : "Global"
            const metaLine = [agentLabel, valueSummary].filter(Boolean).join(" · ")

            return (
              <article
                key={`${String(item.scope || "global")}:${String(item.agentId || "")}:${key}`}
                className="rounded-[16px] bg-transparent px-3.5 py-2 transition-colors hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-mono font-semibold text-foreground">{key}</span>
                      <span className="ml-2 inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[10px] font-medium text-muted-foreground align-middle">
                        {scopeLabel}
                      </span>
                      {metaLine ? (
                        <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
                          {metaLine}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="hidden text-[11px] text-muted-foreground md:inline">
                      {formatTime(item.updatedAt)}
                    </span>
                    {writable ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        onClick={() => startEdit(item)}
                        title="编辑"
                        aria-label="编辑"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                    ) : null}
                    {writable ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="destructive"
                        onClick={() => {
                          void remove({ scope, agentId, key })
                        }}
                        disabled={removing}
                        title="删除"
                        aria-label="删除"
                      >
                        {removing ? (
                          <Loader2Icon className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2Icon className="size-3.5" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>{editingKey ? "编辑 Env" : "新建 Env"}</DialogTitle>
            <DialogDescription className="sr-only">
              Env editor
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto px-4 pb-2">
            {canUseAgentScope ? (
              <div className="space-y-2 rounded-[18px] bg-secondary p-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">范围</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground" aria-label="scope help" />
                        }
                      >
                        <InfoIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Global 为共享，Agent 为单个 agent 私有</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={draftScope === "global" ? "default" : "outline"}
                    className="h-10 rounded-[12px]"
                    onClick={() => setDraftScope("global")}
                    disabled={Boolean(editingKey) && editingScope !== "global"}
                  >
                    Global
                  </Button>
                  <Button
                    type="button"
                    variant={draftScope === "agent" ? "default" : "outline"}
                    className="h-10 rounded-[12px]"
                    onClick={() => setDraftScope("agent")}
                    disabled={Boolean(editingKey) && editingScope !== "agent"}
                  >
                    Agent
                  </Button>
                </div>
              </div>
            ) : null}

            {requiresAgent ? (
              <div className="space-y-2 rounded-[18px] bg-secondary p-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Agent</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground" aria-label="agent help" />
                        }
                      >
                        <InfoIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>写入所选 agent 的私有 env</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                    <span>{agentNameById.get(draftAgentId) || "选择目标 agent"}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[16rem]">
                    {agentOptions.map((item) => {
                      const id = String(item.id || "").trim()
                      const label = String(item.name || item.id || "").trim() || id
                      if (!id) return null
                      return (
                        <DropdownMenuItem key={id} onClick={() => setDraftAgentId(id)}>
                          {draftAgentId === id ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                          <span className="truncate" title={id}>{label}</span>
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}

            <div className="space-y-2 rounded-[18px] bg-secondary p-3">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Key <span className="text-destructive">*</span>
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground" aria-label="key help" />
                        }
                      >
                        <InfoIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>使用标准环境变量格式，如 `OPENAI_API_KEY`</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  placeholder="OPENAI_API_KEY"
                  className="h-10 rounded-[12px]"
                  value={draftKey}
                  onChange={(event) => setDraftKey(normalizeKey(event.target.value))}
                />
                {!canSubmit && normalizedDraftKey ? (
                  <div className="text-[11px] text-destructive">Key 格式不合法</div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">Value</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground" aria-label="value help" />
                        }
                      >
                        <InfoIcon className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>留空会保存为空字符串</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  type="password"
                  placeholder={editingKey ? "输入新的 value 覆盖当前值" : "env value"}
                  className="h-10 rounded-[12px]"
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={!canSubmit || loading || pendingKey.startsWith("save:")}
              onClick={() => {
                void submit()
              }}
            >
              {pendingKey.startsWith("save:") ? (
                <>
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                  保存中...
                </>
              ) : editingKey ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardModule>
  )
}
