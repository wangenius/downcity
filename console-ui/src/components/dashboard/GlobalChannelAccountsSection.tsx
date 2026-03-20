/**
 * Global Channel Accounts 管理页。
 *
 * 关键点（中文）
 * - 新建账号时不要求手填 `channel account id` 与 `display name`。
 * - 用户只需填写凭据并点击“测试”，系统自动探测并回填必要信息。
 * - channel 页面仅绑定 channelAccountId，不直接维护密钥。
 */

import * as React from "react"
import { CheckIcon, ChevronDownIcon, Loader2Icon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { UiChannelAccountItem, UiChannelAccountProbeResult } from "@/types/Dashboard"

const CHANNEL_OPTIONS = [
  {
    label: "Telegram",
    value: "telegram",
  },
  {
    label: "Feishu",
    value: "feishu",
  },
  {
    label: "QQ",
    value: "qq",
  },
] as const

type ChannelAccountFormState = {
  id: string
  channel: string
  name: string
  identity: string
  owner: string
  creator: string
  domain: string
  sandbox: boolean
  authId: string
  botToken: string
  appId: string
  appSecret: string
}

type ProbeStatus = "idle" | "passed" | "failed"

function formatTime(raw?: string): string {
  const text = String(raw || "").trim()
  if (!text) return "-"
  const t = Date.parse(text)
  if (!Number.isFinite(t) || Number.isNaN(t)) return "-"
  return new Date(t).toLocaleString("zh-CN", { hour12: false })
}

function createEmptyForm(): ChannelAccountFormState {
  return {
    id: "",
    channel: "telegram",
    name: "",
    identity: "",
    owner: "",
    creator: "",
    domain: "",
    sandbox: false,
    authId: "",
    botToken: "",
    appId: "",
    appSecret: "",
  }
}

function trimText(value: string): string {
  return String(value || "").trim()
}

function requiredCredsReady(form: ChannelAccountFormState): boolean {
  if (form.channel === "telegram") return trimText(form.botToken).length > 0
  return trimText(form.appId).length > 0 && trimText(form.appSecret).length > 0
}

function validateForConfirm(params: {
  form: ChannelAccountFormState
  probeStatus: ProbeStatus
}): string[] {
  const { form, probeStatus } = params
  const errors: string[] = []

  if (!trimText(form.channel)) errors.push("请选择 channel")

  if (probeStatus !== "passed") {
    errors.push(probeStatus === "failed" ? "测试未通过，请修复凭据后重试" : "请先测试凭据并通过")
  }

  if (!trimText(form.id) || !trimText(form.name)) {
    errors.push("当前账户基础信息缺失，无法确认")
  }

  return errors
}

function isAccountCredentialReady(item: UiChannelAccountItem): boolean {
  const channel = String(item.channel || "").trim().toLowerCase()
  if (channel === "telegram") return item.hasBotToken === true
  return item.hasAppId === true && item.hasAppSecret === true
}

function channelDisplayName(channelInput: string): string {
  const channel = String(channelInput || "").trim().toLowerCase()
  if (channel === "telegram") return "Telegram"
  if (channel === "feishu") return "Feishu"
  if (channel === "qq") return "QQ"
  return channel || "-"
}

function credentialSummary(item: UiChannelAccountItem): string {
  const channel = String(item.channel || "").trim().toLowerCase()
  if (channel === "telegram") {
    return item.hasBotToken === true ? "token ready" : "token missing"
  }
  const idReady = item.hasAppId === true
  const secretReady = item.hasAppSecret === true
  if (idReady && secretReady) return "appId/appSecret ready"
  if (idReady || secretReady) return "credentials incomplete"
  return "credentials missing"
}

function buildMetaText(item: UiChannelAccountItem): string {
  const parts: string[] = []
  const identity = String(item.identity || "").trim()
  const owner = String(item.owner || "").trim()
  const creator = String(item.creator || "").trim()
  const authId = String(item.authId || "").trim()
  const domain = String(item.domain || "").trim()
  const channel = String(item.channel || "").trim().toLowerCase()
  if (identity) parts.push(`Bot: ${identity}`)
  if (owner) parts.push(`Owner: ${owner}`)
  if (creator) parts.push(`Creator: ${creator}`)
  if (authId) parts.push(`Auth: ${authId}`)
  if (channel === "feishu" && domain) parts.push(`Domain: ${domain}`)
  if (channel === "qq") parts.push(`Sandbox: ${item.sandbox === true ? "on" : "off"}`)
  parts.push(`Creds: ${credentialSummary(item)}`)
  return parts.join(" · ")
}

export interface GlobalChannelAccountsSectionProps {
  items: UiChannelAccountItem[]
  loading: boolean
  onUpsert: (input: {
    id: string
    channel: string
    name: string
    identity?: string
    owner?: string
    creator?: string
    botToken?: string
    appId?: string
    appSecret?: string
    domain?: string
    sandbox?: boolean
    authId?: string
  }) => Promise<void> | void
  onProbe: (input: {
    channel: string
    botToken?: string
    appId?: string
    appSecret?: string
    domain?: string
    sandbox?: boolean
  }) => Promise<UiChannelAccountProbeResult | null>
  onRemove: (id: string) => Promise<void> | void
}

export function GlobalChannelAccountsSection(props: GlobalChannelAccountsSectionProps) {
  const { items, loading, onUpsert, onProbe, onRemove } = props
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<ChannelAccountFormState>(createEmptyForm)
  const [editingId, setEditingId] = React.useState("")
  const [pendingActions, setPendingActions] = React.useState<Record<string, boolean>>({})
  const [probeStatus, setProbeStatus] = React.useState<ProbeStatus>("idle")
  const [probeMessage, setProbeMessage] = React.useState("")

  const isEditing = Boolean(editingId)

  const formErrors = React.useMemo(() => {
    return validateForConfirm({
      form,
      probeStatus,
    })
  }, [form, probeStatus])

  const canConfirm = formErrors.length === 0

  const isPending = React.useCallback((key: string) => Boolean(pendingActions[key]), [pendingActions])

  const runWithPending = React.useCallback(async (key: string, runner: () => Promise<void>) => {
    setPendingActions((prev) => ({ ...prev, [key]: true }))
    try {
      await runner()
    } finally {
      setPendingActions((prev) => ({ ...prev, [key]: false }))
    }
  }, [])

  const readyCount = items.filter((item) => isAccountCredentialReady(item)).length

  const openCreateDialog = () => {
    setEditingId("")
    setForm(createEmptyForm())
    setProbeStatus("idle")
    setProbeMessage("")
    setDialogOpen(true)
  }

  const openEditDialog = (item: UiChannelAccountItem) => {
    setEditingId(String(item.id || "").trim())
    setForm({
      id: String(item.id || "").trim(),
      channel: String(item.channel || "telegram").trim().toLowerCase() || "telegram",
      name: String(item.name || "").trim(),
      identity: String(item.identity || "").trim(),
      owner: String(item.owner || "").trim(),
      creator: String(item.creator || "").trim(),
      domain: String(item.domain || "").trim(),
      sandbox: item.sandbox === true,
      authId: String(item.authId || "").trim(),
      botToken: "",
      appId: "",
      appSecret: "",
    })
    setProbeStatus("idle")
    setProbeMessage("")
    setDialogOpen(true)
  }

  const closeDialog = () => {
    setDialogOpen(false)
  }

  const probeBotProfile = async () => {
    if (!requiredCredsReady(form)) return
    setProbeStatus("idle")
    setProbeMessage("")
    const result = await onProbe({
      channel: form.channel,
      botToken: trimText(form.botToken) || undefined,
      appId: trimText(form.appId) || undefined,
      appSecret: trimText(form.appSecret) || undefined,
      domain: trimText(form.domain) || undefined,
      sandbox: form.sandbox,
    })
    if (!result) {
      setProbeStatus("failed")
      setProbeMessage("测试失败")
      return
    }

    setProbeStatus("passed")
    setProbeMessage(String(result.message || "").trim() || "测试通过")
    setForm((prev) => ({
      ...prev,
      id: isEditing ? prev.id : String(result.accountId || "").trim() || prev.id,
      name: String(result.name || "").trim() || prev.name,
      identity: prev.identity.trim() || String(result.identity || "").trim(),
      owner: prev.owner.trim() || String(result.owner || "").trim(),
      creator: prev.creator.trim() || String(result.creator || "").trim(),
    }))
  }

  const confirmAccount = async () => {
    if (!canConfirm) return
    await Promise.resolve(
      onUpsert({
        id: trimText(form.id),
        channel: trimText(form.channel),
        name: trimText(form.name),
        identity: trimText(form.identity) || undefined,
        owner: trimText(form.owner) || undefined,
        creator: trimText(form.creator) || undefined,
        domain: trimText(form.domain) || undefined,
        sandbox: form.sandbox,
        authId: trimText(form.authId) || undefined,
        botToken: trimText(form.botToken) || undefined,
        appId: trimText(form.appId) || undefined,
        appSecret: trimText(form.appSecret) || undefined,
      }),
    )
    setDialogOpen(false)
  }

  return (
    <section className="space-y-4">
      <section className="space-y-3 rounded-[22px] bg-card p-4 shadow-[0_1px_0_rgba(17,17,19,0.02)]">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Channel Accounts</div>
            <div className="text-sm text-muted-foreground">已配置 {items.length} 个，凭据完整 {readyCount} 个</div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-9 gap-1.5 rounded-[12px] px-3"
            onClick={openCreateDialog}
            disabled={loading}
          >
            <PlusIcon className="size-4" />
            新建账号
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[18px] bg-secondary py-6 text-center text-sm text-muted-foreground">暂无 channel account</div>
        ) : (
          <div className="space-y-2.5">
            {items.map((item) => {
              const id = String(item.id || "").trim()
              if (!id) return null
              const ready = isAccountCredentialReady(item)
              const metaText = buildMetaText(item)
              const secondLine = `${id}${metaText ? ` · ${metaText}` : ""}`
              return (
                <div
                  key={id}
                  className="group flex items-center gap-3 rounded-[18px] bg-transparent px-3.5 py-3 transition-colors hover:bg-background"
                >
                  <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${ready ? "bg-emerald-500" : "bg-zinc-400"}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium text-foreground">{item.name || id}</div>
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-[10px] border-border/60 bg-secondary px-1.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {channelDisplayName(item.channel || "")}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground/90" title={secondLine}>
                      {secondLine}
                    </div>
                  </div>
                  <div className="hidden text-xs text-muted-foreground md:block">{formatTime(item.updatedAt)}</div>
                  <div className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-[11px]"
                      onClick={() => openEditDialog(item)}
                      title="编辑"
                      aria-label="编辑"
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-[11px] text-destructive"
                      onClick={() => {
                        void runWithPending(`bot:remove:${id}`, async () => {
                          await Promise.resolve(onRemove(id))
                        })
                      }}
                      disabled={isPending(`bot:remove:${id}`)}
                      title="删除"
                      aria-label="删除"
                    >
                      {isPending(`bot:remove:${id}`) ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="w-[min(92vw,560px)]">
          <DialogHeader>
            <DialogTitle>{isEditing ? "编辑 Channel Account" : "新建 Channel Account"}</DialogTitle>
            <DialogDescription>填写必要凭据，先测试，通过后确认。</DialogDescription>
          </DialogHeader>

          <div className="max-h-[62vh] space-y-4 overflow-y-auto px-4 pb-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Channel</Label>
              {isEditing ? (
                <div className="rounded-[16px] bg-secondary px-3 py-2.5 text-sm text-foreground">
                  {channelDisplayName(form.channel)}
                </div>
              ) : (
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
                    <span>{channelDisplayName(form.channel)}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[12rem]">
                    {CHANNEL_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => {
                          const nextChannel = String(option.value || "").trim() || "telegram"
                          setForm((prev) => ({
                            ...prev,
                            channel: nextChannel,
                            id: "",
                            name: "",
                            identity: "",
                            owner: "",
                            creator: "",
                            botToken: "",
                            appId: "",
                            appSecret: "",
                            domain: "",
                            sandbox: false,
                          }))
                          setProbeStatus("idle")
                          setProbeMessage("")
                        }}
                      >
                        {form.channel === option.value ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                        <span>{option.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="space-y-2.5 rounded-[18px] bg-secondary p-3">
              <Label className="text-xs text-muted-foreground">Credentials</Label>
              {form.channel === "telegram" ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    botToken <span className="text-destructive">*</span>
                  </Label>
                    <Input
                      type="password"
                      placeholder="botToken"
                      className="h-10 rounded-[12px]"
                    value={form.botToken}
                    onChange={(event) => {
                      const value = event.target.value
                      setForm((prev) => ({ ...prev, botToken: value }))
                      setProbeStatus("idle")
                      setProbeMessage("")
                    }}
                  />
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      appId <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="appId"
                      className="h-10 rounded-[12px]"
                      value={form.appId}
                      onChange={(event) => {
                        const value = event.target.value
                        setForm((prev) => ({ ...prev, appId: value }))
                        setProbeStatus("idle")
                        setProbeMessage("")
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      appSecret <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      placeholder="appSecret"
                      className="h-10 rounded-[12px]"
                      value={form.appSecret}
                      onChange={(event) => {
                        const value = event.target.value
                        setForm((prev) => ({ ...prev, appSecret: value }))
                        setProbeStatus("idle")
                        setProbeMessage("")
                      }}
                    />
                  </div>
                </div>
              )}

              {form.channel === "feishu" ? (
                <Input
                  placeholder="domain（可选）"
                  className="h-10 rounded-[12px]"
                  value={form.domain}
                  onChange={(event) => setForm((prev) => ({ ...prev, domain: event.target.value }))}
                />
              ) : null}

              {form.channel === "qq" ? (
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
                    <span>{form.sandbox ? "测试环境" : "生产环境"}</span>
                    <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-[10rem]">
                    <DropdownMenuItem
                      onClick={() => {
                        setForm((prev) => ({ ...prev, sandbox: false }))
                        setProbeStatus("idle")
                        setProbeMessage("")
                      }}
                    >
                      {form.sandbox ? <span className="inline-block w-4" /> : <CheckIcon className="size-4" />}
                      <span>生产环境</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setForm((prev) => ({ ...prev, sandbox: true }))
                        setProbeStatus("idle")
                        setProbeMessage("")
                      }}
                    >
                      {form.sandbox ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                      <span>测试环境</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button size="sm" variant="outline" className="h-9 rounded-[12px] px-4" onClick={closeDialog}>
              取消
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 rounded-[12px] px-4"
              disabled={!requiredCredsReady(form) || isPending("bot:probe") || isPending("bot:confirm")}
              onClick={() => {
                void runWithPending("bot:probe", async () => {
                  await probeBotProfile()
                })
              }}
            >
              {isPending("bot:probe") ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : <SparklesIcon className="mr-1 size-3.5" />}
              测试
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-[12px] px-4"
              disabled={!canConfirm || isPending("bot:confirm")}
              onClick={() => {
                void runWithPending("bot:confirm", async () => {
                  await confirmAccount()
                })
              }}
            >
              {isPending("bot:confirm") ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null}
              下一步：确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
