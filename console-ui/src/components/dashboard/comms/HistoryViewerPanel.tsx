/**
 * 历史消息查看面板。
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UiChatHistoryEvent, UiContextTimelineMessage } from "@/types/Dashboard"

export interface HistoryViewerPanelProps {
  /**
   * channel history 列表。
   */
  channelHistory: UiChatHistoryEvent[]
  /**
   * context 消息历史列表。
   */
  contextMessages: UiContextTimelineMessage[]
  /**
   * 时间格式化函数。
   */
  formatTime: (ts?: number | string) => string
}

export function HistoryViewerPanel(props: HistoryViewerPanelProps) {
  const { channelHistory, contextMessages, formatTime } = props

  return (
    <Card className="min-w-0 border-border/80 bg-card/90 shadow-sm">
      <CardHeader>
        <CardTitle>History Viewer</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel History</div>
            <div className="max-h-[56vh] min-w-0 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
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
                      <div className="whitespace-pre-wrap break-all text-xs text-foreground/90">{text}</div>
                    </article>
                  )
                })
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context Messages</div>
            <div className="max-h-[56vh] min-w-0 space-y-2 overflow-auto rounded-xl border border-border/70 bg-background/75 p-3">
              {contextMessages.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无 context message history</div>
              ) : (
                contextMessages.map((msg, index) => {
                  const role = String(msg.role || "unknown")
                  const text = String(msg.text || "").trim() || "(empty)"
                  return (
                    <article key={`${msg.id || index}`} className="rounded-lg border border-border/70 bg-card p-2.5">
                      <div className="mb-1 text-[11px] text-muted-foreground">{`${role} · ${formatTime(msg.ts)}`}</div>
                      <div className="whitespace-pre-wrap break-all text-xs text-foreground/90">{text}</div>
                    </article>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
