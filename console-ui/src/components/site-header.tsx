/**
 * 顶栏组件。
 */

import * as React from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export interface SiteHeaderProps {
  /**
   * 当前视图名称。
   */
  viewLabel: string
  /**
   * 右上角操作区内容。
   */
  rightActions?: React.ReactNode
}

export function SiteHeader(props: SiteHeaderProps) {
  const { viewLabel, rightActions } = props
  const compactTitle = React.useMemo(() => {
    const raw = String(viewLabel || "").trim()
    if (!raw) return "Overview"
    const normalized = raw.toLowerCase()
    if (normalized.includes("global")) return raw.replace(/global\s*/i, "").trim() || "Overview"
    if (normalized.includes("context")) return "Chat"
    if (normalized.includes("agent")) return raw.replace(/agent\s*/i, "").trim() || "Agent"
    return raw
  }, [viewLabel])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/80 bg-background transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto bg-border" />
        <h1 className="text-sm font-semibold tracking-[0.01em] text-foreground">{compactTitle}</h1>

        <div className="ml-auto flex items-center">{rightActions}</div>
      </div>
    </header>
  )
}
