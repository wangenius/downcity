/**
 * 顶栏组件。
 */

import type { UiAgentOption } from "@/types/Dashboard"
import { RefreshCcwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export interface SiteHeaderProps {
  /**
   * agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前选中 agent。
   */
  selectedAgentId: string
  /**
   * 顶栏状态文本。
   */
  topbarStatus: string
  /**
   * 顶栏是否错误态。
   */
  topbarError: boolean
  /**
   * 是否刷新中。
   */
  loading: boolean
  /**
   * agent 切换回调。
   */
  onAgentChange: (value: string) => void
  /**
   * 刷新回调。
   */
  onRefresh: () => void
  /**
   * 当前视图名称。
   */
  viewLabel: string
}

export function SiteHeader(props: SiteHeaderProps) {
  const { agents, selectedAgentId, topbarStatus, topbarError, loading, onAgentChange, onRefresh, viewLabel } = props

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-sidebar-border/70 bg-background/70 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full flex-wrap items-center gap-2 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-sm font-semibold tracking-tight text-foreground">{`Console Dashboard / ${viewLabel}`}</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {agents.length > 0 ? (
            <Select
              value={selectedAgentId}
              onValueChange={(value) => {
                if (value !== null) {
                  onAgentChange(value)
                }
              }}
            >
              <SelectTrigger className="w-80 max-w-[50vw]">
                <SelectValue placeholder="选择 agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {`${agent.name || "unknown-agent"} (${agent.host || "127.0.0.1"}:${agent.port || 0})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-md border border-dashed border-muted-foreground/35 px-3 py-1.5 text-xs text-muted-foreground">
              无运行中的 agent
            </div>
          )}

          <Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCcwIcon className={cn("mr-1.5 size-4", loading && "animate-spin")} />
            {loading ? "刷新中..." : "刷新"}
          </Button>

          <div
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium",
              topbarError ? "border-destructive/40 text-destructive" : "border-emerald-300 text-emerald-700",
            )}
          >
            {topbarStatus}
          </div>
        </div>
      </div>
    </header>
  )
}
