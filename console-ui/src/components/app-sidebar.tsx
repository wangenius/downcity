"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  BotIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  Layers3Icon,
  MessageSquareTextIcon,
  PuzzleIcon,
  RefreshCcwIcon,
  ScrollTextIcon,
  ServerCogIcon,
  RadarIcon,
  TerminalIcon,
} from "lucide-react"
import type { UiAgentOption, UiContextSummary, UiTaskItem } from "@/types/Dashboard"
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
  /**
   * 顶栏状态文案（展示在侧边栏底部）。
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
   * 刷新回调。
   */
  onRefresh: () => void
}

type SidebarMode = "agent-list" | "agent-detail"

const viewIconMap: Record<Exclude<DashboardView, "contextWorkspace">, React.ReactNode> = {
  globalOverview: <Layers3Icon />,
  globalModel: <ServerCogIcon />,
  globalAgents: <Layers3Icon />,
  globalExtensions: <PuzzleIcon />,
  agentOverview: <Layers3Icon />,
  agentServices: <ServerCogIcon />,
  agentCommand: <TerminalIcon />,
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
  topbarStatus,
  topbarError,
  loading,
  onRefresh,
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
    "rounded-md text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
  const menuItemButtonClass = `${menuButtonClass} h-9 px-2 text-[13px]`
  const menuItemDisabledClass = "h-9 px-2 opacity-60 data-[slot=sidebar-menu-button]:cursor-default"
  const rowClass = "grid w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)_1.5rem] items-center gap-2"

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
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border/80 bg-sidebar" {...props}>
      <SidebarHeader>
        <div className="px-2 py-2">
          <div className="flex h-8 max-w-full items-center gap-1 text-sidebar-foreground">
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-7 w-7 rounded-md p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                sidebarMode === "agent-detail" ? "opacity-100" : "opacity-100",
              )}
              onClick={() => {
                if (sidebarMode === "agent-detail") onViewChange("globalOverview")
              }}
              aria-label={sidebarMode === "agent-detail" ? "返回" : "SHIPMYAGENT"}
              title={sidebarMode === "agent-detail" ? "返回" : "SHIPMYAGENT"}
            >
              {sidebarMode === "agent-detail" ? (
                <ChevronLeftIcon className="size-4" />
              ) : (
                <img
                  src="/image.png"
                  alt="SHIPMYAGENT"
                  className="size-4 shrink-0 rounded-[3px] object-cover"
                />
              )}
            </Button>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 truncate",
                sidebarMode === "agent-list" ? "text-sm font-semibold tracking-[0.05em]" : "text-sm font-semibold",
              )}
            >
              <span>{sidebarMode === "agent-detail" ? (selectedAgent?.name || "Agent") : "SHIPMYAGENT"}</span>
            </span>
          </div>
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
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium tracking-[0.12em] text-sidebar-foreground/45">Console</SidebarGroupLabel>
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
                        className={menuItemButtonClass}
                      >
                        <span className={rowClass}>
                          <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                            {viewIconMap[item.view]}
                          </span>
                          <span className="truncate">{item.title}</span>
                          <span />
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium tracking-[0.12em] text-sidebar-foreground/45">Agents</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {agents.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton render={<button type="button" disabled />} className={menuItemDisabledClass}>
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
                            menuItemButtonClass,
                            !isRunning && "opacity-55",
                          )}
                        >
                          <span className={rowClass}>
                            <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                              <BotIcon className="size-4 shrink-0" />
                            </span>
                            <span className="min-w-0">
                              <span className="truncate">{agent.name || "unknown-agent"}</span>
                            </span>
                            {isRunning ? (
                              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                                <span
                                  className={cn(
                                    "inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500",
                                    hoveredAgentId === agent.id ? "opacity-0" : "opacity-100",
                                  )}
                                />
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className={cn(
                                    "absolute inset-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md p-0 text-sidebar-foreground/70 hover:bg-sidebar-foreground/20 hover:text-sidebar-foreground",
                                    hoveredAgentId === agent.id ? "opacity-100" : "pointer-events-none opacity-0",
                                  )}
                                  aria-label="进入 Agent"
                                  title="进入 Agent"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    onAgentEnter(agent.id)
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== "Enter" && event.key !== " ") return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    onAgentEnter(agent.id)
                                  }}
                                >
                                  <ChevronRightIcon className="size-4" />
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex h-2 w-2 shrink-0 justify-self-center rounded-full bg-muted-foreground/60" />
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
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium tracking-[0.12em] text-sidebar-foreground/45">
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
                        className={menuItemButtonClass}
                      >
                        <span className={rowClass}>
                          <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                            {viewIconMap[item.view]}
                          </span>
                          <span className="truncate">{item.title}</span>
                          <span />
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium tracking-[0.12em] text-sidebar-foreground/45">Tasks</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Task Overview"
                      isActive={activeView === "agentTasks" && !selectedTaskTitle}
                      onClick={() => onViewChange("agentTasks")}
                      className={menuItemButtonClass}
                    >
                      <span className={rowClass}>
                        <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                          <RadarIcon className="size-4" />
                        </span>
                        <span className="truncate">Overview</span>
                        <span />
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {tasks.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<button type="button" disabled />}
                        className={menuItemDisabledClass}
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
                          className={menuItemButtonClass}
                        >
                          <span className={rowClass}>
                            <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                              <RadarIcon className="size-4" />
                            </span>
                            <span className="truncate">{title}</span>
                            <span />
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-2 text-[10px] font-medium tracking-[0.12em] text-sidebar-foreground/45">Context</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Overview"
                      isActive={activeView === "contextOverview"}
                      onClick={() => onViewChange("contextOverview")}
                      className={menuItemButtonClass}
                    >
                      <span className={rowClass}>
                        <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                          <Layers3Icon className="size-4" />
                        </span>
                        <span className="truncate">Overview</span>
                        <span />
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {chatChannelGroups.map((entry) => {
                    const isCollapsed = Boolean(collapsedChatChannels[entry.channel])
                    return (
                      <React.Fragment key={`chat:${entry.channel}`}>
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            className={menuItemButtonClass}
                            onClick={() => {
                              setCollapsedChatChannels((prev) => ({
                                ...prev,
                                [entry.channel]: !prev[entry.channel],
                              }))
                            }}
                          >
                            <span className={rowClass}>
                              <span className="inline-flex size-4" />
                              <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                                {`chat/${entry.channel} (${entry.items.length})`}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{isCollapsed ? "+" : "-"}</span>
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        {!isCollapsed
                          ? entry.items.map((item) => (
                              <SidebarMenuItem key={item.contextId}>
                                <SidebarMenuButton
                                  tooltip={item.contextId}
                                  isActive={activeView === "contextWorkspace" && selectedContextId === item.contextId}
                                  onClick={() => onContextOpen(item.contextId)}
                                  className={menuItemButtonClass}
                                >
                                  <span className={rowClass}>
                                    <span className="inline-flex size-4" />
                                    <span className="truncate font-mono text-[12px]">{item.contextId}</span>
                                    <span />
                                  </span>
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
                          className={menuItemDisabledClass}
                        >
                          <span className={rowClass}>
                            <span className="inline-flex size-4" />
                            <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                              {`${group.title} (${group.items.length})`}
                            </span>
                            <span />
                          </span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.contextId}>
                          <SidebarMenuButton
                            tooltip={item.contextId}
                            isActive={activeView === "contextWorkspace" && selectedContextId === item.contextId}
                            onClick={() => onContextOpen(item.contextId)}
                            className={menuItemButtonClass}
                          >
                            <span className={rowClass}>
                              <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                                {item.contextId === "local_ui" ? <MessageSquareTextIcon className="size-4" /> : null}
                              </span>
                              <span className="truncate font-mono text-[12px]">
                                {item.contextId === "local_ui" ? "chat here" : item.contextId}
                              </span>
                              <span />
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

      <SidebarFooter className="pt-0">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-8 w-full justify-start gap-1.5 rounded-md px-2 text-xs font-medium",
            topbarError
              ? "bg-destructive/12 text-destructive hover:bg-destructive/18"
              : "bg-muted text-muted-foreground hover:bg-muted/90",
          )}
          onClick={onRefresh}
          disabled={loading}
          aria-label={loading ? "刷新中" : "刷新"}
          title={loading ? "刷新中" : "刷新"}
        >
          <RefreshCcwIcon className={cn("size-3.5 shrink-0", loading && "animate-spin")} />
          <span className="truncate">{topbarStatus}</span>
        </Button>
      </SidebarFooter>

    </Sidebar>
  )
}
