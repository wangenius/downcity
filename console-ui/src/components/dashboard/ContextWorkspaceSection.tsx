/**
 * Context 工作区（只在选中 context 后展示）。
 */

import * as React from "react"
import { InfoIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import type {
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
   * prompt 数据。
   */
  prompt: UiPromptResponse | null
  /**
   * 输入框内容。
   */
  chatInput: string
  /**
   * 是否发送中。
   */
  sending: boolean
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string
  /**
   * 更新输入框。
   */
  onChangeInput: (value: string) => void
  /**
   * 发送 local_ui 消息。
   */
  onSendLocalMessage: () => void
  /**
   * 切换 context。
   */
  onSelectContext: (contextId: string) => void
}

const LOCAL_UI_CONTEXT_ID = "local_ui"
type RightTab = "system" | "context"

function resolveSystemBlocks(prompt: UiPromptResponse | null): Array<{ title: string; content: string }> {
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : []
  if (sections.length === 0) return []

  const picked = sections.filter((section) => {
    const key = String(section.key || "").toLowerCase()
    const title = String(section.title || "").toLowerCase()
    return key.includes("system") || key.includes("profile") || title.includes("system") || title.includes("profile")
  })
  const target = picked.length > 0 ? picked : sections.slice(0, 2)

  return target.map((section) => {
    const title = String(section.title || section.key || "section")
    const items = Array.isArray(section.items) ? section.items : []
    const content = items.map((item) => String(item.content || "")).filter(Boolean).join("\n\n")
    return { title, content }
  })
}

function ChatHistoryList(props: { events: UiChatHistoryEvent[] }) {
  const { events } = props
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
      className="h-full min-h-0 space-y-2 overflow-y-auto px-3 py-3"
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

          return (
            <div key={`${event.id || index}`} className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
              <article
                className={`max-w-[82%] space-y-1 border px-3 py-2 ${
                  isUser ? "border-border bg-muted/40 text-right" : "border-border/70 bg-background text-left"
                }`}
              >
                <div className={`flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground ${isUser ? "justify-end" : "justify-start"}`}>
                  <span>{speaker}</span>
                  {isUser && infoText ? (
                    <Popover>
                      <PopoverTrigger className="inline-flex cursor-pointer items-center border border-border/70 bg-muted/50 p-1 text-foreground">
                        <InfoIcon className="size-3.5" />
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="end" className="w-72 border-border/70 bg-background p-3 text-left">
                        <div className="mb-2 border-b border-border/60 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Message Info
                        </div>
                        <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed normal-case tracking-normal text-foreground">
                          {infoText}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap break-words text-sm text-foreground">{text}</div>
              </article>
            </div>
          )
        })
      )}
    </div>
  )
}

function ContextMessageList(props: { items: UiContextTimelineMessage[] }) {
  const { items } = props

  return (
    <div className="h-full min-h-0 space-y-2 overflow-y-auto px-3 py-3">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground">暂无 context messages</div>
      ) : (
        items.map((msg, index) => {
          const role = String(msg.role || "unknown")
          const rawText = String(msg.text || "").trim() || "(empty)"
          const infoMatch = rawText.match(/<info>([\s\S]*?)<\/info>/i)
          const infoText = infoMatch ? String(infoMatch[1] || "").trim() : ""
          const text = rawText.replace(/<info>[\s\S]*?<\/info>/gi, "").trim() || "(empty)"
          return (
            <article key={`${msg.id || index}`} className="border-b border-border/60 pb-2 last:border-b-0">
              <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>{role}</span>
                {infoText ? (
                  <Popover>
                    <PopoverTrigger className="inline-flex cursor-pointer items-center border border-border/70 bg-muted/50 p-1 text-foreground">
                      <InfoIcon className="size-3.5" />
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="w-72 border-border/70 bg-background p-3 text-left">
                      <div className="mb-2 border-b border-border/60 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Message Info
                      </div>
                      <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed normal-case tracking-normal text-foreground">
                        {infoText}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">{text}</div>
            </article>
          )
        })
      )}
    </div>
  )
}

