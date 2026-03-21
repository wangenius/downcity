/**
 * Env 管理区。
 *
 * 关键点（中文）
 * - 统一承载 Global Env / Agent Env 的列表、编辑与删除交互。
 * - 交互风格对齐模型页：独立模块、弹窗式新建/编辑、卡片化条目列表。
 */

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ClipboardPasteIcon, InfoIcon, KeyboardIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { dashboardDangerIconButtonClass, dashboardIconButtonClass } from "@/components/dashboard/dashboard-action-button"
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

function extractDotenvKeys(raw: string): string[] {
  const lines = String(raw || "").split(/\r?\n/)
  const keys = new Set<string>()
  let candidateLineCount = 0
  let invalidLineCount = 0

  for (const line of lines) {
    const trimmed = String(line || "").trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    candidateLineCount += 1
    const normalizedLine = trimmed.replace(/^export\s+/, "")
    const match = normalizedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    if (!match) {
      invalidLineCount += 1
      continue
    }
    keys.add(normalizeKey(match[1]))
  }

  if (candidateLineCount === 0 || invalidLineCount > 0) return []
  return [...keys]
}

function getCreateModeCopy(mode: EnvCreateMode): {
  title: string
  description: string
} {
  if (mode === "clipboard") {
    return {
      title: "剪贴板导入",
      description: "读取当前剪贴板中的 .env 文本，预览后确认导入。",
    }
  }
  return {
    title: "手动输入",
    description: "手动填写单个 key 和 value，适合补充或精确编辑。",
  }
}

function getSegmentButtonClass(active: boolean): string {
  return active
    ? "rounded-[12px] border border-border bg-background text-foreground"
    : "rounded-[12px] border border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground"
}

