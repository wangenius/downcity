"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  BoltIcon,
  CommandIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  NetworkIcon,
  NotepadTextIcon,
  RadarIcon,
  ScrollTextIcon,
} from "lucide-react"
import type { UiContextSummary } from "@/types/Dashboard"
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

export type DashboardView =
  | "overview"
  | "services"
  | "commsContext"
  | "tasks"
  | "logs"
  | "extensions"
  | "contextDetail"
  | "localChat"

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /**
   * 当前激活视图。
   */
  activeView: DashboardView
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
   * 打开 context 状态页。
   */
  onContextOpen: (contextId: string) => void
  /**
   * 打开 local_ui 聊天页。
   */
  onLocalChatOpen: () => void
}

const mainItems: Array<{ key: DashboardView; title: string; icon: React.ReactNode }> = [
  { key: "overview", title: "Overview", icon: <Layers3Icon /> },
  { key: "services", title: "Services", icon: <BoltIcon /> },
  { key: "commsContext", title: "Comms & Context", icon: <NetworkIcon /> },
  { key: "tasks", title: "Tasks", icon: <RadarIcon /> },
  { key: "logs", title: "Logs", icon: <ScrollTextIcon /> },
  { key: "extensions", title: "Extensions", icon: <NotepadTextIcon /> },
]

export function AppSidebar({
  activeView,
  contexts,
  selectedContextId,
  onViewChange,
  onContextOpen,
  onLocalChatOpen,
  ...props
}: AppSidebarProps) {
  const sortedContexts = [...contexts].sort((a, b) => a.contextId.localeCompare(b.contextId))

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
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Runtime</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
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
          <SidebarGroupLabel>Contexts</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="local_ui chat"
                  isActive={activeView === "localChat"}
                  onClick={onLocalChatOpen}
                >
                  <MessageSquareTextIcon />
                  <span>local_ui chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {sortedContexts.map((item) => {
                if (item.contextId === "local_ui") return null
                return (
                  <SidebarMenuItem key={item.contextId}>
                    <SidebarMenuButton
                      tooltip={item.contextId}
                      isActive={activeView === "contextDetail" && selectedContextId === item.contextId}
                      onClick={() => onContextOpen(item.contextId)}
                    >
                      <span className="w-full truncate font-mono text-xs">{item.contextId}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
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