export function ContextWorkspaceSection(props: ContextWorkspaceSectionProps) {
  const {
    selectedContextId,
    channelHistory,
    chatChannels,
    contextMessages,
    prompt,
    chatInput,
    sending,
    onChangeInput,
    onSendLocalMessage,
  } = props

  const isLocalUi = selectedContextId === LOCAL_UI_CONTEXT_ID
  const systemBlocks = resolveSystemBlocks(prompt)
  const [rightTab, setRightTab] = React.useState<RightTab>("system")

  const currentChannel = React.useMemo(() => {
    if (selectedContextId.startsWith("telegram-")) return "telegram"
    if (selectedContextId.startsWith("qq-")) return "qq"
    if (selectedContextId.startsWith("feishu-")) return "feishu"
    if (selectedContextId === LOCAL_UI_CONTEXT_ID) return "local_ui"
    return "unknown"
  }, [selectedContextId])

  const currentChannelStatus = React.useMemo(() => {
    if (currentChannel === "local_ui") return "local"
    if (currentChannel === "unknown") return "unknown"
    const item = chatChannels.find((channel) => String(channel.channel || "") === currentChannel)
    return String(item?.linkState || "unknown")
  }, [chatChannels, currentChannel])

  const currentChannelStatusTone =
    currentChannelStatus === "connected"
      ? "border-border bg-muted/45 text-foreground"
      : currentChannelStatus === "disconnected" || currentChannelStatus === "error"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-muted/35 text-muted-foreground"

  React.useEffect(() => {
    setRightTab("system")
  }, [selectedContextId])

  if (!selectedContextId) {
    return <div className="border-b border-dashed border-border py-6 text-sm text-muted-foreground">请选择一个 context 进入工作区</div>
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border/70">
        <div className="flex items-center justify-end px-3 py-2">
          <div className={`inline-flex items-center gap-1 border px-2 py-1 text-[11px] ${currentChannelStatusTone}`}>
            <span className="font-mono">{currentChannel}</span>
            <span>{currentChannelStatus}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatHistoryList events={channelHistory} />
        </div>

        <div className="space-y-2 border-t border-border/70 px-3 py-3">
          <Textarea
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            rows={4}
            placeholder={isLocalUi ? "输入发给 local_ui 的指令..." : "当前 context 为只读，仅 local_ui 可发送"}
            disabled={!isLocalUi}
          />
          <div className="flex justify-end">
            <Button onClick={onSendLocalMessage} disabled={!isLocalUi || sending || !chatInput.trim()}>
              {sending ? "发送中..." : "发送"}
            </Button>
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border/70">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <button
            type="button"
            className={`border px-2 py-1 text-xs ${rightTab === "system" ? "bg-muted/45 text-foreground" : "text-muted-foreground"}`}
            onClick={() => setRightTab("system")}
          >
            system
          </button>
          <button
            type="button"
            className={`border px-2 py-1 text-xs ${rightTab === "context" ? "bg-muted/45 text-foreground" : "text-muted-foreground"}`}
            onClick={() => setRightTab("context")}
          >
            context messages
          </button>
        </div>

        {rightTab === "system" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {systemBlocks.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无 system 内容</div>
            ) : (
              <div className="space-y-3">
                {systemBlocks.map((block, index) => (
                  <div key={`${block.title}-${index}`} className="space-y-1 border-b border-border/60 pb-2">
                    <div className="py-1 text-xs font-semibold text-foreground/85">{block.title}</div>
                    <pre className="overflow-x-auto border border-border/70 bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/85">
                      {block.content || "(empty)"}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden">
            <ContextMessageList items={contextMessages} />
          </div>
        )}
      </aside>
    </div>
  )
}
