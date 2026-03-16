"use client"

/**
 * Dashboard 侧边栏（真实导航）。
 */

import * as React from "react"
import {
  ArrowLeftIcon,
  BotIcon,
  CommandIcon,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
   * 启动未运行的 agent。
   */
  onStartAgent: (agentId: string) => Promise<void> | void
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
  contexts,
  selectedContextId,
  tasks,
  selectedTaskTitle,
  onViewChange,
  onAgentChange,
  onStartAgent,
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
  const agentItems = React.useMemo(() => listPrimaryPagesByScope("agent"), [])
  const [sidebarMode, setSidebarMode] = React.useState<SidebarMode>("agent-list")
  const [navDirection, setNavDirection] = React.useState<"forward" | "back">("forward")
  const [collapsedChatChannels, setCollapsedChatChannels] = React.useState<Record<string, boolean>>({})
  const [confirmStartAgent, setConfirmStartAgent] = React.useState<UiAgentOption | null>(null)
  const [startingAgentId, setStartingAgentId] = React.useState("")

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null

  React.useEffect(() => {
    const nextMode: SidebarMode =
      activeView === "globalOverview" ||
      activeView === "globalModel" ||
      activeView === "globalAgents" ||
      activeView === "globalExtensions"
        ? "agent-list"
        : "agent-detail"
    setSidebarMode((prev) => {
      if (prev !== nextMode) {
        setNavDirection(nextMode === "agent-detail" ? "forward" : "back")
      }
      return nextMode
    })
  }, [activeView])

  React.useEffect(() => {
    setCollapsedChatChannels({})
  }, [selectedAgentId])

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center justify-between px-2 py-1.5">
          <SidebarMenu className="flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton className="data-[slot=sidebar-menu-button]:p-2.5!" render={<button type="button" />}>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
                  <CommandIcon className="size-4!" />
                </span>
                <span className="text-base font-semibold tracking-tight text-sidebar-foreground">ShipMyAgent</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {sidebarMode === "agent-detail" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                setNavDirection("back")
                onViewChange("globalAgents")
              }}
            >
              <ArrowLeftIcon className="size-4" />
              <span className="sr-only">返回 agent 列表</span>
            </Button>
          ) : null}
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
                    const isActive = agent.id === selectedAgentId
                    const isRunning = agent.running === true
                    return (
                      <SidebarMenuItem key={agent.id}>
                        <SidebarMenuButton
                          tooltip={agent.id}
                          isActive={isActive}
                          onClick={() => {
                            if (isRunning) {
                              setNavDirection("forward")
                              onAgentChange(agent.id)
                              return
                            }
                            setConfirmStartAgent(agent)
                          }}
                          className={cn(
                            "rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground",
                            !isRunning && "opacity-55",
                          )}
                        >
                          <span className="flex min-w-0 w-full items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <BotIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="truncate">{agent.name || "unknown-agent"}</span>
                            </span>
                            <span
                              className={`inline-flex h-2 w-2 shrink-0 rounded-full ${
                                isRunning ? "bg-emerald-500" : "bg-muted-foreground/60"
                              }`}
                            />
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
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<button type="button" disabled />}
                      className="opacity-70 data-[slot=sidebar-menu-button]:cursor-default"
                    >
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {selectedAgent?.name || "unknown-agent"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
              <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">Tasks</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
                          className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
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
                      className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
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
                                  className="rounded-lg text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground"
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
          </div>
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-3 py-2 text-xs text-muted-foreground">Console UI</div>
      </SidebarFooter>

      <Dialog
        open={Boolean(confirmStartAgent)}
        onOpenChange={(open) => {
          if (!open && !startingAgentId) {
            setConfirmStartAgent(null)
          }
        }}
      >
        <DialogContent className="w-[min(92vw,460px)]">
          <DialogHeader>
            <DialogTitle>启动 Agent</DialogTitle>
            <DialogDescription>
              {`Agent "${confirmStartAgent?.name || "unknown-agent"}" 当前未启动，是否现在启动？`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 px-4 pb-4">
            <Button
              variant="outline"
              onClick={() => setConfirmStartAgent(null)}
              disabled={Boolean(startingAgentId)}
            >
              取消
            </Button>
            <Button
              onClick={async () => {
                const target = confirmStartAgent
                if (!target) return
                try {
                  setStartingAgentId(target.id)
                  await Promise.resolve(onStartAgent(target.id))
                  setNavDirection("forward")
                  onAgentChange(target.id)
                } finally {
                  setStartingAgentId("")
                  setConfirmStartAgent(null)
                }
              }}
              disabled={Boolean(startingAgentId)}
            >
              {startingAgentId ? "启动中..." : "确认启动"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
