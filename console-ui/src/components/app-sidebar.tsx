"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  ArrowRightIcon,
  BotIcon,
  ChevronLeftIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  PuzzleIcon,
  ScrollTextIcon,
  ServerCogIcon,
  RadarIcon,
} from "lucide-react"
import type { UiAgentOption, UiContextSummary, UiTaskItem } from "@/types/Dashboard"
import type { DashboardView } from "@/types/Navigation"
import {
  Sidebar,
  SidebarContent,
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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

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
   * 当前路由 pathname。
   */
  routePathname: string
  /**
   * 当前路由对应的 agent id（由 pathname 解析得到）。
   */
  routeAgentId: string
  /**
   * context 列表。
   */
  contexts: UiContextSummary[]
  /**
   * 当前选中 context。
   */
  selectedContextId: string
  /**
   * 当前 agent 下任务列表。
   */
  tasks: UiTaskItem[]
  /**
   * 当前选中 task 标题。
   */
  selectedTaskTitle?: string
  /**
   * 切换视图回调。
   */
  onViewChange: (view: DashboardView) => void
  /**
   * 切换 agent 回调。
   */
  onAgentChange: (agentId: string) => void
  /**
   * 进入 agent 二级侧边栏与页面。
   */
  onAgentEnter: (agentId: string) => void
  /**
   * 打开 context workspace 并选中 context。
   */
  onContextOpen: (contextId: string) => void
  /**
   * 打开任务详情。
   */
  onTaskOpen: (taskTitle: string) => void
}

type SidebarMode = "agent-list" | "agent-detail"

const viewIconMap: Record<Exclude<DashboardView, "contextWorkspace">, React.ReactNode> = {
  globalOverview: <Layers3Icon />,
  globalModel: <ServerCogIcon />,
  globalAgents: <Layers3Icon />,
  globalExtensions: <PuzzleIcon />,
  agentOverview: <Layers3Icon />,
  agentServices: <ServerCogIcon />,
  agentTasks: <RadarIcon />,
  agentLogs: <ScrollTextIcon />,
  contextOverview: <Layers3Icon />,
}

