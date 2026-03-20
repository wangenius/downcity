import * as React from "react"
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
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 bg-transparent transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2 md:px-4 lg:gap-2 lg:px-5">
        <div className="flex h-10 w-full items-center gap-2 rounded-[18px] bg-secondary/70 px-2.5 backdrop-blur-sm">
          <SidebarTrigger className="-ml-0.5" />
          <h1 className="text-[0.95rem] font-medium tracking-[-0.02em] text-foreground">{compactTitle}</h1>

          <div className="ml-auto flex items-center">{rightActions}</div>
        </div>
      </div>
    </header>
  )
}
