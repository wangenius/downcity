"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Layers3Icon,
  KeyRoundIcon,
  MessageSquareTextIcon,
  PuzzleIcon,
  SparklesIcon,
  RefreshCcwIcon,
  ScrollTextIcon,
  ServerCogIcon,
  RadarIcon,
  TerminalIcon,
  ShieldCheckIcon,
} from "lucide-react"
import type { UiAgentOption, UiChatChannelStatus, UiContextSummary, UiTaskItem } from "@/types/Dashboard"
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
import { getChannelDisplayName } from "@/lib/channel-label"
import { buildContextGroups, resolveContextChannel } from "@/lib/context-groups"
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
   * 当前聚焦的 chat 渠道。
   */
  selectedChatChannel?: string
  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[]
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
   * 打开 channel 主视图。
   */
  onChannelOpen: (channel: string) => void
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
  globalEnv: <KeyRoundIcon />,
  globalModel: <ServerCogIcon />,
  globalChannelAccounts: <BotIcon />,
  globalCommand: <TerminalIcon />,
  globalAgents: <Layers3Icon />,
  globalExtensions: <PuzzleIcon />,
  agentOverview: <Layers3Icon />,
  agentAuthorization: <ShieldCheckIcon />,
  agentSkills: <SparklesIcon />,
  agentServices: <ServerCogIcon />,
  agentCommand: <TerminalIcon />,
  agentTasks: <RadarIcon />,
  agentLogs: <ScrollTextIcon />,
  contextOverview: <Layers3Icon />,
}

/**
 * 判断 channel 是否处于已启动态（用于 Sidebar 灰显控制）。
 */
