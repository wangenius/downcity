/**
 * local_ui 对话区。
 */

import type { KeyboardEvent } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Local UI 对话（local_ui）</CardTitle>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          刷新
        </Button>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="max-h-64 flex-1 space-y-2 overflow-auto rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          {turns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-3 text-sm text-neutral-500">
              local_ui 暂无消息
            </div>
          ) : (
            turns.map((msg, index) => {
              const role = String(msg.role || "assistant");
              const text = String(msg.text || "").trim() || "(empty)";
              return (
                <article key={`${role}-${msg.ts || index}`} className="rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                    {`${role} · ${formatTime(msg.ts)}`}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm text-neutral-700">{text}</div>
                </article>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <Textarea
            rows={3}
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="只会发送到 local_ui（Ctrl/Cmd + Enter）"
          />
          <Button className="w-full" variant="default" disabled={sending} onClick={onSend}>
            {sending ? "发送中..." : "发送"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
