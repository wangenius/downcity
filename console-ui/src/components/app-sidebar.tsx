"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  CommandIcon,
  CpuIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerCogIcon,
  RadarIcon,
} from "lucide-react"
import type { UiAgentOption, UiContextSummary } from "@/types/Dashboard"
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
import { NavUser } from "@/components/nav-user"
import { buildContextGroups } from "@/lib/context-groups"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type DashboardView =
  | "globalOverview"
  | "globalRuntime"
  | "globalModel"
  | "globalAgents"
  | "globalExtensions"
  | "agentOverview"
  | "agentServices"
  | "agentTasks"
  | "agentLogs"
  | "contextOverview"
  | "contextWorkspace"

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

const globalItems: Array<{ key: DashboardView; title: string; icon: React.ReactNode }> = [
  { key: "globalOverview", title: "Overview", icon: <Layers3Icon /> },
  { key: "globalRuntime", title: "Console Runtime", icon: <ServerCogIcon /> },
  { key: "globalModel", title: "Model", icon: <ServerCogIcon /> },
  { key: "globalAgents", title: "Agents", icon: <CpuIcon /> },
  { key: "globalExtensions", title: "Extensions", icon: <PuzzleIcon /> },
]

const agentItems: Array<{ key: DashboardView; title: string; icon: React.ReactNode }> = [
  { key: "agentOverview", title: "Agent Overview", icon: <CpuIcon /> },
  { key: "agentServices", title: "Services", icon: <ServerCogIcon /> },
  { key: "agentTasks", title: "Tasks", icon: <RadarIcon /> },
  { key: "agentLogs", title: "Logs", icon: <ScrollTextIcon /> },
]

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

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-1.5!" render={<button type="button" />}>
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">ShipMyAgent</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="px-2 pb-1">
          {agents.length > 0 ? (
            <Select
              value={selectedAgentId}
              onValueChange={(value) => {
                if (value !== null) onAgentChange(value)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择 agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {`${agent.name || "unknown-agent"}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
              无运行中的 agent
            </div>
          )}
        </div>

      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Global</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {globalItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeView === item.key}
                    onClick={() => onViewChange(item.key)}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Agent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {agentItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={activeView === item.key}
                    onClick={() => onViewChange(item.key)}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Context</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Context Overview"
                  isActive={activeView === "contextOverview"}
                  onClick={() => onViewChange("contextOverview")}
                >
                  <Layers3Icon />
                  <span>Context Overview</span>
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
                      >
                        {item.contextId === "local_ui" ? <MessageSquareTextIcon /> : null}
                        <span className="w-full truncate font-mono text-xs">{item.contextId}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </React.Fragment>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          user={{
            name: "SMA Console",
            email: "runtime@local",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