type EnvCreateMode = "manual" | "clipboard"

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
   * 从原始 `.env` 文本批量导入。
   */
  onImport?: (input: {
    scope: UiEnvScope
    agentId?: string
    raw: string
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
    onImport,
    onRemove,
  } = props
  const confirm = useConfirmDialog()
  const [draftKey, setDraftKey] = React.useState("")
  const [draftValue, setDraftValue] = React.useState("")
  const [draftScope, setDraftScope] = React.useState<UiEnvScope>("global")
  const [draftAgentId, setDraftAgentId] = React.useState("")
  const [editingKey, setEditingKey] = React.useState("")
  const [editingScope, setEditingScope] = React.useState<UiEnvScope>("global")
  const [pendingKey, setPendingKey] = React.useState("")
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [createMode, setCreateMode] = React.useState<EnvCreateMode>("manual")
  const [clipboardRaw, setClipboardRaw] = React.useState("")
  const [clipboardKeys, setClipboardKeys] = React.useState<string[]>([])
  const [clipboardChecked, setClipboardChecked] = React.useState(false)

  const normalizedDraftKey = normalizeKey(draftKey)
  const canUseAgentScope = agentOptions.length > 0
  const requiresAgent = canUseAgentScope && draftScope === "agent"
  const isEditing = Boolean(editingKey)
  const canImportClipboard =
    writable &&
    clipboardKeys.length > 0 &&
    (!requiresAgent || Boolean(String(draftAgentId || "").trim()))
  const canSubmit =
    writable &&
    normalizedDraftKey.length > 0 &&
    isValidEnvKey(normalizedDraftKey) &&
    (!requiresAgent || Boolean(String(draftAgentId || "").trim()))
  const modeCopy = getCreateModeCopy(createMode)

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
    setCreateMode("manual")
    setClipboardRaw("")
    setClipboardKeys([])
    setClipboardChecked(false)
  }, [])

  const loadClipboardPreview = React.useCallback(() => {
    const run = async () => {
      setClipboardChecked(false)
      setClipboardRaw("")
      setClipboardKeys([])
      if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
        setClipboardChecked(true)
        return
      }
      setPendingKey("clipboard:read")
      try {
        const raw = await navigator.clipboard.readText()
        const keys = extractDotenvKeys(raw)
        setClipboardRaw(raw)
        setClipboardKeys(keys)
      } catch {
        setClipboardRaw("")
        setClipboardKeys([])
      } finally {
        setClipboardChecked(true)
        setPendingKey("")
      }
    }

    void run()
  }, [])

  const openCreate = React.useCallback(() => {
    if (!writable) return
    resetForm()
    setEditorOpen(true)
    if (onImport) loadClipboardPreview()
  }, [loadClipboardPreview, onImport, resetForm, writable])

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
  }, [canSubmit, draftAgentId, draftKey, draftScope, draftValue, onUpsert, resetForm])

  const importFromClipboard = React.useCallback(async () => {
    if (!canImportClipboard || !onImport) return
    setPendingKey("import:submit")
    try {
      await Promise.resolve(
        onImport({
          scope: draftScope,
          agentId: draftAgentId || undefined,
          raw: clipboardRaw,
        }),
      )
      resetForm()
      setEditorOpen(false)
    } finally {
      setPendingKey("")
    }
  }, [canImportClipboard, clipboardRaw, draftAgentId, draftScope, onImport, resetForm])

  const remove = React.useCallback(async (input: { scope: UiEnvScope; agentId?: string; key: string }) => {
    if (!onRemove) return
    const normalizedKey = normalizeKey(input.key)
    const normalizedAgentId = String(input.agentId || "").trim()
    const normalizedScope = input.scope || "global"
    const confirmed = await confirm({
      title: "删除 Env",
      description: `确认删除环境变量「${normalizedKey}」吗？该操作不可恢复。`,
      confirmText: "删除",
      confirmVariant: "destructive",
    })
    if (!confirmed) return
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
  }, [confirm, editingKey, onRemove, resetForm])

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
                        size="icon"
                        variant="ghost"
                        className={dashboardIconButtonClass}
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
                        size="icon"
                        variant="ghost"
                        className={dashboardDangerIconButtonClass}
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
            <DialogDescription className="text-xs leading-5">
              {editingKey ? "更新当前环境变量。" : `${modeCopy.title}。${modeCopy.description}`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[62vh] space-y-3 overflow-y-auto px-4 pb-2">
            {!isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`${getSegmentButtonClass(createMode === "manual")} px-3 py-3 text-left transition`}
                  onClick={() => setCreateMode("manual")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyboardIcon className="size-4" />
                    手动输入
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">单条创建</div>
                </button>
                <button
                  type="button"
                  className={`${getSegmentButtonClass(createMode === "clipboard")} px-3 py-3 text-left transition`}
                  onClick={() => {
                    setCreateMode("clipboard")
                    if (!clipboardChecked && onImport) loadClipboardPreview()
                  }}
                  disabled={!onImport}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ClipboardPasteIcon className="size-4" />
                    剪贴板导入
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">批量导入</div>
                </button>
              </div>
            ) : null}

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
                  <button
                    type="button"
                    className={`${getSegmentButtonClass(draftScope === "global")} h-10 px-3 text-sm font-medium transition`}
                    onClick={() => setDraftScope("global")}
                    disabled={Boolean(editingKey) && editingScope !== "global"}
                  >
                    Global
                  </button>
                  <button
                    type="button"
                    className={`${getSegmentButtonClass(draftScope === "agent")} h-10 px-3 text-sm font-medium transition`}
                    onClick={() => setDraftScope("agent")}
                    disabled={Boolean(editingKey) && editingScope !== "agent"}
                  >
                    Agent
                  </button>
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

            {isEditing || createMode === "manual" ? (
              <div className="space-y-4 rounded-[18px] bg-secondary p-3">
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
                  <Textarea
                    placeholder={editingKey ? "输入新的 value 覆盖当前值" : "env value"}
                    className="min-h-[112px] rounded-[12px]"
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {!isEditing && createMode === "clipboard" ? (
              <div className="space-y-3 rounded-[18px] bg-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">剪贴板</Label>
                    <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      支持粘贴标准 `.env` 文本。
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-[10px] px-3"
                    onClick={loadClipboardPreview}
                    disabled={pendingKey === "clipboard:read"}
                  >
                    {pendingKey === "clipboard:read" ? (
                      <>
                        <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                        检测中
                      </>
                    ) : "重新读取"}
                  </Button>
                </div>

                <div className="rounded-[12px] bg-background px-3 py-2 text-[11px] text-muted-foreground">
                  {draftScope === "agent"
                    ? `导入到 Agent · ${agentNameById.get(draftAgentId) || "未选择"}`
                    : "导入到 Global"}
                </div>

                <div className="rounded-[12px] bg-background px-3 py-2">
                  <pre className="max-h-[140px] overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-muted-foreground">
                    {clipboardRaw || "剪贴板内容会显示在这里。"}
                  </pre>
                </div>

                {!clipboardChecked ? (
                  <div className="text-sm text-muted-foreground">正在读取剪贴板...</div>
                ) : clipboardKeys.length > 0 ? (
                  <>
                    <div className="text-sm text-foreground">检测到 {clipboardKeys.length} 个 env 键</div>
                    <div className="flex flex-wrap gap-2">
                      {clipboardKeys.map((key) => (
                        <span
                          key={key}
                          className="inline-flex h-7 items-center rounded-full bg-background px-3 font-mono text-xs text-foreground"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    当前剪贴板不是有效的 `.env` 文本，请先复制类似 `KEY=value` 的内容。
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={
                isEditing || createMode === "manual"
                  ? (!canSubmit || loading || pendingKey.startsWith("save:"))
                  : (!canImportClipboard || loading || pendingKey === "import:submit" || pendingKey === "clipboard:read")
              }
              onClick={() => {
                if (!isEditing && createMode === "clipboard") {
                  void importFromClipboard()
                  return
                }
                void submit()
              }}
            >
              {pendingKey.startsWith("save:") ? (
                <>
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                  保存中...
                </>
              ) : pendingKey === "import:submit" ? (
                <>
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                  导入中...
                </>
              ) : !isEditing && createMode === "clipboard" ? "确认导入" : editingKey ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardModule>
  )
}
