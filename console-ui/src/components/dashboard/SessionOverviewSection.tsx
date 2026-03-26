/**
 * Session 列表总览区。
 *
 * 关键点（中文）
 * - 渠道主视图的 configuration 采用右上角 dropdown menu 直接切换 channel account。
 * - 切换来源限定为当前全局 Channel Account 库，不再打开复杂配置弹窗。
 * - agent 渠道页只负责“绑定关系与运行状态”，不展示 bot 详情信息。
 */

import * as React from "react"
import { DashboardModule } from "@/components/dashboard/DashboardModule"
import { Button } from "@downcity/ui"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@downcity/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { getChannelDisplayName } from "@/lib/channel-label"
import type { UiChannelAccountItem, UiChatChannelStatus, UiSessionSummary } from "@/types/Dashboard"
import {
  buildSessionGroups,
  filterSessionsByKeyword,
  resolveSessionChannel,
  resolveSessionGroup,
  type SessionGroupKey,
} from "@/lib/context-groups"
import { parseChannelConfigSummary, parseChannelConfigurationDescriptor, parseChannelDetail } from "./context-overview-config"
import { CheckIcon, ChevronDownIcon, Code2Icon, ExternalLinkIcon, Trash2Icon } from "lucide-react"

const CHANNEL_DOCS_URL: Partial<Record<string, string>> = {
  feishu: "https://downcity.ai/zh/docs/services/chat/feishu",
}

function toOptionalRouteText(input: unknown): string | null {
  const text = String(input || "").trim()
  return text || null
}

function resolveChatDisplayName(item: UiSessionSummary): {
  value: string
  source: "title" | "chat_id" | "context_id"
} {
  const chatTitle = String(item.chatTitle || "").trim()
  const chatId = String(item.chatId || "").trim()
  // 关键点（中文）：避免把 `chatTitle===chatId`（常见 openid）误判成可读标题。
  if (chatTitle && (!chatId || chatTitle !== chatId)) return { value: chatTitle, source: "title" }
  if (chatId) return { value: chatId, source: "chat_id" }
  const contextId = String(item.contextId || "").trim() || "unknown"
  return { value: contextId, source: "context_id" }
}

function buildSessionRouteJson(item: UiSessionSummary): string {
  const display = resolveChatDisplayName(item)
  return JSON.stringify(
    {
      contextId: toOptionalRouteText(item.contextId),
      channel: toOptionalRouteText(resolveSessionChannel(item)),
      chatId: toOptionalRouteText(item.chatId),
      chatTitle: toOptionalRouteText(item.chatTitle),
      chatDisplayName: toOptionalRouteText(display.value),
      chatDisplayNameSource: display.source,
      chatType: toOptionalRouteText(item.chatType),
      threadId:
        typeof item.threadId === "number" && Number.isFinite(item.threadId)
          ? item.threadId
          : null,
    },
    null,
    2,
  )
}

export interface SessionOverviewSectionProps {
  /**
   * session 摘要列表。
   */
  sessions: UiSessionSummary[]
  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * 全局 channel account 列表。
   */
  channelAccounts: UiChannelAccountItem[]
  /**
   * 当前选中的 session id。
   */
  selectedSessionId: string
  /**
   * 当前聚焦的渠道。
   */
  focusedChannel?: string
  /**
   * 时间格式化函数。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 打开 session workspace。
   */
  onOpenSession: (sessionId: string) => void
  /**
   * 删除指定 session。
   */
  onDeleteSession: (sessionId: string) => void
  /**
   * 正在删除的 session id。
   */
  deletingSessionId?: string
  /**
   * 渠道动作。
   */
  onChatAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => void
  /**
   * 保存渠道配置。
   */
  onChatConfigure: (channel: string, config: Record<string, unknown>) => void
}

