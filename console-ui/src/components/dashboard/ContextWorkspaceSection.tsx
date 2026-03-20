/**
 * Context 工作区（只在选中 context 后展示）。
 *
 * 关键点（中文）
 * - 页面布局保持极简：左侧聊天主区，右侧调试区。
 * - 右侧统一收纳 route/system/context/archive，避免功能散落到多个区域。
 */

import * as React from "react"
import { ArchiveIcon, MoreHorizontalIcon, RefreshCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"
import { resolveContextChannel } from "@/lib/context-groups"
import { cn } from "@/lib/utils"
import type {
  UiContextArchiveSummary,
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiContextSummary,
  UiContextTimelineMessage,
  UiPromptResponse,
} from "@/types/Dashboard"

export interface ContextWorkspaceSectionProps {
  /**
   * 当前选中的 context id。
   */
  selectedContextId: string
  /**
   * context 列表。
   */
  contexts: UiContextSummary[]
  /**
   * channel 历史。
   */
  channelHistory: UiChatHistoryEvent[]
  /**
   * chat 渠道状态。
   */
  chatChannels: UiChatChannelStatus[]
  /**
   * context 消息历史。
   */
  contextMessages: UiContextTimelineMessage[]
  /**
   * compact archive 列表。
   */
  contextArchives: UiContextArchiveSummary[]
  /**
   * 当前选中的 archive id。
   */
  selectedArchiveId: string
  /**
   * archive 消息历史。
   */
  contextArchiveMessages: UiContextTimelineMessage[]
  /**
   * prompt 数据。
   */
  prompt: UiPromptResponse | null
  /**
   * 输入框内容。
   */
  chatInput: string
  /**
   * 是否折叠 Debug Panels。
   */
  debugPanelsCollapsed: boolean
  /**
   * 是否发送中。
   */
  sending: boolean
  /**
   * 是否正在清理 context messages。
   */
  clearingContextMessages: boolean
  /**
   * 是否正在清理 chat history。
   */
  clearingChatHistory: boolean
  /**
   * 是否正在删除当前 context。
   */
  deletingContext: boolean
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 更新输入框。
   */
  onChangeInput: (value: string) => void
  /**
   * 发送 consoleui channel 消息。
   */
  onSendConsoleUiMessage: () => void
  /**
   * 清理当前 context messages。
   */
  onClearContextMessages: () => void
  /**
   * 清理当前 chat history。
   */
  onClearChatHistory: () => void
  /**
   * 完整删除当前 context。
   */
  onDeleteContext: () => void
  /**
   * 刷新 archive 列表。
   */
  onRefreshArchives: () => void
  /**
   * 切换 archive。
   */
  onSelectArchive: (archiveId: string) => void
  /**
   * 切换 context。
   */
  onSelectContext: (contextId: string) => void
}

type RightTab = "route" | "system" | "context" | "archive"

function toOptionalRouteText(input: unknown): string | null {
  const text = String(input || "").trim()
  return text || null
}

function stripInfoTag(raw: string): { text: string; info: string } {
  const source = String(raw || "")
  const infoMatch = source.match(/<info>([\s\S]*?)<\/info>/i)
  const info = infoMatch ? String(infoMatch[1] || "").trim() : ""
  const text = source.replace(/<info>[\s\S]*?<\/info>/gi, "").trim() || "(empty)"
  return { text, info }
}

function resolveChatDisplayName(params: {
  chatTitle?: string
  chatId?: string
  contextId: string
}): { value: string; source: "title" | "chat_id" | "context_id" } {
  const chatTitle = String(params.chatTitle || "").trim()
  const chatId = String(params.chatId || "").trim()
  // 关键点（中文）：`chatTitle===chatId` 时认为标题无效，避免把 openid 误显示为昵称。
  if (chatTitle && (!chatId || chatTitle !== chatId)) return { value: chatTitle, source: "title" }
  if (chatId) return { value: chatId, source: "chat_id" }
  return { value: String(params.contextId || "").trim() || "unknown", source: "context_id" }
}

function buildContextRouteJson(params: {
  selectedContextId: string
  channel: string
  chatId?: string
  chatTitle?: string
  chatType?: string
  threadId?: number
}): string {
  const displayName = resolveChatDisplayName({
    chatTitle: params.chatTitle,
    chatId: params.chatId,
    contextId: params.selectedContextId,
  })

  return JSON.stringify(
    {
      contextId: toOptionalRouteText(params.selectedContextId),
      channel: toOptionalRouteText(params.channel),
      chatId: toOptionalRouteText(params.chatId),
      chatTitle: toOptionalRouteText(params.chatTitle),
      chatDisplayName: toOptionalRouteText(displayName.value),
      chatDisplayNameSource: displayName.source,
      chatType: toOptionalRouteText(params.chatType),
      threadId:
        typeof params.threadId === "number" && Number.isFinite(params.threadId)
          ? params.threadId
          : null,
    },
    null,
    2,
  )
}

function resolveSystemBlocks(prompt: UiPromptResponse | null): Array<{ title: string; content: string }> {
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : []
  if (sections.length === 0) return []

  const picked = sections.filter((section) => {
    const key = String(section.key || "").trim().toLowerCase()
    const title = String(section.title || "").trim().toLowerCase()
    return key.includes("system") || key.includes("profile") || title.includes("system") || title.includes("profile")
  })

  const target = picked.length > 0 ? picked : sections.slice(0, 2)
  return target.flatMap((section) => {
    const sectionTitle = String(section.title || section.key || "section").trim() || "section"
    const items = Array.isArray(section.items) ? section.items : []
    if (items.length === 0) {
      return [{ title: sectionTitle, content: "" }]
    }
    return items.map((item, index) => {
      const content = String(item.content || "").trim()
      return {
        title:
          typeof item.index === "number" && Number.isFinite(item.index)
            ? `${sectionTitle} · #${item.index}`
            : `${sectionTitle} · ${index + 1}`,
        content,
      }
    })
  })
}

function ChatHistoryList(props: {
  events: UiChatHistoryEvent[]
  formatTime: (ts?: number | string) => string
}) {
  const { events, formatTime } = props
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = React.useRef(true)
  const prevEventCountRef = React.useRef(0)

  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const hasNewEvent = events.length > prevEventCountRef.current
    if (hasNewEvent && stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight
    }
    prevEventCountRef.current = events.length
  }, [events])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 space-y-2 overflow-y-auto px-2 py-2"
      onScroll={(event) => {
        const el = event.currentTarget
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        // 关键点（中文）：靠近底部时自动跟随，减少阅读时的跳动干扰。
        stickToBottomRef.current = distanceToBottom <= 48
      }}
    >
      {events.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">暂无 chat history</div>
      ) : (
        events.map((event, index) => {
          const direction = String(event.direction || "unknown")
          const isInbound = direction === "inbound"
          const actorRaw = event as UiChatHistoryEvent & Record<string, unknown>
          const actorName = String(
            actorRaw.actorName ||
              actorRaw.username ||
              actorRaw.userName ||
              actorRaw.senderName ||
              actorRaw.displayName ||
              actorRaw.fromName ||
              actorRaw.from ||
              "",
          ).trim()
          const speaker = isInbound ? actorName || "user" : "agent"
          const parsed = stripInfoTag(String(event.text || ""))
          const timeLabel = event.ts ? formatTime(event.ts) : String(event.isoTime || "").trim() || "-"

          return (
            <article
              key={`${String(event.id || "evt")}:${String(event.ts || "na")}:${index}`}
              className={cn(
                "rounded-[16px] px-3 py-2.5",
                isInbound ? "bg-background" : "bg-secondary",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate font-medium uppercase tracking-[0.08em]">{speaker}</span>
                <span className="shrink-0 font-mono text-[10px]">{timeLabel}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-foreground">{parsed.text}</div>
              {parsed.info ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">info</summary>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">
                    {parsed.info}
                  </pre>
                </details>
              ) : null}
            </article>
          )
        })
      )}
    </div>
  )
}

