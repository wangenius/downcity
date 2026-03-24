/**
 * 历史消息查看面板。
 */

import { cn } from "@/lib/utils"
import type { UiChatHistoryEvent, UiContextTimelineMessage } from "@/types/Dashboard"

/**
 * 生成时间线角色标签。
 *
 * 关键点（中文）
 * - tool-call / tool-result 需要补出具体 toolName，避免只看到笼统类型。
 */
function formatTimelineRoleLabel(params: {
  role?: string
  toolName?: string
}): string {
  const role = String(params.role || "unknown").trim()
  const toolName = String(params.toolName || "").trim()
  if ((role === "tool-call" || role === "tool-result") && toolName) {
    return `${role} · ${toolName}`
  }
  return role || "unknown"
}

/**
 * 生成时间线视觉样式。
 *
 * 关键点（中文）
 * - 在只读历史面板里也要保持和主工作区一致的语义区分。
 */
function getTimelineVisualTone(roleInput?: string): {
  cardClassName: string
  roleBadgeClassName: string
  toolBadgeClassName: string
  textClassName: string
} {
  const role = String(roleInput || "unknown").trim()
  if (role === "tool-call") {
    return {
      cardClassName: "border border-border/70 bg-secondary/88 dark:bg-muted/58",
      roleBadgeClassName: "bg-foreground text-background dark:bg-foreground dark:text-background",
      toolBadgeClassName: "bg-background/92 text-foreground ring-1 ring-border/70 dark:bg-background/70 dark:ring-border/80",
      textClassName: "font-mono text-[11px] leading-[1.6] text-foreground/96",
    }
  }
  if (role === "tool-result") {
    return {
      cardClassName: "border border-border/55 bg-background/90 dark:bg-background/88",
      roleBadgeClassName: "bg-secondary text-foreground/86 dark:bg-secondary dark:text-foreground/86",
      toolBadgeClassName: "bg-secondary/82 text-foreground/78 ring-1 ring-border/60 dark:bg-muted/72 dark:ring-border/70",
      textClassName: "font-mono text-[11px] leading-[1.6] text-foreground/82",
    }
  }
  if (role === "user") {
    return {
      cardClassName: "border border-border/55 bg-secondary/42",
      roleBadgeClassName: "bg-secondary text-foreground/78",
      toolBadgeClassName: "bg-secondary text-muted-foreground",
      textClassName: "text-xs text-foreground/92",
    }
  }
  return {
    cardClassName: "border border-border/45 bg-background/80",
    roleBadgeClassName: "bg-secondary text-foreground/78",
    toolBadgeClassName: "bg-secondary text-muted-foreground",
    textClassName: "text-xs text-foreground/90",
  }
}

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
    <section className="min-w-0 space-y-3">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Channel History</div>
          <div className="max-h-[56vh] min-w-0 space-y-2 overflow-auto rounded-[20px] bg-secondary/85 p-2">
            {channelHistory.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无 channel history</div>
            ) : (
              channelHistory.map((event, index) => {
                const direction = String(event.direction || "unknown")
                const text = String(event.text || "").trim() || "(empty)"
                return (
                  <article key={`${event.id || index}`} className="rounded-[16px] bg-background/80 px-3 py-2.5">
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
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Context Messages</div>
          <div className="max-h-[56vh] min-w-0 space-y-2 overflow-auto rounded-[20px] bg-secondary/85 p-2">
            {contextMessages.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无 context message history</div>
            ) : (
              contextMessages.map((msg, index) => {
                const role = String(msg.role || "unknown")
                const roleLabel = formatTimelineRoleLabel({
                  role,
                  toolName: msg.toolName,
                })
                const tone = getTimelineVisualTone(role)
                const toolName = String(msg.toolName || "").trim()
                const text = String(msg.text || "").trim() || "(empty)"
                return (
                  <article key={`${msg.id || index}`} className={cn("rounded-[16px] px-3 py-2.5", tone.cardClassName)}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex h-5 max-w-full items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.1em]",
                            tone.roleBadgeClassName,
                          )}
                          title={roleLabel}
                        >
                          <span className="truncate">{role}</span>
                        </span>
                        {toolName ? (
                          <span
                            className={cn(
                              "inline-flex h-5 max-w-[min(44vw,14rem)] items-center rounded-full px-2 font-mono text-[10px]",
                              tone.toolBadgeClassName,
                            )}
                            title={toolName}
                          >
                            <span className="truncate">{toolName}</span>
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[10px]">{formatTime(msg.ts)}</span>
                    </div>
                    <div className={cn("whitespace-pre-wrap break-all", tone.textClassName)}>{text}</div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
