/**
 * Context 列表总览区。
 */

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
}

type ChannelConfigDraft = {
  botToken: string
  appId: string
  appSecret: string
  domain: string
  auth_id: string
  groupAccess: "" | "anyone" | "initiator_or_admin"
  sandbox: "" | "true" | "false"
  followupWindowMs: string
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
  return {
    botToken: "",
    appId: String(config.appId || "").trim(),
    appSecret: "",
    domain: String(config.domain || "").trim(),
    auth_id: String(config.auth_id || "").trim(),
    groupAccess:
      config.groupAccess === "anyone" || config.groupAccess === "initiator_or_admin"
        ? (config.groupAccess as "anyone" | "initiator_or_admin")
        : "",
    sandbox: config.sandbox === true ? "true" : config.sandbox === false ? "false" : "",
    followupWindowMs:
      typeof config.followupWindowMs === "number" && Number.isFinite(config.followupWindowMs)
        ? String(config.followupWindowMs)
        : "",
  }
}

export function ContextOverviewSection(props: ContextOverviewSectionProps) {
  const {
    contexts,
    chatChannels,
    selectedContextId,
    formatTime,
    onOpenContext,
    onChatAction,
    onChatConfigure,
  } = props

  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | ContextGroupKey>("all")
  const [editingChannel, setEditingChannel] = React.useState("")
  const [draftByChannel, setDraftByChannel] = React.useState<Record<string, ChannelConfigDraft>>({})

  const filteredContexts = filterContextsByKeyword(contexts, search)
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
            : "unknown"
      counts.set(channel, (counts.get(channel) || 0) + 1)
    }
    return counts
  }, [contexts])

  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b border-border/70 pb-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Channels</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-0 py-2 font-medium">Channel</th>
                <th className="px-2 py-2 font-medium">State</th>
                <th className="px-2 py-2 font-medium">Mapped Contexts</th>
                <th className="px-2 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {chatChannels.length === 0 ? (
                <tr>
                  <td className="px-0 py-4 text-sm text-muted-foreground" colSpan={4}>
                    暂无 channel 状态
                  </td>
                </tr>
              ) : (
                chatChannels.map((channel) => {
                  const name = String(channel.channel || "unknown")
                  const linkState = String(channel.linkState || "unknown")
                  const mappedCount = channelContextStats.get(name) || 0
                  const tone =
                    linkState === "connected"
                      ? "border-border bg-muted/45 text-foreground"
                      : linkState === "disconnected" || linkState === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border bg-muted/35 text-muted-foreground"
                  const actionDisabled = !(channel.enabled === true && channel.configured === true)
                  const isEditing = editingChannel === name
                  const configSummary = parseChannelConfigSummary(channel)
                  const draft = draftByChannel[name] || initDraftFromChannel(channel)

                  const onDraftChange = (next: Partial<ChannelConfigDraft>) => {
                    setDraftByChannel((prev) => ({
                      ...prev,
                      [name]: {
                        ...(prev[name] || initDraftFromChannel(channel)),
                        ...next,
                      },
                    }))
                  }

                  const saveConfig = () => {
                    const patch: Record<string, unknown> = {}
                    if (name === "telegram") {
                      if (draft.botToken.trim()) patch.botToken = draft.botToken.trim()
                      if (draft.auth_id.trim()) patch.auth_id = draft.auth_id.trim()
                      if (draft.groupAccess) patch.groupAccess = draft.groupAccess
                      if (draft.followupWindowMs.trim()) patch.followupWindowMs = draft.followupWindowMs.trim()
                    } else if (name === "feishu") {
                      if (draft.appId.trim()) patch.appId = draft.appId.trim()
                      if (draft.appSecret.trim()) patch.appSecret = draft.appSecret.trim()
                      if (draft.domain.trim()) patch.domain = draft.domain.trim()
                      if (draft.auth_id.trim()) patch.auth_id = draft.auth_id.trim()
                    } else if (name === "qq") {
                      if (draft.appId.trim()) patch.appId = draft.appId.trim()
                      if (draft.appSecret.trim()) patch.appSecret = draft.appSecret.trim()
                      if (draft.sandbox) patch.sandbox = draft.sandbox === "true"
                      if (draft.auth_id.trim()) patch.auth_id = draft.auth_id.trim()
                      if (draft.groupAccess) patch.groupAccess = draft.groupAccess
                    }
                    onChatConfigure(name, patch)
                  }

                  return (
                    <React.Fragment key={name}>
                      <tr className="border-b border-border/50">
                        <td className="px-0 py-2 text-sm font-medium">{name}</td>
                        <td className="px-2 py-2">
                          <Badge variant="outline" className={tone}>
                            {linkState}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-sm text-muted-foreground">{mappedCount}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={channel.enabled === true}
                              onClick={() => onChatAction("open", name)}
                            >
                              open
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={channel.enabled !== true}
                              onClick={() => onChatAction("close", name)}
                            >
                              close
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={actionDisabled}
                              onClick={() => onChatAction("test", name)}
                            >
                              test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={actionDisabled}
                              onClick={() => onChatAction("reconnect", name)}
                            >
                              reconnect
                            </Button>
                            <Button
                              size="sm"
                              variant={isEditing ? "secondary" : "outline"}
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingChannel("")
                                  return
                                }
                                setDraftByChannel((prev) => ({
                                  ...prev,
                                  [name]: prev[name] || initDraftFromChannel(channel),
                                }))
                                setEditingChannel(name)
                              }}
                            >
                              {isEditing ? "hide config" : "configure"}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {isEditing ? (
                        <tr className="border-b border-border/40">
                          <td className="px-0 py-3 text-xs text-muted-foreground" colSpan={4}>
                            <div className="space-y-3">
                              <div className="text-[11px]">仅填写要更新的字段；密钥留空表示不改。保存后会自动重载该 channel。</div>

                              {name === "telegram" ? (
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                  <Input
                                    type="password"
                                    placeholder="botToken（可选更新）"
                                    value={draft.botToken}
                                    onChange={(event) => onDraftChange({ botToken: event.target.value })}
                                  />
                                  <Input
                                    placeholder="auth_id"
                                    value={draft.auth_id}
                                    onChange={(event) => onDraftChange({ auth_id: event.target.value })}
                                  />
                                  <Select
                                    value={draft.groupAccess || "anyone"}
                                    onValueChange={(value) =>
                                      onDraftChange({
                                        groupAccess: value as "anyone" | "initiator_or_admin",
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="groupAccess" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="anyone">anyone</SelectItem>
                                      <SelectItem value="initiator_or_admin">initiator_or_admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    placeholder="followupWindowMs"
                                    value={draft.followupWindowMs}
                                    onChange={(event) => onDraftChange({ followupWindowMs: event.target.value })}
                                  />
                                </div>
                              ) : null}

                              {name === "feishu" ? (
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                                  <Input
                                    placeholder="appId"
                                    value={draft.appId}
                                    onChange={(event) => onDraftChange({ appId: event.target.value })}
                                  />
                                  <Input
                                    type="password"
                                    placeholder="appSecret（可选更新）"
                                    value={draft.appSecret}
                                    onChange={(event) => onDraftChange({ appSecret: event.target.value })}
                                  />
                                  <Input
                                    placeholder="domain"
                                    value={draft.domain}
                                    onChange={(event) => onDraftChange({ domain: event.target.value })}
                                  />
                                  <Input
                                    placeholder="auth_id"
                                    value={draft.auth_id}
                                    onChange={(event) => onDraftChange({ auth_id: event.target.value })}
                                  />
                                </div>
                              ) : null}

                              {name === "qq" ? (
                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                                  <Input
                                    placeholder="appId"
                                    value={draft.appId}
                                    onChange={(event) => onDraftChange({ appId: event.target.value })}
                                  />
                                  <Input
                                    type="password"
                                    placeholder="appSecret（可选更新）"
                                    value={draft.appSecret}
                                    onChange={(event) => onDraftChange({ appSecret: event.target.value })}
                                  />
                                  <Input
                                    placeholder="auth_id"
                                    value={draft.auth_id}
                                    onChange={(event) => onDraftChange({ auth_id: event.target.value })}
                                  />
                                  <Select
                                    value={draft.groupAccess || "anyone"}
                                    onValueChange={(value) =>
                                      onDraftChange({
                                        groupAccess: value as "anyone" | "initiator_or_admin",
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="groupAccess" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="anyone">anyone</SelectItem>
                                      <SelectItem value="initiator_or_admin">initiator_or_admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={draft.sandbox || "false"}
                                    onValueChange={(value) =>
                                      onDraftChange({
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

                              <div className="flex items-center justify-between">
                                <div className="max-w-[70%] truncate text-[11px] text-muted-foreground" title={JSON.stringify(configSummary)}>
                                  当前摘要: {JSON.stringify(configSummary)}
                                </div>
                                <Button size="sm" onClick={saveConfig}>
                                  保存并重载
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
            {(["all", "local_ui", "chat", "api", "other"] as const).map((key) => (
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
    </div>
  )
}