function ContextMessageList(props: {
  items: UiContextTimelineMessage[]
  formatTime: (ts?: number | string) => string
}) {
  const { items, formatTime } = props

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto px-3 py-3">
      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">暂无 context messages</div>
      ) : (
        items.map((msg, index) => {
          const role = String(msg.role || "unknown")
          const parsed = stripInfoTag(String(msg.text || ""))
          const timeLabel = formatTime(msg.ts)
          return (
            <article
              key={`${msg.id || role}-${index}`}
              className="rounded-[16px] bg-background px-3 py-2.5"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate font-medium uppercase tracking-[0.08em]">{role}</span>
                <span className="shrink-0 font-mono text-[10px]">{timeLabel}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[10px] leading-[1.5] text-foreground/90">{parsed.text}</div>
              {parsed.info ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">info</summary>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px] leading-relaxed text-foreground/80">
                    {parsed.info}
                  </pre>
                </details>
              ) : null}
            </article>
          )
        })
      )}
    </div>
  )
}

function RoutePanel(props: { routeJson: string }) {
  return (
    <div className="h-full min-h-0 overflow-hidden px-3 py-3">
      <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded-[16px] bg-secondary/85 px-3 py-3 font-mono text-xs leading-relaxed text-foreground/85">
        {props.routeJson}
      </pre>
    </div>
  )
}

