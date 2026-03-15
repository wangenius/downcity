"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  CommandIcon,
  CpuIcon,
  ChevronsUpDownIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerCogIcon,
  RadarIcon,
  ActivityIcon,
} from "lucide-react"
import type { UiAgentOption, UiContextSummary } from "@/types/Dashboard"
import type { DashboardView } from "@/types/Navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { buildContextGroups } from "@/lib/context-groups"
import { listPrimaryPagesByScope } from "@/lib/dashboard-navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type { DashboardView }

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /**
   * 当前激活视图。
   */
  activeView: DashboardView
  /**
   * 可切换 agent 列表。
   */
  agents: UiAgentOption[]
  /**
   * 当前选中 agent id。
   */
  selectedAgentId: string
  /**
   * context 列表。
   */
  contexts: UiContextSummary[]
  /**
   * 当前选中 context。
   */
  selectedContextId: string
  /**
   * 切换视图回调。
   */
  onViewChange: (view: DashboardView) => void
  /**
   * 切换 agent 回调。
   */
  onAgentChange: (agentId: string) => void
  /**
   * 打开 context workspace 并选中 context。
   */
  onContextOpen: (contextId: string) => void
}

const viewIconMap: Record<Exclude<DashboardView, "contextWorkspace">, React.ReactNode> = {
  globalOverview: <Layers3Icon />,
  globalRuntime: <ActivityIcon />,
  globalModel: <ServerCogIcon />,
  globalAgents: <CpuIcon />,
  globalExtensions: <PuzzleIcon />,
  agentOverview: <CpuIcon />,
  agentServices: <ServerCogIcon />,
  agentTasks: <RadarIcon />,
  agentLogs: <ScrollTextIcon />,
  contextOverview: <Layers3Icon />,
}

export function AppSidebar({
  activeView,
  agents,
  selectedAgentId,
  contexts,
  selectedContextId,
  onViewChange,
  onAgentChange,
  onContextOpen,
  ...props
}: AppSidebarProps) {
  const groupedContexts = buildContextGroups(contexts)
  const globalItems = React.useMemo(() => listPrimaryPagesByScope("global"), [])
  const agentItems = React.useMemo(() => listPrimaryPagesByScope("agent"), [])
  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? null

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-2.5!" render={<button type="button" />}>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
                <CommandIcon className="size-4!" />
              </span>
              <span className="text-base font-semibold tracking-tight text-sidebar-foreground">ShipMyAgent</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1.5">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Global</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeView === item.view}
                    onClick={() => onViewChange(item.view)}
                    className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                  >
                    {viewIconMap[item.view]}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Agent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agentItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeView === item.view}
                    onClick={() => onViewChange(item.view)}
                    className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                  >
                    {viewIconMap[item.view]}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Context</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Overview"
                  isActive={activeView === "contextOverview"}
                  onClick={() => onViewChange("contextOverview")}
                  className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                >
                  <Layers3Icon />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {groupedContexts.map((group) => (
                <React.Fragment key={group.key}>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<button type="button" disabled />}
                      className="opacity-70 data-[slot=sidebar-menu-button]:cursor-default"
                    >
                      <span className="w-full truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                        {`${group.title} (${group.items.length})`}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.contextId}>
                      <SidebarMenuButton
                        tooltip={item.contextId}
                        isActive={activeView === "contextWorkspace" && selectedContextId === item.contextId}
                        onClick={() => onContextOpen(item.contextId)}
                        className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
                      >
                        {item.contextId === "local_ui" ? <MessageSquareTextIcon /> : null}
                        <span className="w-full truncate font-mono text-xs">
                          {item.contextId === "local_ui" ? "chat here" : item.contextId}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </React.Fragment>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="space-y-2 px-2 py-2">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Active Agent
          </div>
          {agents.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-auto w-full justify-between rounded-lg border-sidebar-border bg-background px-3 py-2"
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">
                    {String(selectedAgent?.name || "A")
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {selectedAgent?.name || "unknown-agent"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {selectedAgent?.host && selectedAgent?.port
                        ? `${selectedAgent.host}:${selectedAgent.port}`
                        : "switch agent"}
                    </span>
                  </span>
                </span>
                <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" sideOffset={8} className="max-h-80">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Select Agent</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={selectedAgentId}
                  onValueChange={(value) => {
                    if (value !== null) onAgentChange(value)
                  }}
                >
                  {agents.map((agent) => (
                    <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{agent.name || "unknown-agent"}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {agent.host && agent.port ? `${agent.host}:${agent.port}` : agent.id}
                        </span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="rounded-lg border border-dashed border-sidebar-border px-2 py-1.5 text-xs text-muted-foreground">
              无运行中的 agent
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