export function SessionOverviewSection(props: SessionOverviewSectionProps) {
  const {
    sessions,
    chatChannels,
    channelAccounts,
    selectedSessionId,
    focusedChannel,
    formatTime,
    onOpenSession,
    onDeleteSession,
    deletingSessionId,
    onChatAction,
    onChatConfigure,
  } = props
  const confirm = useConfirmDialog()

  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<"all" | SessionGroupKey>("all")

  const normalizedFocusedChannel = String(focusedChannel || "").trim().toLowerCase()
  const sessionsInFocusedChannel = React.useMemo(() => {
    if (!normalizedFocusedChannel) return []
    return sessions.filter((item) => resolveSessionChannel(item) === normalizedFocusedChannel)
  }, [sessions, normalizedFocusedChannel])

  const visibleChatChannels = React.useMemo(() => {
    if (!normalizedFocusedChannel) return []
    return chatChannels.filter(
      (channel) => String(channel.channel || "").trim().toLowerCase() === normalizedFocusedChannel,
    )
  }, [chatChannels, normalizedFocusedChannel])

  const filteredSessions = filterSessionsByKeyword(sessionsInFocusedChannel, search)
  const grouped = buildSessionGroups(filteredSessions)
  const visibleSessions = grouped
    .filter((group) => (filter === "all" ? true : group.key === filter))
    .flatMap((group) => group.items)

  const activeChannel = visibleChatChannels[0] || null
  const activeChannelName = String(activeChannel?.channel || "").trim()
  const activeChannelLabel = getChannelDisplayName(activeChannelName)
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
  const activeChannelDocsUrl = React.useMemo(() => {
    const channel = String(activeChannelName || "").trim().toLowerCase()
    return channel ? CHANNEL_DOCS_URL[channel] || null : null
  }, [activeChannelName])
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
    <div className="space-y-5">
      {!activeChannel ? (
        <DashboardModule
          title="Channel Runtime"
          description="当前 channel 暂无状态。"
        >
          <section className="rounded-[18px] bg-secondary px-3.5 py-5 text-sm text-muted-foreground">
            当前 channel 暂无状态
          </section>
        </DashboardModule>
      ) : (
        <DashboardModule
          title="Channel Runtime"
          description={`当前 channel：${activeChannelLabel || "unknown"} · account ${activeChannelAccountLabel}`}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 px-1 py-1">
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold leading-none text-foreground">{activeChannelLabel || "unknown"}</div>
                {activeChannelName === "qq" ? (
                  <div className="mt-2 rounded-[12px] border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-5 text-amber-950">
                    QQ channel 当前为 dev 版本，建议仅用于测试与验证。
                  </div>
                ) : null}
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
                          className="h-8 min-w-[9.5rem] max-w-[12rem] justify-between gap-1 px-2.5 text-[11px]"
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
                  className="h-8 px-2.5 text-[11px]"
                  disabled={activeReadonly || activeChannel.enabled === true}
                  onClick={() => onChatAction("open", activeChannelName)}
                >
                  open
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  disabled={activeReadonly || activeChannel.enabled !== true}
                  onClick={() => onChatAction("close", activeChannelName)}
                >
                  close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  disabled={activeReadonly || !(activeChannel.enabled === true && activeChannel.configured === true)}
                  onClick={() => onChatAction("test", activeChannelName)}
                >
                  test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-[11px]"
                  disabled={activeReadonly || !(activeChannel.enabled === true && activeChannel.configured === true)}
                  onClick={() => onChatAction("reconnect", activeChannelName)}
                >
                  reconnect
                </Button>
              </div>
            </div>
            {activeChannelDocsUrl ? (
              <div className="flex items-center justify-start px-1 pb-1">
                <a
                  href={activeChannelDocsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>查看飞书接入文档</span>
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            ) : null}

          </div>
        </DashboardModule>
      )}

      <DashboardModule
        title="Sessions"
        description={`当前筛选结果 ${visibleSessions.length} 条。`}
        actions={
          <>
            <span className="text-xs text-muted-foreground">{`total ${visibleSessions.length}`}</span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索 session"
              className="w-[220px]"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {(["all", "chat", "api", "other"] as const).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  className="px-2 text-xs"
                  onClick={() => setFilter(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </>
        }
      >

        {visibleSessions.length === 0 ? (
          <div className="rounded-[18px] bg-secondary px-4 py-5 text-sm text-muted-foreground">
            当前筛选条件下无 session
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSessions.map((item) => {
              const group = resolveSessionGroup(item)
              const isSelected = item.contextId === selectedSessionId
              const isDeleting = String(deletingSessionId || "").trim() === item.contextId
              const isExecuting = item.executing === true
              const display = resolveChatDisplayName(item)
              const contextLabel = display.value
              const routeJson = buildSessionRouteJson(item)
              const chatId = String(item.chatId || "").trim()
              const chatType = String(item.chatType || "").trim()
              return (
                <article
                  key={item.contextId}
                  className={isSelected ? "rounded-[20px] bg-secondary px-4 py-3" : "rounded-[20px] bg-transparent px-4 py-3 transition-colors hover:bg-secondary"}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground" title={`${contextLabel}\n${item.contextId}`}>
                        {contextLabel}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground/85">
                        {item.contextId}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/90">
                        <span className="rounded-full bg-background px-1.5 py-0.5 uppercase tracking-[0.08em]">
                          {group}
                        </span>
                        <span className="rounded-full bg-background px-1.5 py-0.5 uppercase tracking-[0.08em]">
                          {display.source}
                        </span>
                        {chatType ? (
                          <span className="rounded-full bg-background px-1.5 py-0.5 uppercase tracking-[0.08em]">
                            {chatType}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-1.5 py-0.5 uppercase tracking-[0.08em] ${
                            isExecuting
                              ? "bg-primary/12 text-primary"
                              : "bg-background text-muted-foreground"
                          }`}
                        >
                          {isExecuting ? "executing" : "idle"}
                        </span>
                        <span className="rounded-full bg-background px-1.5 py-0.5">
                          {`${item.messageCount || 0} msgs`}
                        </span>
                        <span>{formatTime(item.updatedAt)}</span>
                        {chatId ? (
                          <span className="max-w-[10rem] truncate font-mono" title={chatId}>
                            {chatId}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 truncate text-xs text-muted-foreground" title={item.lastText || ""}>
                        {`${item.lastRole || "unknown"} · ${item.lastText || "(empty)"}`}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                      <Popover>
                        <PopoverTrigger
                          render={<Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" />}
                        >
                          <Code2Icon className="size-3.5" />
                          <span>Route</span>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-[min(92vw,34rem)] overflow-hidden p-0">
                          <div className="bg-secondary px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            context route json
                          </div>
                          <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words bg-background/85 px-3 py-3 font-mono text-[11px] leading-relaxed text-foreground/85">
                            {routeJson}
                          </pre>
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="sm"
                        variant={isSelected ? "secondary" : "outline"}
                        className="h-8 px-2.5"
                        onClick={() => onOpenSession(item.contextId)}
                      >
                        {isSelected ? "已打开" : "打开"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 px-2.5"
                        disabled={Boolean(deletingSessionId)}
                        onClick={async () => {
                          const confirmed = await confirm({
                            title: "删除 Session",
                            description: `确认彻底删除 session「${item.contextId}」吗？该操作不可恢复。`,
                            confirmText: "删除",
                            cancelText: "取消",
                            confirmVariant: "destructive",
                          })
                          if (!confirmed) return
                          onDeleteSession(item.contextId)
                        }}
                      >
                        <Trash2Icon className="size-3.5" />
                        <span>{isDeleting ? "删除中..." : "删除"}</span>
                      </Button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </DashboardModule>
    </div>
  )
}