function SystemPanel(props: { blocks: Array<{ title: string; content: string }> }) {
  const { blocks } = props

  return (
    <div className="h-full min-h-0 overflow-y-auto px-3 py-3">
      {blocks.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">暂无 system 内容</div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block, index) => (
            <details
              key={`${block.title}-${index}`}
              open={index === 0}
              className="rounded-[16px] bg-secondary/85"
            >
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground/85">
                {block.title}
              </summary>
              <div className="px-3 pb-3">
                <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
                  {block.content || "(empty)"}
                </pre>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

function ArchivePanel(props: {
  archives: UiContextArchiveSummary[]
  selectedArchiveId: string
  archiveMessages: UiContextTimelineMessage[]
  formatTime: (ts?: number | string) => string
  onSelectArchive: (archiveId: string) => void
  onRefreshArchives: () => void
}) {
  const {
    archives,
    selectedArchiveId,
    archiveMessages,
    formatTime,
    onSelectArchive,
    onRefreshArchives,
  } = props

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col rounded-l-[18px] bg-secondary/85">
        <div className="flex items-center justify-between gap-2 border-b border-border/45 px-3 py-2">
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <ArchiveIcon className="size-3.5" />
            <span>compact archives</span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 rounded-md"
            onClick={onRefreshArchives}
            aria-label="刷新 archive"
            title="刷新 archive"
          >
            <RefreshCcwIcon className="size-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {archives.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">暂无 compact archive</div>
          ) : (
            <div className="space-y-1">
              {archives.map((item, index) => {
                const archiveId = String(item.archiveId || "").trim()
                if (!archiveId) return null
                const active = archiveId === selectedArchiveId
                const messageCount = Number(item.messageCount || 0)
                return (
                  <button
                    key={`${archiveId}-${index}`}
                    type="button"
                    className={cn(
                      "w-full rounded-[14px] px-2.5 py-2 text-left text-xs transition-colors",
                      active
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:bg-background hover:text-foreground",
                    )}
                    onClick={() => onSelectArchive(archiveId)}
                  >
                    <div className="truncate font-mono text-[11px]" title={archiveId}>
                      {archiveId}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                      <span>{`${messageCount} msgs`}</span>
                      <span className="truncate" title={formatTime(item.archivedAt)}>{formatTime(item.archivedAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-hidden rounded-r-[18px] bg-background/55">
        {selectedArchiveId ? (
          <ContextMessageList items={archiveMessages} formatTime={formatTime} />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
            请选择左侧 archive 查看 compact 前的历史消息
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge(props: { state: string }) {
  const state = String(props.state || "unknown").trim().toLowerCase()
  const tone =
    state === "connected"
      ? "bg-primary/12 text-primary"
      : state === "disconnected" || state === "error"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground"

  return (
    <div className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]", tone)}>
      <span className={cn("inline-flex size-1.5 rounded-full", state === "connected" ? "bg-primary" : "bg-current")} />
      <span>{state || "unknown"}</span>
    </div>
  )
}

export function ContextWorkspaceSection(props: ContextWorkspaceSectionProps) {
  const {
    selectedContextId,
    contexts,
    channelHistory,
    chatChannels,
    contextMessages,
    contextArchives,
    selectedArchiveId,
    contextArchiveMessages,
    prompt,
    chatInput,
    debugPanelsCollapsed,
    sending,
    clearingContextMessages,
    clearingChatHistory,
    deletingContext,
    formatTime,
    onChangeInput,
    onSendConsoleUiMessage,
    onClearContextMessages,
    onClearChatHistory,
    onDeleteContext,
    onRefreshArchives,
    onSelectArchive,
  } = props

  const confirm = useConfirmDialog()
  const [rightTab, setRightTab] = React.useState<RightTab>("route")

  const selectedContext = React.useMemo(
    () => contexts.find((item) => String(item.contextId || "").trim() === selectedContextId) || null,
    [contexts, selectedContextId],
  )

  const currentChannel = React.useMemo(() => {
    const channel = resolveContextChannel(selectedContext || selectedContextId)
    return channel === "other" ? "unknown" : channel
  }, [selectedContext, selectedContextId])

  const canSend = currentChannel === "consoleui"

  const currentChannelStatus = React.useMemo(() => {
    if (currentChannel === "consoleui") return "connected"
    if (currentChannel === "unknown") return "unknown"
    const item = chatChannels.find(
      (channel) => String(channel.channel || "").trim().toLowerCase() === currentChannel,
    )
    return String(item?.linkState || "unknown")
  }, [chatChannels, currentChannel])

  const chatDisplay = React.useMemo(
    () =>
      resolveChatDisplayName({
        chatTitle: selectedContext?.chatTitle,
        chatId: selectedContext?.chatId,
        contextId: selectedContextId,
      }),
    [selectedContext, selectedContextId],
  )

  const currentRouteJson = React.useMemo(
    () =>
      buildContextRouteJson({
        selectedContextId,
        channel: currentChannel,
        chatId: selectedContext?.chatId,
        chatTitle: selectedContext?.chatTitle,
        chatType: selectedContext?.chatType,
        threadId: selectedContext?.threadId,
      }),
    [currentChannel, selectedContext, selectedContextId],
  )
  const systemBlocks = React.useMemo(() => resolveSystemBlocks(prompt), [prompt])

  const handleDeleteContext = React.useCallback(async () => {
    const confirmed = await confirm({
      title: "删除 Chat",
      description: `确认彻底删除 context「${selectedContextId}」吗？该操作不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    onDeleteContext()
  }, [confirm, onDeleteContext, selectedContextId])

  React.useEffect(() => {
    setRightTab("route")
  }, [selectedContextId])

  if (!selectedContextId) {
    return <div className="py-6 text-sm text-muted-foreground">请选择一个 context 进入工作区</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-background ring-1 ring-border/70 shadow-[0_1px_0_rgba(17,17,19,0.03)]">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/55 px-4 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground" title={chatDisplay.value}>
              {chatDisplay.value}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={selectedContextId}>
              {selectedContextId}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{`source: ${chatDisplay.source}`}</div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
              <span className="font-mono">{currentChannel}</span>
              <span>{`${channelHistory.length} msgs`}</span>
            </div>
            <StatusBadge state={currentChannelStatus} />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-[11px] px-2.5 text-[11px]"
                    disabled={deletingContext || clearingContextMessages || clearingChatHistory}
                  />
                }
              >
                <MoreHorizontalIcon className="size-3.5" />
                <span>操作</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem disabled={clearingContextMessages} onClick={onClearContextMessages}>
                  {clearingContextMessages ? "清理 context 中..." : "清理 context messages"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={clearingChatHistory} onClick={onClearChatHistory}>
                  {clearingChatHistory ? "清理 history 中..." : "清理 chat history"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={deletingContext}
                  onClick={() => {
                    void handleDeleteContext()
                  }}
                >
                  {deletingContext ? "删除中..." : "删除 chat"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatHistoryList events={channelHistory} formatTime={formatTime} />
        </div>

        <div className="border-t border-border/55 px-4 py-4">
          <Textarea
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            onKeyDown={(event) => {
              const sendHotkeyPressed = (event.metaKey || event.ctrlKey) && event.key === "Enter"
              if (!sendHotkeyPressed) return
              event.preventDefault()
              if (!canSend || sending || !chatInput.trim()) return
              onSendConsoleUiMessage()
            }}
            rows={3}
            placeholder={canSend ? "输入发给 consoleui channel 的消息..." : "当前 context 为只读，仅 consoleui channel 可发送"}
            disabled={!canSend}
            className="min-h-[84px] resize-y rounded-[14px] bg-secondary/85 text-[11px] focus-visible:bg-secondary"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              {canSend ? "Cmd/Ctrl + Enter 发送" : "只读模式"}
            </div>
            <Button onClick={onSendConsoleUiMessage} disabled={!canSend || sending || !chatInput.trim()}>
              {sending ? "发送中..." : "发送"}
            </Button>
          </div>
        </div>
      </section>

      {!debugPanelsCollapsed ? (
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-background ring-1 ring-border/70 shadow-[0_1px_0_rgba(17,17,19,0.03)] xl:w-[min(40%,560px)] xl:min-w-[340px]">
          <div className="flex items-center justify-between gap-2 border-b border-border/55 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">details</div>
            <div className="inline-flex rounded-[12px] bg-secondary p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded-[10px] px-2 py-1 text-xs transition-colors",
                  rightTab === "route" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                onClick={() => setRightTab("route")}
              >
                route
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-[10px] px-2 py-1 text-xs transition-colors",
                  rightTab === "system" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                onClick={() => setRightTab("system")}
              >
                system
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-[10px] px-2 py-1 text-xs transition-colors",
                  rightTab === "context" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                onClick={() => setRightTab("context")}
              >
                context
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-[10px] px-2 py-1 text-xs transition-colors",
                  rightTab === "archive" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
                onClick={() => setRightTab("archive")}
              >
                archive
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {rightTab === "route" ? (
              <RoutePanel routeJson={currentRouteJson} />
            ) : rightTab === "system" ? (
              <SystemPanel blocks={systemBlocks} />
            ) : rightTab === "context" ? (
              <ContextMessageList items={contextMessages} formatTime={formatTime} />
            ) : (
              <ArchivePanel
                archives={contextArchives}
                selectedArchiveId={selectedArchiveId}
                archiveMessages={contextArchiveMessages}
                formatTime={formatTime}
                onSelectArchive={onSelectArchive}
                onRefreshArchives={onRefreshArchives}
              />
            )}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
