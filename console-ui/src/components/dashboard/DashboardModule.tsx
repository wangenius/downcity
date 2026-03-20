/**
 * Dashboard 通用模块骨架。
 *
 * 关键点（中文）
 * - 统一 section 的“模块头 + 摘要 + 操作区 + 内容区”结构。
 * - 只负责模块边界与信息层级，不接管具体业务内容。
 * - 保持与 Model 页相同的工作台感，但避免额外装饰。
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface DashboardModuleProps {
  /**
   * 模块标题。
   */
  title: string
  /**
   * 模块摘要描述。
   */
  description?: React.ReactNode
  /**
   * 右上角操作区。
   */
  actions?: React.ReactNode
  /**
   * 模块主体内容。
   */
  children: React.ReactNode
  /**
   * 外层额外样式。
   */
  className?: string
  /**
   * 内容区额外样式。
   */
  bodyClassName?: string
}

export function DashboardModule(props: DashboardModuleProps) {
  const { title, description, actions, children, className, bodyClassName } = props

  return (
    <section
      className={cn(
        "space-y-3 rounded-[22px] bg-background px-4 py-4 shadow-[0_1px_0_rgba(17,17,19,0.03)] ring-1 ring-border/70",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("space-y-3", bodyClassName)}>{children}</div>
    </section>
  )
}
