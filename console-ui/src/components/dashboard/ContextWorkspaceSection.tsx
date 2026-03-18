/**
 * Context 工作区（只在选中 context 后展示）。
 */

import * as React from "react"
import { ArchiveIcon, InfoIcon, RefreshCcwIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
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

type RightTab = "system" | "context" | "archive"

function resolveSystemBlocks(prompt: UiPromptResponse | null): Array<{ title: string; content: string }> {
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : []
  if (sections.length === 0) return []

  const picked = sections.filter((section) => {
    const key = String(section.key || "").toLowerCase()
    const title = String(section.title || "").toLowerCase()
    return key.includes("system") || key.includes("profile") || title.includes("system") || title.includes("profile")
  })
  const target = picked.length > 0 ? picked : sections.slice(0, 2)

  return target.flatMap((section) => {
    const sectionTitle = String(section.title || section.key || "section")
    const items = Array.isArray(section.items) ? section.items : []
    if (items.length <= 1) {
      const content = String(items[0]?.content || "").trim()
      return [{ title: sectionTitle, content }]
    }
    return items.map((item, index) => {
      const itemLike = item as Record<string, unknown>
      const itemTitle = String(itemLike.title || itemLike.key || "").trim()
      const title = itemTitle ? `${sectionTitle} · ${itemTitle}` : `${sectionTitle} · ${index + 1}`
      const content = String(itemLike.content || "").trim()
      return { title, content }
    })
  })
}

function ChatHistoryList(props: { events: UiChatHistoryEvent[]; formatTime: (ts?: number | string) => string }) {
  const { events, formatTime } = props
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = React.useRef(true)
  const prevEventCountRef = React.useRef(0)

  React.useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const hasNewEvent = events.length > prevEventCountRef.current
    const shouldStick = stickToBottomRef.current
    if (hasNewEvent && shouldStick) {
      container.scrollTop = container.scrollHeight
    }
    prevEventCountRef.current = events.length
  }, [events])

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 space-y-3 overflow-y-auto px-2 py-2"
      onScroll={(event) => {
        const el = event.currentTarget
        const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        // 关键点（中文）：用户离底部很近就认为在跟随最新消息，避免误判导致频繁跳动。
        stickToBottomRef.current = distanceToBottom <= 48
      }}
    >
      {events.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">暂无 chat history</div>
      ) : (
        events.map((event, index) => {
          const direction = String(event.direction || "unknown")
          const isUser = direction === "inbound"
          const eventLike = event as UiChatHistoryEvent & Record<string, unknown>
          const extra =
            eventLike.extra && typeof eventLike.extra === "object" && !Array.isArray(eventLike.extra)
              ? (eventLike.extra as Record<string, unknown>)
              : {}
          const username = String(
            eventLike.actorName ||
              eventLike.username ||
              eventLike.userName ||
              eventLike.senderName ||
              eventLike.displayName ||
              eventLike.fromName ||
              eventLike.from ||
              extra.username ||
              extra.userName ||
              extra.displayName ||
              "",
          ).trim()
          const speaker = isUser ? (username || "user") : "agent"
          const rawText = String(event.text || "").trim() || "(empty)"
          const infoMatch = rawText.match(/<info>([\s\S]*?)<\/info>/i)
          const infoText = infoMatch ? String(infoMatch[1] || "").trim() : ""
          const text = rawText.replace(/<info>[\s\S]*?<\/info>/gi, "").trim() || "(empty)"
          const timeLabel = event.ts ? formatTime(event.ts) : String(event.isoTime || "").trim() || "-"

          const stableKey = `${String(event.id || "evt").trim()}:${String(event.ts || "na")}:${index}`
          return (
            <div key={stableKey} className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
              <article
                className={cn(
                  "max-w-[86%] space-y-1.5 rounded-2xl px-3.5 py-2.5",
                  isUser
                    ? "rounded-br-md bg-primary/10 text-right"
                    : "rounded-bl-md bg-muted/80 text-left",
                )}
              >
                <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground ${isUser ? "justify-end" : "justify-start"}`}>
                  <span>{speaker}</span>
                  <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
                    {timeLabel}
                  </span>
                  {infoText ? (
                    <Popover>
                      <PopoverTrigger className="inline-flex cursor-pointer items-center rounded-md bg-background/75 p-1 text-foreground/90">
                        <InfoIcon className="size-3.5" />
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align={isUser ? "end" : "start"} className="w-72 rounded-xl bg-background p-3 text-left shadow-lg">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Message Info
                        </div>
                        <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed normal-case tracking-normal text-foreground">
                          {infoText}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">{text}</div>
              </article>
            </div>
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
    <div className="h-full min-h-0 space-y-2 overflow-y-auto px-4 py-4">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">暂无 context messages</div>
      ) : (
        items.map((msg, index) => {
          const role = String(msg.role || "unknown")
          const rawText = String(msg.text || "").trim() || "(empty)"
          const infoMatch = rawText.match(/<info>([\s\S]*?)<\/info>/i)
          const infoText = infoMatch ? String(infoMatch[1] || "").trim() : ""
          const text = rawText.replace(/<info>[\s\S]*?<\/info>/gi, "").trim() || "(empty)"
          const timeLabel = formatTime(msg.ts)
          return (
            <article key={`${msg.id || index}`} className="space-y-1.5 rounded-xl bg-secondary/45 px-3 py-2.5 dark:bg-secondary/20">
              <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="font-semibold uppercase tracking-[0.12em]">{role}</span>
                <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px]">{timeLabel}</span>
                {infoText ? (
                  <Popover>
                    <PopoverTrigger className="inline-flex cursor-pointer items-center rounded-md bg-background/75 p-1 text-foreground/90">
                      <InfoIcon className="size-3.5" />
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="w-72 rounded-xl bg-background p-3 text-left shadow-lg">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Message Info
                      </div>
                      <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed normal-case tracking-normal text-foreground">
                        {infoText}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">{text}</div>
            </article>
          )
        })
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
      <div className="flex min-h-0 flex-col border-r border-border/50">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
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
                const archivedAt = item.archivedAt
                return (
                  <button
                    key={`${archiveId}-${index}`}
                    type="button"
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                    onClick={() => onSelectArchive(archiveId)}
                  >
                    <div className="truncate font-mono text-[11px]" title={archiveId}>
                      {archiveId}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                      <span>{`${messageCount} msgs`}</span>
                      <span className="truncate" title={formatTime(archivedAt)}>{formatTime(archivedAt)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 overflow-hidden">
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

export function ContextWorkspaceSection(props: ContextWorkspaceSectionProps) {
  const {
    selectedContextId,
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
    formatTime,
    onChangeInput,
    onSendConsoleUiMessage,
    onClearContextMessages,
    onClearChatHistory,
    onRefreshArchives,
    onSelectArchive,
  } = props

  const systemBlocks = resolveSystemBlocks(prompt)
  const [rightTab, setRightTab] = React.useState<RightTab>("system")

  const currentChannel = React.useMemo(() => {
    if (selectedContextId.startsWith("telegram-")) return "telegram"
    if (selectedContextId.startsWith("qq-")) return "qq"
    if (selectedContextId.startsWith("feishu-")) return "feishu"
    if (selectedContextId.startsWith("consoleui-") || selectedContextId === "local_ui") return "consoleui"
    return "unknown"
  }, [selectedContextId])
  const canSend = currentChannel === "consoleui"

  const currentChannelStatus = React.useMemo(() => {
    if (currentChannel === "consoleui") return "connected"
    if (currentChannel === "unknown") return "unknown"
    const item = chatChannels.find((channel) => String(channel.channel || "") === currentChannel)
    return String(item?.linkState || "unknown")
  }, [chatChannels, currentChannel])

  const currentChannelStatusTone =
    currentChannelStatus === "connected"
      ? "bg-primary/12 text-primary"
      : currentChannelStatus === "disconnected" || currentChannelStatus === "error"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground"

  React.useEffect(() => {
    setRightTab("system")
  }, [selectedContextId])

  if (!selectedContextId) {
    return <div className="py-6 text-sm text-muted-foreground">请选择一个 context 进入工作区</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden xl:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-gradient-to-b from-muted/45 via-background to-background">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1.5">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chat Workspace</div>
            <div className="mt-1 truncate font-mono text-[12px] text-foreground/90" title={selectedContextId}>
              {selectedContextId}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1 rounded-full bg-background/75 px-2 py-1 text-[11px] text-muted-foreground">
              <span className="font-mono">{currentChannel}</span>
              <span>{`${channelHistory.length} msgs`}</span>
            </div>
            <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${currentChannelStatusTone}`}>
              <span className={cn("inline-flex size-1.5 rounded-full", currentChannelStatus === "connected" ? "bg-primary" : "bg-current")} />
              <span>{currentChannelStatus}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={onClearContextMessages}
              disabled={clearingContextMessages}
            >
              <Trash2Icon className="size-3.5" />
              <span>{clearingContextMessages ? "清理中..." : "清理 context"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-md px-2 text-[11px]"
              onClick={onClearChatHistory}
              disabled={clearingChatHistory}
            >
              <Trash2Icon className="size-3.5" />
              <span>{clearingChatHistory ? "清理中..." : "清理 history"}</span>
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatHistoryList events={channelHistory} formatTime={formatTime} />
        </div>

        <div className="space-y-2 bg-muted/45 px-2 py-2">
          <Textarea
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            onKeyDown={(event) => {
              const sendHotkeyPressed =
                (event.metaKey || event.ctrlKey) && event.key === "Enter"
              if (!sendHotkeyPressed) return
              event.preventDefault()
              if (!canSend || sending || !chatInput.trim()) return
              onSendConsoleUiMessage()
            }}
            rows={4}
            placeholder={canSend ? "输入发给 consoleui channel 的指令..." : "当前 context 为只读，仅 consoleui channel 可发送"}
            disabled={!canSend}
            className="min-h-[96px] resize-y rounded-xl border-0 bg-background/80"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              {canSend ? "consoleui channel 支持直接发送（Cmd/Ctrl + Enter）。" : "只读模式：切到 consoleui channel 后可发送。"}
            </div>
            <Button className="min-w-20 rounded-lg" onClick={onSendConsoleUiMessage} disabled={!canSend || sending || !chatInput.trim()}>
              {sending ? "发送中..." : "发送"}
            </Button>
          </div>
        </div>
      </section>

      {!debugPanelsCollapsed ? (
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-t border-border/50 bg-gradient-to-b from-secondary/75 via-secondary/35 to-background xl:w-[min(42%,640px)] xl:min-w-[360px] xl:border-t-0 xl:border-l">
          <div className="flex items-center justify-between gap-2 px-1 py-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Debug Panels</div>
            <div className="inline-flex items-center rounded-lg bg-secondary/40 p-1">
              {/* 关键点（中文）：使用分段控件样式，和其他主视图保持一致的“密度感”。 */}
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  rightTab === "system" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setRightTab("system")}
              >
                system
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  rightTab === "context" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setRightTab("context")}
              >
                context messages
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  rightTab === "archive" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setRightTab("archive")}
              >
                archive
              </button>
            </div>
          </div>

          {rightTab === "system" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {systemBlocks.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无 system 内容</div>
              ) : (
                <div className="space-y-3">
                  {systemBlocks.map((block, index) => (
                    <article key={`${block.title}-${index}`} className="overflow-hidden rounded-xl border border-border/55 bg-secondary/45 dark:bg-secondary/20">
                      <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-secondary/55 px-3 py-2">
                        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80" title={block.title}>
                          {block.title}
                        </div>
                        <div className="rounded-md bg-background/75 px-1.5 py-0.5 text-[10px] text-muted-foreground">{`#${index + 1}`}</div>
                      </div>
                      <div className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground/85">
                        {block.content || "(empty)"}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : rightTab === "context" ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <ContextMessageList items={contextMessages} formatTime={formatTime} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden">
              <ArchivePanel
                archives={contextArchives}
                selectedArchiveId={selectedArchiveId}
                archiveMessages={contextArchiveMessages}
                formatTime={formatTime}
                onSelectArchive={onSelectArchive}
                onRefreshArchives={onRefreshArchives}
              />
            </div>
          )}
        </aside>
      ) : null}
    </div>
  )
}
