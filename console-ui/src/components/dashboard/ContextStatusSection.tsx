/**
 * 单个 Context 状态视图。
 */

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import type { UiChatHistoryEvent, UiContextSummary, UiContextTimelineMessage } from "../../types/Dashboard"

export interface ContextStatusSectionProps {
  /**
   * 当前 context id。
   */
  selectedContextId: string
  /**
   * context 摘要列表。
   */
  contexts: UiContextSummary[]
  /**
   * channel history。
   */
  channelHistory: UiChatHistoryEvent[]
  /**
   * context message 历史。
   */
  contextMessages: UiContextTimelineMessage[]
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string
}

export function ContextStatusSection(props: ContextStatusSectionProps) {
  const { selectedContextId, contexts, channelHistory, contextMessages, formatTime } = props
  const current = contexts.find((item) => item.contextId === selectedContextId)

  return (
    <div className="space-y-4">
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Context Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 font-mono text-xs">{selectedContextId || "-"}</div>
          <div className="text-muted-foreground">
            {`messages ${current?.messageCount || 0} · updated ${formatTime(current?.updatedAt)}`}
          </div>
          {current?.lastText ? (
            <div className="rounded-xl border border-border/70 bg-background/75 p-3 text-xs text-foreground/85">
              {current.lastText}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Channel History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
              {channelHistory.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无 channel history</div>
              ) : (
                channelHistory.map((event, index) => {
                  const direction = String(event.direction || "unknown")
                  const text = String(event.text || "").trim() || "(empty)"
                  return (
                    <article key={`${event.id || index}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="mb-1 text-[11px] text-muted-foreground">
                        {`${String(event.channel || "-")} · ${direction} · ${formatTime(event.ts)}`}
                      </div>
                      <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">{text}</div>
                    </article>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>Context Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
              {contextMessages.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无 context message history</div>
              ) : (
                contextMessages.map((msg, index) => {
                  const role = String(msg.role || "unknown")
                  const text = String(msg.text || "").trim() || "(empty)"
                  return (
                    <article key={`${msg.id || index}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="mb-1 text-[11px] text-muted-foreground">{`${role} · ${formatTime(msg.ts)}`}</div>
                      <div className="whitespace-pre-wrap break-words text-xs text-foreground/90">{text}</div>
                    </article>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
