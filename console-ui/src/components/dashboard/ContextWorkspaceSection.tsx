/**
 * Context 工作区（只在选中 context 后展示）。
 */

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { UiContextSummary, UiPromptResponse } from "@/types/Dashboard"
import { HistoryViewerPanel } from "./comms/HistoryViewerPanel"
import { PromptSection } from "./PromptSection"
import type { UiChatHistoryEvent, UiContextTimelineMessage } from "@/types/Dashboard"

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
   * 刷新 prompt。
   */
  onRefreshPrompt: () => void
}

const LOCAL_UI_CONTEXT_ID = "local_ui"

export function ContextWorkspaceSection(props: ContextWorkspaceSectionProps) {
  const {
    selectedContextId,
    contexts,
    channelHistory,
    contextMessages,
    prompt,
    chatInput,
    sending,
    formatTime,
    onChangeInput,
    onSendLocalMessage,
    onRefreshPrompt,
  } = props

  const selectedContext = contexts.find((item) => item.contextId === selectedContextId) || null
  const isLocalUi = selectedContextId === LOCAL_UI_CONTEXT_ID

  if (!selectedContextId) {
    return (
      <Card className="border-dashed border-border bg-card/70">
        <CardContent className="p-6 text-sm text-muted-foreground">请选择一个 context 进入工作区</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card className="border-border/80 bg-card/90 shadow-sm">
            <CardHeader>
              <CardTitle>Context Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2 font-mono text-xs">
                {selectedContextId}
              </div>
              <div className="text-xs text-muted-foreground">{`messages ${selectedContext?.messageCount || 0}`}</div>
              <div className="text-xs text-muted-foreground">{`updated ${formatTime(selectedContext?.updatedAt)}`}</div>
              <div className="rounded-lg border border-border/70 bg-background/75 px-2.5 py-2 text-xs text-muted-foreground">
                {`${selectedContext?.lastRole || "unknown"} · ${selectedContext?.lastText || "(empty)"}`}
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0">
            <PromptSection
              prompt={prompt}
              localUiContextId={selectedContextId}
              onRefresh={onRefreshPrompt}
            />
          </div>
        </div>

        <div className="min-w-0">
          <HistoryViewerPanel
            channelHistory={channelHistory}
            contextMessages={contextMessages}
            formatTime={formatTime}
          />
        </div>
      </div>

      {isLocalUi ? (
        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader>
            <CardTitle>local_ui Composer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={chatInput}
              onChange={(event) => onChangeInput(event.target.value)}
              rows={4}
              placeholder="输入发给 local_ui 的指令..."
            />
            <div className="flex justify-end">
              <Button onClick={onSendLocalMessage} disabled={sending || !chatInput.trim()}>
                {sending ? "发送中..." : "发送"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardContent className="p-4 text-xs text-muted-foreground">
            当前 context 为只读，只有 `local_ui` 支持在 UI 里发送指令。
          </CardContent>
        </Card>
      )}
    </div>
  )
}
