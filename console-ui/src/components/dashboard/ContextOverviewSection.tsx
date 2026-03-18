/**
 * Context 列表总览区。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { UiChatChannelStatus, UiContextSummary } from "@/types/Dashboard"
import {
  buildContextGroups,
  filterContextsByKeyword,
  resolveContextGroup,
  type ContextGroupKey,
} from "@/lib/context-groups"

export interface ContextOverviewSectionProps {
  /**
   * context 摘要列表。
   */
  contexts: UiContextSummary[]
  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * 当前选中的 context id。
   */
  selectedContextId: string
  /**
   * 当前聚焦的渠道。
   */
  focusedChannel?: string
  /**
   * 时间格式化函数。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 打开 context workspace。
   */
  onOpenContext: (contextId: string) => void
  /**
   * 渠道动作。
   */
  onChatAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => void
  /**
   * 保存渠道配置。
   */
  onChatConfigure: (channel: string, config: Record<string, unknown>) => void
  /**
   * 当前 channel 的身份展示文案（来自 agent chatProfiles）。
   */
  channelIdentity?: string
}

type ChannelConfigDraft = {
  botToken: string
  appId: string
  appSecret: string
  domain: string
  auth_id: string
  sandbox: "" | "true" | "false"
}

function parseChannelConfigSummary(channel: UiChatChannelStatus): Record<string, unknown> {
  const detail = channel.detail
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {}
  const raw = (detail as Record<string, unknown>).config
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function initDraftFromChannel(channel: UiChatChannelStatus): ChannelConfigDraft {
  const config = parseChannelConfigSummary(channel)
  const appIdFromConfig = String(config.appIdFromConfig || "").trim()
  const appIdSource = String(config.appIdSource || "").trim().toLowerCase()
  return {
    botToken: "",
    // 关键点（中文）：输入框仅回填 ship.json 中已有值，避免把 env 回退值误写回配置。
    appId: appIdFromConfig || (appIdSource === "ship" ? String(config.appId || "").trim() : ""),
    appSecret: "",
    domain: String(config.domain || "").trim(),
    auth_id: String(config.auth_id || "").trim(),
    sandbox: config.sandbox === true ? "true" : config.sandbox === false ? "false" : "",
  }
}

function resolveChannelFromContextId(contextIdInput?: string): string {
  const contextId = String(contextIdInput || "").trim().toLowerCase()
  if (!contextId) return "other"
  if (contextId.startsWith("telegram-")) return "telegram"
  if (contextId.startsWith("qq-")) return "qq"
  if (contextId.startsWith("feishu-")) return "feishu"
  if (contextId.startsWith("consoleui-") || contextId === "local_ui") return "consoleui"
  return "other"
}

function BasicRow(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className="truncate text-foreground" title={props.value}>{props.value || "-"}</div>
    </div>
  )
}

function toYesNo(value: boolean | undefined): string {
  return value === true ? "yes" : "no"
}

