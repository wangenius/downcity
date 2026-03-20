/**
 * local_ui 对话区。
 */

import type { KeyboardEvent } from "react";
import { Button } from "../ui/button";
import { DashboardModule } from "./DashboardModule";
import { Textarea } from "../ui/textarea";
import type { UiLocalMessage } from "../../types/Dashboard";

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
              const text = String(msg.text || "").trim() || "(empty)";
              const isUser = role === "user";
              return (
                <article
                  key={`${role}-${msg.ts || index}`}
                  className={
                    isUser
                      ? "rounded-[16px] bg-background px-3 py-2.5 shadow-[0_1px_0_rgba(17,17,19,0.03)]"
                      : "rounded-[16px] px-3 py-2.5 transition-colors hover:bg-background/58"
                  }
                >
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {`${role} · ${formatTime(msg.ts)}`}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-foreground/88">{text}</div>
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