function isChannelStarted(status: UiChatChannelStatus | undefined, fallbackByItems: boolean): boolean {
  if (!status) return fallbackByItems
  if (status.running === true) return true
  if (status.running === false) return false
  if (status.enabled === true) return true
  if (status.enabled === false) return false
  const linkState = String(status.linkState || "").trim().toLowerCase()
  if (["connected", "disconnected", "error"].includes(linkState)) return true
  return fallbackByItems
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
  selectedChatChannel,
  chatChannels,
  onViewChange,
  onAgentChange,
  onAgentEnter,
  onContextOpen,
  onTaskOpen,
  onChannelOpen,
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
  const chatItems = React.useMemo(
    () => [...(chatGroup?.items || []), ...otherContextGroups.flatMap((group) => group.items)],
    [chatGroup, otherContextGroups],
  )
  const chatChannelGroups = React.useMemo(() => {
    const buckets: Record<string, UiContextSummary[]> = {}
    const ensureBucket = (channelInput: string) => {
      const channel = String(channelInput || "").trim().toLowerCase()
      if (!channel) return
      if (!buckets[channel]) {
        buckets[channel] = []
      }
    }
    for (const item of chatItems) {
      const channel = resolveContextChannel(item)
      ensureBucket(channel)
      buckets[channel].push(item)
    }
    for (const status of chatChannels) {
      ensureBucket(String(status.channel || ""))
    }
    const preferredOrder = ["telegram", "qq", "feishu", "consoleui", "other"]
    const known = preferredOrder.filter((channel) => Object.prototype.hasOwnProperty.call(buckets, channel))
    const extras = Object.keys(buckets)
      .filter((channel) => !preferredOrder.includes(channel))
      .sort((a, b) => a.localeCompare(b))
    const orderedChannels = [...known, ...extras]
    return orderedChannels.map((channel) => ({
      channel,
      items: buckets[channel] || [],
    }))
  }, [chatChannels, chatItems])
  const globalItems = React.useMemo(() => listPrimaryPagesByScope("global"), [])
  const globalItemsWithoutAgents = React.useMemo(
    () => globalItems.filter((item) => item.view !== "globalAgents"),
    [globalItems],
  )
  const agentItems = React.useMemo(() => listPrimaryPagesByScope("agent"), [])
  const globalViews: DashboardView[] = ["globalOverview", "globalCommand", "globalEnv", "globalModel", "globalChannelAccounts", "globalAgents", "globalExtensions"]
  const sidebarMode: SidebarMode = globalViews.includes(activeView) ? "agent-list" : "agent-detail"
  const [navDirection, setNavDirection] = React.useState<"forward" | "back">("forward")
  const [hoveredAgentId, setHoveredAgentId] = React.useState("")
  const [collapsedChatChannels, setCollapsedChatChannels] = React.useState<Record<string, boolean>>({})
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
    "rounded-[12px] text-sidebar-foreground/82 hover:bg-sidebar-accent hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
  const menuItemButtonClass = `${menuButtonClass} h-9 px-2.5 text-[13px]`
  const menuItemDisabledClass = "h-9 px-2.5 opacity-60 data-[slot=sidebar-menu-button]:cursor-default"
  const rowClass = "grid w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)_1.5rem] items-center gap-2"
  const channelItemWrapperClass = "relative py-0.5"
  const channelToggleButtonClass =
    "absolute inset-y-0 left-1 z-10 my-auto h-6 w-6 rounded-[10px] text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground active:translate-y-0"
  const channelMainButtonClass = cn(
    menuItemButtonClass,
    "h-8 w-full rounded-[12px] px-2.5 pl-8 text-[11px] font-medium uppercase tracking-[0.08em]",
    "data-[active=true]:bg-sidebar-accent/75",
    "hover:bg-sidebar-accent/35",
  )
  const channelMainRowClass = "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
  const channelStateDotClass = "inline-flex h-2 w-2 rounded-full"
  const chatChildrenCollapseClass = "min-w-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
  const chatChildrenLayoutClass = "min-w-0 pl-4"
  const chatChildrenMenuClass = "min-w-0 gap-0 pl-1.5"
  const chatItemButtonClass = cn(
    menuItemButtonClass,
    "h-7 w-full min-w-0 rounded-[12px] px-2 text-[10px]",
    "data-[active=true]:bg-sidebar-accent/75",
    "hover:bg-sidebar-accent/45",
  )
  const chatItemRowClass = "grid w-full min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-1.5"
  const chatItemIconClass = "inline-flex size-4 items-center justify-center text-muted-foreground"
  const chatItemTextClass = "min-w-0 truncate text-[10px] font-medium"
  const normalizedSelectedChannel = String(selectedChatChannel || "").trim().toLowerCase()
  const statusByChannel = React.useMemo(() => {
    const map = new Map<string, UiChatChannelStatus>()
    for (const item of chatChannels) {
      const channel = String(item.channel || "").trim().toLowerCase()
      if (!channel) continue
      map.set(channel, item)
    }
    return map
  }, [chatChannels])

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
    <Sidebar collapsible="offcanvas" className="bg-transparent" {...props}>
      <SidebarHeader>
        <div className="px-3 pb-2 pt-3">
          <div className="flex h-9 max-w-full items-center gap-2 text-sidebar-foreground">
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "h-8 w-8 rounded-[11px] p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                sidebarMode === "agent-detail" ? "opacity-100" : "opacity-100",
              )}
              onClick={() => {
                if (sidebarMode === "agent-detail") onViewChange("globalOverview")
              }}
              aria-label={sidebarMode === "agent-detail" ? "返回" : "DOWNCITY"}
              title={sidebarMode === "agent-detail" ? "返回" : "DOWNCITY"}
            >
              {sidebarMode === "agent-detail" ? (
                <ChevronLeftIcon className="size-4" />
              ) : (
                <img
                  src="/image.png"
                  alt="DOWNCITY"
                  className="size-4 shrink-0 object-cover"
                />
              )}
            </Button>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 truncate",
                "text-[0.92rem] font-medium tracking-[-0.03em]",
              )}
            >
              <span>{sidebarMode === "agent-detail" ? (selectedAgent?.name || "Agent") : "DOWNCITY"}</span>
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
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/42">Console</SidebarGroupLabel>
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
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/42">Agents</SidebarGroupLabel>
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
                          onDoubleClick={() => onAgentEnter(agent.id)}
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
                                    "absolute inset-0 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[10px] p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
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
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/42">
                Agent
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {agentItems
                    .filter((item) => item.view !== "agentTasks" && item.view !== "agentServices" && item.view !== "agentCommand")
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
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/42">
                Chat
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {chatItems.length === 0 ? (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<button type="button" disabled />}
                        className={menuItemDisabledClass}
                      >
                        <span className="text-xs text-muted-foreground">暂无聊天会话</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ) : null}
                  {chatChannelGroups.map((group) => {
                    const channelStatus = statusByChannel.get(group.channel)
                    const channelStarted = isChannelStarted(channelStatus, group.items.length > 0)
                    const hasVisibleChildren = channelStarted && group.items.length > 0
                    const isCollapsed = hasVisibleChildren ? Boolean(collapsedChatChannels[group.channel]) : true
                    // 关键点（中文）：展示真实链路状态，优先 linkState，退化为 statusText。
                    const channelState = String(
                      channelStatus?.linkState ||
                      channelStatus?.statusText ||
                      (group.channel === "consoleui" ? "connected" : "unknown"),
                    )
                      .trim()
                      .toLowerCase()
                    const stateDotClass = !channelStarted
                      ? "bg-muted-foreground/45"
                      : channelState === "connected"
                      ? "bg-emerald-500"
                      : channelState === "disconnected" || channelState === "error" || channelState === "failed"
                        ? "bg-destructive"
                        : "bg-muted-foreground/60"
                    const isChannelMainViewActive =
                      activeView === "contextOverview" && normalizedSelectedChannel === group.channel
                    return (
                      <React.Fragment key={`chat-group:${group.channel}`}>
                        <SidebarMenuItem className={channelItemWrapperClass}>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className={cn(
                              channelToggleButtonClass,
                              !hasVisibleChildren && "cursor-default opacity-35 hover:bg-transparent hover:text-sidebar-foreground/60",
                            )}
                            disabled={!hasVisibleChildren}
                            onClick={(event) => {
                              // 关键点（中文）：折叠按钮只负责折叠，不触发 item 主点击逻辑。
                              event.preventDefault()
                              event.stopPropagation()
                              if (!hasVisibleChildren) return
                              setCollapsedChatChannels((prev) => ({
                                ...prev,
                                [group.channel]: !prev[group.channel],
                              }))
                            }}
                            aria-label={`${isCollapsed ? "展开" : "收起"} ${group.channel}`}
                            title={`${isCollapsed ? "展开" : "收起"} ${group.channel}`}
                          >
                            <ChevronRightIcon
                              className={cn(
                                "size-3.5 shrink-0 transform-gpu transition-transform duration-200 ease-out",
                                !isCollapsed ? "rotate-90" : "rotate-0",
                              )}
                            />
                          </Button>
                          <SidebarMenuButton
                            tooltip={`${group.channel} · ${channelState}`}
                            isActive={isChannelMainViewActive}
                            className={cn(
                              channelMainButtonClass,
                              !channelStarted && "text-muted-foreground/55 hover:bg-sidebar-accent/20 hover:text-muted-foreground/70",
                            )}
                            onClick={() => {
                              onChannelOpen(group.channel)
                            }}
                          >
                            <span className={channelMainRowClass}>
                                <span className="truncate">{getChannelDisplayName(group.channel)}</span>
                              <span
                                className={cn(channelStateDotClass, stateDotClass)}
                                aria-label={`link state: ${channelState}`}
                                title={channelState}
                              />
                            </span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem
                          className={cn(
                            chatChildrenCollapseClass,
                            isCollapsed ? "pointer-events-none max-h-0 opacity-0" : "max-h-[28rem] opacity-100",
                          )}
                        >
                          <div className={chatChildrenLayoutClass}>
                            <SidebarMenu className={chatChildrenMenuClass}>
                              {group.items.map((item) => {
                                const contextId = String(item.contextId || "").trim()
                                if (!contextId) return null
                                const chatTitle = String(item.chatTitle || "").trim()
                                const chatId = String(item.chatId || "").trim()
                                // 关键点（中文）：QQ 等渠道可能把 openid 回填到 chatTitle，这里做兜底清洗。
                                const normalizedTitle = chatTitle && (!chatId || chatTitle !== chatId) ? chatTitle : ""
                                const label = normalizedTitle || chatId || contextId
                                const isActive = activeView === "contextWorkspace" && selectedContextId === contextId
                                return (
                                  <SidebarMenuItem key={contextId} className="min-w-0">
                                    <SidebarMenuButton
                                      tooltip={normalizedTitle ? `${normalizedTitle} · ${contextId}` : contextId}
                                      isActive={isActive}
                                      onClick={() => onContextOpen(contextId)}
                                      className={chatItemButtonClass}
                                    >
                                      <span className={chatItemRowClass}>
                                        <span className={chatItemIconClass}>
                                          <MessageSquareTextIcon className="h-2.5 w-2.5" />
                                        </span>
                                        <span className={chatItemTextClass}>{label}</span>
                                      </span>
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                )
                              })}
                            </SidebarMenu>
                          </div>
                        </SidebarMenuItem>
                      </React.Fragment>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.16em] text-sidebar-foreground/42">Tasks</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3 pt-1">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 w-full justify-start gap-1.5 rounded-[12px] px-3 text-xs font-medium",
            topbarError
              ? "bg-destructive/12 text-destructive hover:bg-destructive/18"
              : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground",
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