function readDetailString(detail: Record<string, unknown> | undefined, key: string): string {
  if (!detail) return ""
  const value = detail[key]
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

export function ContextOverviewSection(props: ContextOverviewSectionProps) {
  const {
    contexts,
    chatChannels,
    selectedContextId,
    focusedChannel,
    formatTime,
    onOpenContext,
    onChatAction,
    onChatConfigure,
    channelIdentity,
  } = props

  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | ContextGroupKey>("all")
  const [draftByChannel, setDraftByChannel] = React.useState<Record<string, ChannelConfigDraft>>({})
  const [configDialogOpen, setConfigDialogOpen] = React.useState(false)
  const normalizedFocusedChannel = String(focusedChannel || "").trim().toLowerCase()
  const contextsInFocusedChannel = React.useMemo(() => {
    if (!normalizedFocusedChannel) return []
    return contexts.filter((item) => resolveChannelFromContextId(item.contextId) === normalizedFocusedChannel)
  }, [contexts, normalizedFocusedChannel])
  const visibleChatChannels = React.useMemo(() => {
    if (!normalizedFocusedChannel) return []
    return chatChannels.filter(
      (channel) => String(channel.channel || "").trim().toLowerCase() === normalizedFocusedChannel,
    )
  }, [chatChannels, normalizedFocusedChannel])

  const filteredContexts = filterContextsByKeyword(contextsInFocusedChannel, search)
  const grouped = buildContextGroups(filteredContexts)
  const visibleContexts = grouped
    .filter((group) => (filter === "all" ? true : group.key === filter))
    .flatMap((group) => group.items)

  const channelContextStats = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of contexts) {
      const group = resolveContextGroup(item.contextId)
      if (group !== "chat") continue
      const raw = String(item.contextId || "")
      const channel = raw.startsWith("telegram-")
        ? "telegram"
        : raw.startsWith("qq-")
          ? "qq"
          : raw.startsWith("feishu-")
            ? "feishu"
            : raw.startsWith("consoleui-") || raw === "local_ui"
              ? "consoleui"
            : "unknown"
      counts.set(channel, (counts.get(channel) || 0) + 1)
    }
    return counts
  }, [contexts])
  const activeChannel = visibleChatChannels[0] || null
  const activeChannelName = String(activeChannel?.channel || "").trim()
  const activeLinkState = String(activeChannel?.linkState || "unknown").trim().toLowerCase()
  const activeMappedContexts = activeChannelName ? (channelContextStats.get(activeChannelName) || 0) : 0
  const activeDetail = React.useMemo(() => {
    if (!activeChannel?.detail || typeof activeChannel.detail !== "object" || Array.isArray(activeChannel.detail)) return undefined
    return activeChannel.detail as Record<string, unknown>
  }, [activeChannel?.detail])
  const activeConfigSummary = React.useMemo(() => {
    return activeChannel ? parseChannelConfigSummary(activeChannel) : {}
  }, [activeChannel])
  const activeReadonly = React.useMemo(() => {
    if (!activeChannel) return false
    if (activeChannelName === "consoleui") return true
    return activeDetail?.readonly === true
  }, [activeChannel, activeChannelName, activeDetail])
  const activeBotName = React.useMemo(() => {
    if (!activeChannelName) return ""
    if (activeChannelName === "telegram") {
      const username = readDetailString(activeDetail, "botUsername")
      return username ? `@${username.replace(/^@+/, "")}` : ""
    }
    if (activeChannelName === "qq") {
      return (
        readDetailString(activeDetail, "botName") ||
        readDetailString(activeDetail, "nickname") ||
        readDetailString(activeDetail, "username")
      )
    }
    return ""
  }, [activeChannelName, activeDetail])
  const activeBotId = React.useMemo(() => {
    if (!activeChannelName) return ""
    if (activeChannelName === "telegram") {
      return readDetailString(activeDetail, "botId")
    }
    if (activeChannelName === "qq") {
      return readDetailString(activeDetail, "botUserId")
    }
    return ""
  }, [activeChannelName, activeDetail])
  const activeAppId = React.useMemo(() => {
    if (!activeChannelName) return ""
    if (activeChannelName === "qq") {
      return readDetailString(activeDetail, "appId") || String(activeConfigSummary.appId || "").trim()
    }
    if (activeChannelName === "feishu") {
      return String(activeConfigSummary.appId || "").trim()
    }
    return ""
  }, [activeChannelName, activeConfigSummary, activeDetail])
  const activeAuthId = React.useMemo(() => {
    return String(activeConfigSummary.auth_id || "").trim()
  }, [activeConfigSummary])
  const activeAppIdFromConfig = React.useMemo(() => {
    return String(activeConfigSummary.appIdFromConfig || "").trim()
  }, [activeConfigSummary])
  const activeAppIdSource = React.useMemo(() => {
    const source = String(activeConfigSummary.appIdSource || "").trim().toLowerCase()
    if (source === "ship" || source === "env" || source === "none") return source
    return activeAppId ? "ship" : "none"
  }, [activeAppId, activeConfigSummary])
  const activeBotTokenConfigured = activeConfigSummary.botTokenConfigured === true
  const activeAppSecretConfigured = activeConfigSummary.appSecretConfigured === true
  const activeIdentity = String(channelIdentity || "").trim() || activeBotName || "-"
  const activeChannelDraft = React.useMemo(() => {
    if (!activeChannelName || !activeChannel) return null
    return draftByChannel[activeChannelName] || initDraftFromChannel(activeChannel)
  }, [activeChannel, activeChannelName, draftByChannel])

  React.useEffect(() => {
    if (!activeChannelName || !activeChannel) return
    setDraftByChannel((prev) => ({
      ...prev,
      [activeChannelName]: prev[activeChannelName] || initDraftFromChannel(activeChannel),
    }))
  }, [activeChannel, activeChannelName])

  React.useEffect(() => {
    setConfigDialogOpen(false)
  }, [activeChannelName])

  const onActiveDraftChange = (next: Partial<ChannelConfigDraft>) => {
    if (!activeChannelName || !activeChannel) return
    setDraftByChannel((prev) => ({
      ...prev,
      [activeChannelName]: {
        ...(prev[activeChannelName] || initDraftFromChannel(activeChannel)),
        ...next,
      },
    }))
  }

  const resetActiveDraft = () => {
    if (!activeChannelName || !activeChannel) return
    setDraftByChannel((prev) => ({
      ...prev,
      [activeChannelName]: initDraftFromChannel(activeChannel),
    }))
  }

  const saveActiveChannelConfig = () => {
    if (!activeChannel || !activeChannelDraft || !activeChannelName) return
    const patch: Record<string, unknown> = {}
    if (activeChannelName === "telegram") {
      if (activeChannelDraft.botToken.trim()) patch.botToken = activeChannelDraft.botToken.trim()
      if (activeChannelDraft.auth_id.trim()) patch.auth_id = activeChannelDraft.auth_id.trim()
    } else if (activeChannelName === "feishu") {
      if (activeChannelDraft.appId.trim()) patch.appId = activeChannelDraft.appId.trim()
      if (activeChannelDraft.appSecret.trim()) patch.appSecret = activeChannelDraft.appSecret.trim()
      if (activeChannelDraft.domain.trim()) patch.domain = activeChannelDraft.domain.trim()
      if (activeChannelDraft.auth_id.trim()) patch.auth_id = activeChannelDraft.auth_id.trim()
    } else if (activeChannelName === "qq") {
      if (activeChannelDraft.appId.trim()) patch.appId = activeChannelDraft.appId.trim()
      if (activeChannelDraft.appSecret.trim()) patch.appSecret = activeChannelDraft.appSecret.trim()
      if (activeChannelDraft.sandbox) patch.sandbox = activeChannelDraft.sandbox === "true"
      if (activeChannelDraft.auth_id.trim()) patch.auth_id = activeChannelDraft.auth_id.trim()
    }
    onChatConfigure(activeChannelName, patch)
  }

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        {!activeChannel ? (
          <section className="rounded-md bg-muted/70 px-3 py-5 text-sm text-muted-foreground">
            当前 channel 暂无状态
          </section>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 px-1 py-1">
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold leading-none text-foreground">{activeChannelName || "unknown"}</div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={`size-1.5 rounded-full ${
                      activeLinkState === "connected"
                        ? "bg-emerald-500"
                        : activeLinkState === "disconnected" || activeLinkState === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground/60"
                    }`}
                  />
                  <span>{`link ${activeLinkState || "-"}`}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={activeReadonly || activeChannel.enabled === true}
                  onClick={() => onChatAction("open", activeChannelName)}
                >
                  open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={activeReadonly || activeChannel.enabled !== true}
                  onClick={() => onChatAction("close", activeChannelName)}
                >
                  close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={activeReadonly || !(activeChannel.enabled === true && activeChannel.configured === true)}
                  onClick={() => onChatAction("test", activeChannelName)}
                >
                  test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={activeReadonly || !(activeChannel.enabled === true && activeChannel.configured === true)}
                  onClick={() => onChatAction("reconnect", activeChannelName)}
                >
                  reconnect
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px]"
                  disabled={activeReadonly}
                  onClick={() => setConfigDialogOpen(true)}
                >
                  configuration
                </Button>
              </div>
            </div>

            <section className="rounded-md bg-muted/70 px-3 py-2">
              <BasicRow label="Channel" value={activeChannelName || "-"} />
              <BasicRow label="Identity" value={activeIdentity} />
              <BasicRow label="Bot Name" value={activeBotName || "-"} />
              <BasicRow label="Bot ID" value={activeBotId || "-"} />
              <BasicRow label="App ID" value={activeAppId || "-"} />
              <BasicRow label="App ID (ship.json)" value={activeAppIdFromConfig || "-"} />
              <BasicRow label="App ID Source" value={activeAppIdSource} />
              <BasicRow label="Auth ID" value={activeAuthId || "-"} />
              <BasicRow label="Mapped Contexts" value={String(activeMappedContexts)} />
              <BasicRow label="Enabled" value={toYesNo(activeChannel.enabled)} />
              <BasicRow label="Configured" value={toYesNo(activeChannel.configured)} />
              <BasicRow label="Running" value={toYesNo(activeChannel.running)} />
              <BasicRow label="Link" value={String(activeChannel.linkState || "-")} />
              <BasicRow label="Status" value={String(activeChannel.statusText || "-")} />
            </section>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-border/70 pb-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contexts</div>
          <div className="text-xs text-muted-foreground">{`total ${visibleContexts.length}`}</div>
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索 contextId / role / message"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "chat", "api", "other"] as const).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={filter === key ? "default" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => setFilter(key)}
              >
                {key}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-0 py-2 font-medium">Context</th>
                <th className="px-2 py-2 font-medium">Group</th>
                <th className="px-2 py-2 font-medium">Messages</th>
                <th className="px-2 py-2 font-medium">Updated</th>
                <th className="px-2 py-2 font-medium">Preview</th>
                <th className="px-2 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleContexts.length === 0 ? (
                <tr>
                  <td className="px-0 py-4 text-sm text-muted-foreground" colSpan={6}>
                    当前筛选条件下无 context
                  </td>
                </tr>
              ) : (
                visibleContexts.map((item) => {
                  const group = resolveContextGroup(item.contextId)
                  const isSelected = item.contextId === selectedContextId
                  return (
                    <tr key={item.contextId} className={`border-b border-border/50 ${isSelected ? "bg-muted/25" : ""}`}>
                      <td className="max-w-[22rem] truncate px-0 py-2 font-mono text-xs" title={item.contextId}>
                        {item.contextId}
                      </td>
                      <td className="px-2 py-2 text-xs uppercase text-muted-foreground">{group}</td>
                      <td className="px-2 py-2 text-sm text-muted-foreground">{item.messageCount || 0}</td>
                      <td className="px-2 py-2 text-sm text-muted-foreground">{formatTime(item.updatedAt)}</td>
                      <td className="max-w-[18rem] truncate px-2 py-2 text-xs text-muted-foreground" title={item.lastText || ""}>
                        {`${item.lastRole || "unknown"} · ${item.lastText || "(empty)"}`}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant={isSelected ? "secondary" : "outline"} onClick={() => onOpenContext(item.contextId)}>
                          {isSelected ? "已打开" : "打开"}
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="w-[min(94vw,780px)]">
          <DialogHeader>
            <DialogTitle>{`Configuration · ${activeChannelName || "-"}`}</DialogTitle>
            <DialogDescription>仅填写要更新的字段；密钥留空表示不改。保存后会自动重载该 channel。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-2">
            {activeChannelName === "telegram" && activeChannelDraft ? (
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  type="password"
                  placeholder={
                    activeBotTokenConfigured
                      ? "botToken（已配置，留空表示不改）"
                      : "botToken（可选更新）"
                  }
                  value={activeChannelDraft.botToken}
                  onChange={(event) => onActiveDraftChange({ botToken: event.target.value })}
                />
                <Input
                  placeholder="auth_id"
                  value={activeChannelDraft.auth_id}
                  onChange={(event) => onActiveDraftChange({ auth_id: event.target.value })}
                />
              </div>
            ) : null}

            {activeChannelName === "feishu" && activeChannelDraft ? (
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder={activeAppIdSource === "env" ? `appId（当前来自 env: ${activeAppId || "-"}）` : "appId"}
                  value={activeChannelDraft.appId}
                  onChange={(event) => onActiveDraftChange({ appId: event.target.value })}
                />
                <Input
                  type="password"
                  placeholder={
                    activeAppSecretConfigured
                      ? "appSecret（已配置，留空表示不改）"
                      : "appSecret（可选更新）"
                  }
                  value={activeChannelDraft.appSecret}
                  onChange={(event) => onActiveDraftChange({ appSecret: event.target.value })}
                />
                <Input
                  placeholder="domain"
                  value={activeChannelDraft.domain}
                  onChange={(event) => onActiveDraftChange({ domain: event.target.value })}
                />
                <Input
                  placeholder="auth_id"
                  value={activeChannelDraft.auth_id}
                  onChange={(event) => onActiveDraftChange({ auth_id: event.target.value })}
                />
              </div>
            ) : null}

            {activeChannelName === "qq" && activeChannelDraft ? (
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  placeholder={activeAppIdSource === "env" ? `appId（当前来自 env: ${activeAppId || "-"}）` : "appId"}
                  value={activeChannelDraft.appId}
                  onChange={(event) => onActiveDraftChange({ appId: event.target.value })}
                />
                <Input
                  type="password"
                  placeholder={
                    activeAppSecretConfigured
                      ? "appSecret（已配置，留空表示不改）"
                      : "appSecret（可选更新）"
                  }
                  value={activeChannelDraft.appSecret}
                  onChange={(event) => onActiveDraftChange({ appSecret: event.target.value })}
                />
                <Input
                  placeholder="auth_id"
                  value={activeChannelDraft.auth_id}
                  onChange={(event) => onActiveDraftChange({ auth_id: event.target.value })}
                />
                <Select
                  value={activeChannelDraft.sandbox || "false"}
                  onValueChange={(value) =>
                    onActiveDraftChange({
                      sandbox: value as "true" | "false",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="sandbox" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">sandbox: false</SelectItem>
                    <SelectItem value="true">sandbox: true</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="truncate text-[11px] text-muted-foreground" title={JSON.stringify(activeConfigSummary)}>
              当前摘要: {JSON.stringify(activeConfigSummary)}
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={resetActiveDraft}>
              重置
            </Button>
            <Button
              size="sm"
              onClick={() => {
                saveActiveChannelConfig()
                setConfigDialogOpen(false)
              }}
            >
              保存并重载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
