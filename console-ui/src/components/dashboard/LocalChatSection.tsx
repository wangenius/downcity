/**
 * local_ui 对话区。
 */

import type { KeyboardEvent } from "react";
import { Button } from "@downcity/ui";
import { cn } from "@/lib/utils";
import { DashboardModule } from "./DashboardModule";
import { Textarea } from "@downcity/ui";
import type { UiLocalMessage } from "../../types/Dashboard";

/**
 * 生成时间线角色标签。
 *
 * 关键点（中文）
 * - local_ui 直接展示 session timeline，因此这里要把 toolName 一起显示出来。
 */
function formatTimelineRoleLabel(params: {
  role?: string;
  toolName?: string;
}): string {
  const role = String(params.role || "unknown").trim();
  const toolName = String(params.toolName || "").trim();
  if ((role === "tool-call" || role === "tool-result") && toolName) {
    return `${role} · ${toolName}`;
  }
  return role || "unknown";
}

/**
 * 生成 local_ui 时间线视觉样式。
 *
 * 关键点（中文）
 * - tool-call / tool-result 需要和普通 user / assistant 显式区分。
 */
function getTimelineVisualTone(roleInput?: string): {
  cardClassName: string;
  roleBadgeClassName: string;
  toolBadgeClassName: string;
  textClassName: string;
} {
  const role = String(roleInput || "unknown").trim();
  if (role === "tool-call") {
    return {
      cardClassName: "rounded-[16px] border border-border/70 bg-secondary/92 px-3 py-2.5",
      roleBadgeClassName: "bg-foreground text-background",
      toolBadgeClassName: "bg-background/92 text-foreground ring-1 ring-border/70",
      textClassName: "font-mono text-xs text-foreground/92",
    };
  }
  if (role === "tool-result") {
    return {
      cardClassName: "rounded-[16px] border border-border/55 bg-background px-3 py-2.5",
      roleBadgeClassName: "bg-secondary text-foreground/86",
      toolBadgeClassName: "bg-secondary/82 text-foreground/78 ring-1 ring-border/60",
      textClassName: "font-mono text-xs text-foreground/82",
    };
  }
  if (role === "user") {
    return {
      cardClassName:
        "rounded-[16px] bg-background px-3 py-2.5 shadow-[0_1px_0_rgba(17,17,19,0.03)]",
      roleBadgeClassName: "bg-secondary text-foreground/78",
      toolBadgeClassName: "bg-secondary text-muted-foreground",
      textClassName: "text-sm text-foreground/88",
    };
  }
  return {
    cardClassName:
      "rounded-[16px] px-3 py-2.5 transition-colors hover:bg-background/58",
    roleBadgeClassName: "bg-secondary text-foreground/78",
    toolBadgeClassName: "bg-secondary text-muted-foreground",
    textClassName: "text-sm text-foreground/88",
  };
}

export interface LocalChatSectionProps {
  /**
   * local_ui 消息列表。
   */
  localMessages: UiLocalMessage[];
  /**
   * 输入内容。
   */
  chatInput: string;
  /**
   * 是否正在发送。
   */
  sending: boolean;
  /**
   * 输入变化回调。
   */
  onChangeInput: (value: string) => void;
  /**
   * 刷新消息回调。
   */
  onRefresh: () => void;
  /**
   * 发送回调。
   */
  onSend: () => void;
  /**
   * 时间格式化。
   */
  formatTime: (ts?: number | string) => string;
}

export function LocalChatSection(props: LocalChatSectionProps) {
  const { localMessages, chatInput, sending, onChangeInput, onRefresh, onSend, formatTime } = props;
  const turns = localMessages.slice(-16);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <DashboardModule
      title="Local UI Chat"
      description={`local_ui 最近 ${turns.length} 条消息。`}
      className="h-full"
      bodyClassName="flex h-full flex-col gap-3"
      actions={
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      }
    >
        <div className="max-h-64 flex-1 space-y-2 overflow-auto rounded-[20px] bg-secondary/85 p-2">
          {turns.length === 0 ? (
            <div className="rounded-[16px] bg-background/78 p-3 text-sm text-muted-foreground">
              local_ui 暂无消息
            </div>
          ) : (
            turns.map((msg, index) => {
              const role = String(msg.role || "assistant");
              const roleLabel = formatTimelineRoleLabel({
                role,
                toolName: msg.toolName,
              });
              const tone = getTimelineVisualTone(role);
              const toolName = String(msg.toolName || "").trim();
              const text = String(msg.text || "").trim() || "(empty)";
              return (
                <article
                  key={`${role}-${msg.ts || index}`}
                  className={tone.cardClassName}
                >
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
                            "inline-flex h-5 max-w-[min(48vw,14rem)] items-center rounded-full px-2 font-mono text-[10px]",
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
                  <div className={cn("whitespace-pre-wrap break-words", tone.textClassName)}>{text}</div>
                </article>
              );
            })
          )}
        </div>

        <div className="space-y-2 rounded-[20px] bg-secondary/85 p-2">
          <Textarea
            rows={3}
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="只会发送到 local_ui（Ctrl/Cmd + Enter）"
            className="bg-background/80 focus-visible:bg-background"
          />
          <Button className="w-full" variant="default" disabled={sending} onClick={onSend}>
            {sending ? "发送中..." : "发送"}
          </Button>
        </div>
    </DashboardModule>
  );
}
