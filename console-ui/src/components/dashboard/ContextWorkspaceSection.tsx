/**
 * Context 工作区（只在选中 context 后展示）。
 */

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  /**
   * 切换 context。
   */
  onSelectContext: (contextId: string) => void
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
    onSelectContext,
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
      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Context Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
            <Select value={selectedContextId || undefined} onValueChange={onSelectContext}>
              <SelectTrigger>
                <SelectValue placeholder="选择 context" />
              </SelectTrigger>
              <SelectContent>
                {contexts.map((item) => (
                  <SelectItem key={item.contextId} value={item.contextId}>
                    {item.contextId === LOCAL_UI_CONTEXT_ID ? "chat here (local_ui)" : item.contextId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              {`messages ${selectedContext?.messageCount || 0} · updated ${formatTime(selectedContext?.updatedAt)}`}
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-background/75 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-mono">{selectedContextId}</span>
            <span>{` · ${selectedContext?.lastRole || "unknown"} · ${selectedContext?.lastText || "(empty)"}`}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <HistoryViewerPanel
            channelHistory={channelHistory}
            contextMessages={contextMessages}
            formatTime={formatTime}
          />
        </div>

        <div className="min-w-0">
          <PromptSection
            prompt={prompt}
            localUiContextId={selectedContextId}
            onRefresh={onRefreshPrompt}
          />
        </div>
      </div>

      <Card className="border-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle>Composer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={chatInput}
            onChange={(event) => onChangeInput(event.target.value)}
            rows={4}
            placeholder={isLocalUi ? "输入发给 local_ui 的指令..." : "当前 context 为只读，仅 local_ui 可发送"}
            disabled={!isLocalUi}
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {isLocalUi
                ? "当前可发送到 local_ui（chat here）"
                : "只读模式：切换到 local_ui 才能发送"}
            </div>
            <Button onClick={onSendLocalMessage} disabled={!isLocalUi || sending || !chatInput.trim()}>
              {sending ? "发送中..." : "发送"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