export function AppSidebar({
  activeView,
  agents,
  selectedAgentId,
  routePathname,
  routeAgentId,
  contexts,
  selectedContextId,
  tasks,
  selectedTaskTitle,
  onViewChange,
  onAgentChange,
  onAgentEnter,
  onContextOpen,
  onTaskOpen,
  ...props
}: AppSidebarProps) {
  const groupedContexts = buildContextGroups(contexts)
  const chatGroup = React.useMemo(
    () => groupedContexts.find((group) => group.key === "chat") ?? null,
    [groupedContexts],
  )
  const otherContextGroups = React.useMemo(
    () => groupedContexts.filter((group) => group.key !== "chat"),
    [groupedContexts],
  )
  const chatChannelGroups = React.useMemo(() => {
    const buckets: Record<string, UiContextSummary[]> = {
      telegram: [],
      qq: [],
      feishu: [],
      unknown: [],
    }
    for (const item of chatGroup?.items || []) {
      const contextId = String(item.contextId || "")
      const key = contextId.startsWith("telegram-")
        ? "telegram"
        : contextId.startsWith("qq-")
          ? "qq"
          : contextId.startsWith("feishu-")
            ? "feishu"
            : "unknown"
      buckets[key].push(item)
    }
    return (["telegram", "qq", "feishu", "unknown"] as const)
      .map((channel) => ({
        channel,
        items: buckets[channel],
      }))
      .filter((entry) => entry.items.length > 0)
  }, [chatGroup])
  const globalItems = React.useMemo(() => listPrimaryPagesByScope("global"), [])
  const globalItemsWithoutAgents = React.useMemo(
    () => globalItems.filter((item) => item.view !== "globalAgents"),
    [globalItems],
  )
  const agentItems = React.useMemo(() => listPrimaryPagesByScope("agent"), [])
  const globalViews: DashboardView[] = ["globalOverview", "globalModel", "globalAgents", "globalExtensions"]
  const sidebarMode: SidebarMode = globalViews.includes(activeView) ? "agent-list" : "agent-detail"
  const [navDirection, setNavDirection] = React.useState<"forward" | "back">("forward")
  const [collapsedChatChannels, setCollapsedChatChannels] = React.useState<Record<string, boolean>>({})
  const [hoveredAgentId, setHoveredAgentId] = React.useState("")
  const previousSidebarModeRef = React.useRef<SidebarMode>(sidebarMode)
  const isGlobalAgentOverviewRoute = React.useMemo(() => {
    if (activeView !== "globalOverview") return false
    const parts = routePathname.split("/").filter(Boolean)
    return parts.length >= 3 && parts[0] === "global" && parts[1] === "agent"
  }, [activeView, routePathname])
  const isPureGlobalOverviewRoute = React.useMemo(() => {
    const parts = routePathname.split("/").filter(Boolean)
    return parts.length >= 2 && parts[0] === "global" && parts[1] === "overview"
  }, [routePathname])

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null
  const menuButtonClass =
    "rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"

  React.useEffect(() => {
    const previous = previousSidebarModeRef.current
    if (previous === sidebarMode) return
    setNavDirection(sidebarMode === "agent-detail" ? "forward" : "back")
    previousSidebarModeRef.current = sidebarMode
  }, [sidebarMode])

  React.useEffect(() => {
    setCollapsedChatChannels({})
  }, [selectedAgentId])

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border" {...props}>
      <SidebarHeader>
        <div className="px-3 py-2">
          {sidebarMode === "agent-detail" ? (
            <div className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-sidebar-foreground">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => {
                  onViewChange("globalOverview")
                }}
                aria-label="返回"
                title="返回"
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              <span className="truncate">{selectedAgent?.name || "Agent"}</span>
            </div>
          ) : (
            <div className="text-sm font-semibold tracking-[0.08em] text-sidebar-foreground">SHIPMYAGENT</div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="relative gap-1.5 overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "absolute inset-0 overflow-y-auto transition-all duration-200 ease-out",
              sidebarMode === "agent-list" ? "translate-x-0 opacity-100" : navDirection === "forward" ? "-translate-x-6 opacity-0" : "translate-x-6 opacity-0",
              sidebarMode === "agent-list" ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Console</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {globalItemsWithoutAgents.map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={
                          item.view === "globalOverview"
                            ? activeView === "globalOverview" && isPureGlobalOverviewRoute
                            : activeView === item.view
                        }
                        onClick={() => onViewChange(item.view)}
                        className={menuButtonClass}
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
              <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Agents</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {agents.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton render={<button type="button" disabled />} className="opacity-70 data-[slot=sidebar-menu-button]:cursor-default">
                        <span className="text-xs text-muted-foreground">无运行中的 agent</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {agents.map((agent) => {
                    const isActive = isGlobalAgentOverviewRoute && agent.id === routeAgentId
                    const isRunning = agent.running === true
                    return (
                      <SidebarMenuItem key={agent.id}>
                        <SidebarMenuButton
                          tooltip={agent.id}
                          isActive={isActive}
                          onMouseEnter={() => setHoveredAgentId(agent.id)}
                          onMouseLeave={() => setHoveredAgentId((prev) => (prev === agent.id ? "" : prev))}
                          onClick={() => onAgentChange(agent.id)}
                          className={cn(
                            menuButtonClass,
                            !isRunning && "opacity-55",
                          )}
                        >
                          <span className="flex min-w-0 w-full items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <BotIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{agent.name || "unknown-agent"}</span>
                            </span>
                            {isRunning ? (
                              <span className="inline-flex items-center">
                                <span
                                  className={`inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500 ${
                                    hoveredAgentId === agent.id ? "hidden" : ""
                                  }`}
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={`h-5 w-5 p-0 ${hoveredAgentId === agent.id ? "inline-flex" : "hidden"}`}
                                  aria-label="进入 Agent"
                                  title="进入 Agent"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onAgentEnter(agent.id)
                                  }}
                                >
                                  <ArrowRightIcon className="size-3.5" />
                                </Button>
                              </span>
                            ) : (
                              <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-muted-foreground/60" />
                            )}
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>

          <div
            className={cn(
              "absolute inset-0 overflow-y-auto transition-all duration-200 ease-out",
              sidebarMode === "agent-detail" ? "translate-x-0 opacity-100" : navDirection === "forward" ? "translate-x-6 opacity-0" : "-translate-x-6 opacity-0",
              sidebarMode === "agent-detail" ? "pointer-events-auto" : "pointer-events-none",
            )}
          >
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
                Agent
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {agentItems
                    .filter((item) => item.view !== "agentTasks")
                    .map((item) => (
                    <SidebarMenuItem key={item.view}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={activeView === item.view}
                        onClick={() => onViewChange(item.view)}
                        className={menuButtonClass}
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
              <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Tasks</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Task Overview"
                      isActive={activeView === "agentTasks" && !selectedTaskTitle}
                      onClick={() => onViewChange("agentTasks")}
                      className={menuButtonClass}
                    >
                      <RadarIcon />
                      <span>Overview</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {tasks.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<button type="button" disabled />}
                        className="opacity-70 data-[slot=sidebar-menu-button]:cursor-default"
                      >
                        <span className="text-xs text-muted-foreground">暂无任务</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {tasks.map((task) => {
                    const title = String(task.title || "").trim()
                    if (!title) return null
                    return (
                      <SidebarMenuItem key={`task:${title}`}>
                        <SidebarMenuButton
                          tooltip={title}
                          isActive={activeView === "agentTasks" && selectedTaskTitle === title}
                          onClick={() => onTaskOpen(title)}
                          className={menuButtonClass}
                        >
                          <RadarIcon />
                          <span className="w-full truncate text-xs">{title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
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
                      className={menuButtonClass}
                    >
                      <Layers3Icon />
                      <span>Overview</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {chatChannelGroups.map((entry) => {
                    const isCollapsed = Boolean(collapsedChatChannels[entry.channel])
                    return (
                      <React.Fragment key={`chat:${entry.channel}`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            onClick={() => {
                              setCollapsedChatChannels((prev) => ({
                                ...prev,
                                [entry.channel]: !prev[entry.channel],
                              }))
                            }}
                          >
                            <span className="w-full truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                              {`chat/${entry.channel} (${entry.items.length})`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{isCollapsed ? "+" : "-"}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        {!isCollapsed
                          ? entry.items.map((item) => (
                              <SidebarMenuItem key={item.contextId}>
                                <SidebarMenuButton
                                  tooltip={item.contextId}
                                  isActive={activeView === "contextWorkspace" && selectedContextId === item.contextId}
                                  onClick={() => onContextOpen(item.contextId)}
                                  className={menuButtonClass}
                                >
                                  <span className="w-full truncate font-mono text-xs">{item.contextId}</span>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            ))
                          : null}
                      </React.Fragment>
                    )
                  })}
                  {otherContextGroups.map((group) => (
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
                            className={menuButtonClass}
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
          </div>
        </div>
      </SidebarContent>

    </Sidebar>
  )
}
