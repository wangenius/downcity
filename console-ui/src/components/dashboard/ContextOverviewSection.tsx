/**
 * Context 列表总览区。
 *
 * 关键点（中文）
 * - 渠道主视图的 configuration 采用右上角 dropdown menu 直接切换 channel account。
 * - 切换来源限定为当前全局 Channel Account 库，不再打开复杂配置弹窗。
 * - agent 渠道页只负责“绑定关系与运行状态”，不展示 bot 详情信息。
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { UiChannelAccountItem, UiChatChannelStatus, UiContextSummary } from "@/types/Dashboard"
import {
  buildContextGroups,
  filterContextsByKeyword,
  resolveContextChannel,
  resolveContextGroup,
  type ContextGroupKey,
} from "@/lib/context-groups"
import { parseChannelConfigSummary, parseChannelConfigurationDescriptor, parseChannelDetail } from "./context-overview-config"
import { CheckIcon, ChevronDownIcon, Trash2Icon } from "lucide-react"

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
   * 全局 channel account 列表。
   */
  channelAccounts: UiChannelAccountItem[]
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
   * 删除指定 context。
   */
  onDeleteContext: (contextId: string) => void
  /**
   * 正在删除的 context id。
   */
  deletingContextId?: string
  /**
   * 渠道动作。
   */
  onChatAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => void
  /**
   * 保存渠道配置。
   */
  onChatConfigure: (channel: string, config: Record<string, unknown>) => void
}

export function ContextOverviewSection(props: ContextOverviewSectionProps) {
  const {
    contexts,
    chatChannels,
    channelAccounts,
    selectedContextId,
    focusedChannel,
    formatTime,
    onOpenContext,
    onDeleteContext,
    deletingContextId,
    onChatAction,
    onChatConfigure,
  } = props

  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | ContextGroupKey>("all")

  const normalizedFocusedChannel = String(focusedChannel || "").trim().toLowerCase()
  const contextsInFocusedChannel = React.useMemo(() => {
    if (!normalizedFocusedChannel) return []
    return contexts.filter((item) => resolveContextChannel(item) === normalizedFocusedChannel)
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

  const activeChannel = visibleChatChannels[0] || null
  const activeChannelName = String(activeChannel?.channel || "").trim()
  const activeLinkState = String(activeChannel?.linkState || "unknown").trim().toLowerCase()

  const activeDetail = React.useMemo(() => {
    if (!activeChannel) return undefined
    const detail = parseChannelDetail(activeChannel)
    return detail ? (detail as Record<string, unknown>) : undefined
  }, [activeChannel])
  const activeConfigSummary = React.useMemo(() => {
    return activeChannel ? parseChannelConfigSummary(activeChannel) : {}
  }, [activeChannel])
  const activeConfigDescriptor = React.useMemo(() => {
    return activeChannel ? parseChannelConfigurationDescriptor(activeChannel) : null
  }, [activeChannel])

  const activeReadonly = React.useMemo(() => {
    if (!activeChannel) return false
    if (activeChannelName === "consoleui") return true
    if (activeDetail?.readonly === true) return true
    if (activeConfigDescriptor?.capabilities?.canConfigure === false) return true
    return false
  }, [activeChannel, activeChannelName, activeConfigDescriptor, activeDetail])

  const activeChannelAccountId = React.useMemo(() => String(activeConfigSummary.channelAccountId || "").trim(), [activeConfigSummary])
  const activeChannelAccounts = React.useMemo(() => {
    const channel = String(activeChannelName || "").trim().toLowerCase()
    if (!channel || channel === "consoleui") return []
    return channelAccounts.filter((item) => String(item.channel || "").trim().toLowerCase() === channel)
  }, [activeChannelName, channelAccounts])
  const activeChannelAccountLabel = React.useMemo(() => {
    if (!activeChannelAccountId) return "config"
    const target = activeChannelAccounts.find((item) => String(item.id || "").trim() === activeChannelAccountId)
    if (!target) return "config"
    return String(target.name || target.id || "config").trim() || "config"
  }, [activeChannelAccountId, activeChannelAccounts])

  const onChannelAccountSwitch = React.useCallback((value: string | null) => {
    if (!activeChannelName || activeReadonly) return
    const normalized = String(value || "").trim()
    const nextId = normalized === "__none__" ? "" : normalized
    if (nextId === activeChannelAccountId) return
    onChatConfigure(activeChannelName, {
      channelAccountId: nextId || null,
    })
  }, [activeChannelAccountId, activeChannelName, activeReadonly, onChatConfigure])

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
                {activeChannelName !== "consoleui" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 min-w-[9.5rem] max-w-[12rem] justify-between gap-1 px-2 text-[11px]"
                          disabled={activeReadonly}
                        />
                      }
                    >
                      <span className="truncate">{activeChannelAccountLabel}</span>
                      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-[12rem]">
                      <DropdownMenuItem onClick={() => onChannelAccountSwitch("__none__")}>
                        {activeChannelAccountId ? <span className="inline-block w-4" /> : <CheckIcon className="size-4" />}
                        <span>no binding</span>
                      </DropdownMenuItem>
                      {activeChannelAccounts.map((item) => {
                        const id = String(item.id || "").trim()
                        if (!id) return null
                        const name = String(item.name || "").trim() || id
                        const checked = id === activeChannelAccountId
                        return (
                          <DropdownMenuItem key={id} onClick={() => onChannelAccountSwitch(id)}>
                            {checked ? <CheckIcon className="size-4" /> : <span className="inline-block w-4" />}
                            <span className="truncate">{name}</span>
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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
              </div>
            </div>

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
                  const group = resolveContextGroup(item)
                  const isSelected = item.contextId === selectedContextId
                  const isDeleting = String(deletingContextId || "").trim() === item.contextId
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
                        <div className="inline-flex items-center gap-1.5">
                          <Button size="sm" variant={isSelected ? "secondary" : "outline"} onClick={() => onOpenContext(item.contextId)}>
                            {isSelected ? "已打开" : "打开"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={Boolean(deletingContextId)}
                            onClick={() => {
                              const confirmed = window.confirm(
                                `确认彻底删除 context「${item.contextId}」吗？该操作不可恢复。`,
                              )
                              if (!confirmed) return
                              onDeleteContext(item.contextId)
                            }}
                          >
                            <Trash2Icon className="size-3.5" />
                            <span>{isDeleting ? "删除中..." : "删除"}</span>
                          </Button>
                        </div>
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
