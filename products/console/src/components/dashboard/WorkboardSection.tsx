/**
 * Console 全局 Workboard 页面容器。
 *
 * 关键点（中文）
 * - 该页面只负责 Console 视角下的标题、错误态和选中状态托管。
 * - 真正的主舞台与交互逻辑交给 `@downcity/ui` 的 Workboard。
 */

import * as React from "react"
import { Workboard } from "@downcity/ui"
import type { UiWorkboardBoardSnapshot } from "@/types/Workboard"

export interface WorkboardSectionProps {
  /**
   * 当前全局板面。
   */
  board: UiWorkboardBoardSnapshot | null
  /**
   * 当前是否正在加载。
   */
  loading?: boolean
  /**
   * 错误信息。
   */
  errorMessage?: string
  /**
   * 手动刷新。
   */
  onRefresh?: () => void
}

export function WorkboardSection(props: WorkboardSectionProps) {
  const [selectedAgentId, setSelectedAgentId] = React.useState("")

  React.useEffect(() => {
    const items = props.board?.agents || []
    if (items.length === 0) {
      setSelectedAgentId("")
      return
    }

    const matched = items.find((item) => item.id === selectedAgentId)
    if (!matched) {
      setSelectedAgentId(items[0]?.id || "")
    }
  }, [props.board, selectedAgentId])

  return (
    <section className="space-y-4">
      {props.errorMessage ? (
        <div className="rounded-[22px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {props.errorMessage}
        </div>
      ) : null}

      <Workboard
        board={props.board}
        loading={props.loading}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        onRefresh={props.onRefresh}
      />
    </section>
  )
}
