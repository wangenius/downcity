/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AgentOverviewStoppedSection } from "@/components/dashboard/AgentOverviewStoppedSection"
import { AgentCommandSection } from "@/components/dashboard/AgentCommandSection"
import { GlobalChannelAccountsSection } from "@/components/dashboard/GlobalChannelAccountsSection"
import { GlobalModelSection } from "@/components/dashboard/GlobalModelSection"
import { ContextOverviewSection } from "@/components/dashboard/ContextOverviewSection"
import { ContextWorkspaceSection } from "@/components/dashboard/ContextWorkspaceSection"
import { ExtensionsSection } from "@/components/dashboard/ExtensionsSection"
import { GlobalOverviewSection } from "@/components/dashboard/GlobalOverviewSection"
import { LogsSection } from "@/components/dashboard/LogsSection"
import { SkillsSection } from "@/components/dashboard/SkillsSection"
import { SummaryCards } from "@/components/dashboard/SummaryCards"
import { TasksSection } from "@/components/dashboard/TasksSection"
import { ToastMessage } from "@/components/dashboard/ToastMessage"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useConsoleDashboard } from "@/hooks/useConsoleDashboard"
import { getDashboardViewLabel } from "@/lib/dashboard-navigation"
import { resolveContextChannel } from "@/lib/context-groups"
import { parseDashboardPath, toAgentRouteSegment, toDashboardPath } from "@/lib/dashboard-route"
import { cn } from "@/lib/utils"
import type { DashboardView } from "@/types/Navigation"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const DEBUG_PANELS_COLLAPSED_STORAGE_KEY = "city.console-ui.context.debug-panels-collapsed"

export function App() {
  const [routePathname, setRoutePathname] = React.useState<string>(() => {
    if (typeof window === "undefined") return "/global/overview"
    return window.location.pathname
  })
  const [activeView, setActiveView] = React.useState<DashboardView>(() => {
    if (typeof window === "undefined") return "globalOverview"
    return parseDashboardPath(window.location.pathname).view
  })
  const [routeHydrated, setRouteHydrated] = React.useState(false)
  const [selectedTaskTitle, setSelectedTaskTitle] = React.useState<string>(() => {
    if (typeof window === "undefined") return ""
    return String(parseDashboardPath(window.location.pathname).taskTitle || "").trim()
  })
  const [focusedChatChannel, setFocusedChatChannel] = React.useState<string>("")
  const [debugPanelsCollapsed, setDebugPanelsCollapsed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem(DEBUG_PANELS_COLLAPSED_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  })

  const {
    agents,
    cityVersion,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    skills,
    extensions,
    chatChannels,
    contexts,
    selectedContextId,
    channelHistory,
    contextMessages,
    contextArchives,
    selectedArchiveId,
    contextArchiveMessages,
    tasks,
    logs,
    model,
    configStatus,
    modelProviders,
    modelPoolItems,
    channelAccounts,
    prompt,
    topbarStatus,
    topbarError,
    loading,
    sending,
    clearingContextMessages,
    clearingChatHistory,
    deletingContextId,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleContextChange,
    refreshDashboard,
    refreshSkills,
    refreshContextArchives,
    controlService,
    controlExtension,
    testExtension,
    runChatChannelAction,
    configureChatChannel,
    runSkillFind,
    runSkillInstall,
    runTask,
    setTaskStatus,
    deleteTask,
    loadTaskRuns,
    deleteTaskRun,
    clearTaskRuns,
    loadTaskRunDetail,
    sendConsoleUiMessage,
    clearContextMessages,
    clearChatHistory,
    deleteChatContext,
    loadContextArchiveMessages,
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
    restartAgentFromHistory,
    stopAgentFromHistory,
    upsertModelProvider,
    removeModelProvider,
    testModelProvider,
    discoverModelProvider,
    upsertModelPoolItem,
    removeModelPoolItem,
    setModelPoolItemPaused,
    testModelPoolItem,
    upsertChannelAccount,
    probeChannelAccount,
    removeChannelAccount,
    executeAgentCommand,
    constants,
    uiHelpers,
  } = useConsoleDashboard()

  const resolveAgentRouteSegment = React.useCallback(
    (agentIdInput?: string): string => {
      const agentId = String(agentIdInput || "").trim()
      if (agentId) {
        const target = agents.find((agent) => agent.id === agentId)
        if (target) return toAgentRouteSegment(target.name || target.id)
      }
      if (selectedAgent) return toAgentRouteSegment(selectedAgent.name || selectedAgent.id)
      if (selectedAgentId) return toAgentRouteSegment(selectedAgentId)
      return "agent"
    },
    [agents, selectedAgent, selectedAgentId],
  )

  const resolveChannelFromContextId = React.useCallback((contextIdInput?: string): string => {
    const contextId = String(contextIdInput || "").trim()
    if (!contextId) return ""
    const target = contexts.find((item) => String(item.contextId || "").trim() === contextId)
    return resolveContextChannel(target || contextId)
  }, [contexts])

  const availableChatChannels = React.useMemo(() => {
    const channelSet = new Set<string>()
    for (const item of chatChannels) {
      const channel = String(item.channel || "").trim().toLowerCase()
      if (channel) channelSet.add(channel)
    }
    for (const item of contexts) {
      const channel = resolveContextChannel(item)
      if (channel) channelSet.add(channel)
    }
    const preferredOrder = ["telegram", "qq", "feishu", "consoleui", "other"]
    const orderedKnown = preferredOrder.filter((channel) => channelSet.has(channel))
    const orderedExtra = [...channelSet]
      .filter((channel) => !preferredOrder.includes(channel))
      .sort((a, b) => a.localeCompare(b))
    return [...orderedKnown, ...orderedExtra]
  }, [chatChannels, contexts])
  const effectiveFocusedChatChannel = React.useMemo(() => {
    const normalized = String(focusedChatChannel || "").trim().toLowerCase()
    if (normalized && availableChatChannels.includes(normalized)) return normalized
    return String(availableChatChannels[0] || "").trim().toLowerCase()
  }, [availableChatChannels, focusedChatChannel])

  const resolveAgentIdByRouteSegment = React.useCallback(
    (segmentInput?: string): string => {
      const segment = toAgentRouteSegment(String(segmentInput || ""))
      if (!segment) return ""
      const matched = agents.find((agent) => {
        const byName = toAgentRouteSegment(String(agent.name || ""))
        const byId = toAgentRouteSegment(String(agent.id || ""))
        return segment === byName || segment === byId
      })
      return String(matched?.id || "")
    },
    [agents],
  )

  const navigateToView = React.useCallback(
    (
      view: DashboardView,
      options?: {
        contextId?: string
        taskTitle?: string
        agentId?: string
        channel?: string
        replace?: boolean
      },
    ) => {
      if (typeof window === "undefined") return
      const hasExplicitAgentForGlobalOverview =
        view === "globalOverview" && Boolean(String(options?.agentId || "").trim())
      const nextPath = toDashboardPath(view, {
        contextId: options?.contextId,
        taskTitle: options?.taskTitle,
        channel: options?.channel,
        agentSegment: hasExplicitAgentForGlobalOverview || view !== "globalOverview"
          ? resolveAgentRouteSegment(options?.agentId)
          : undefined,
      })
      if (window.location.pathname !== nextPath) {
        if (options?.replace) {
          window.history.replaceState({}, "", nextPath)
        } else {
          window.history.pushState({}, "", nextPath)
        }
      }
      setRoutePathname(nextPath)
      setActiveView(view)
      if (view === "agentTasks") {
        setSelectedTaskTitle(String(options?.taskTitle || "").trim())
      } else if (view !== "contextWorkspace") {
        setSelectedTaskTitle("")
      }
    },
    [resolveAgentRouteSegment],
  )

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (routeHydrated) return

    const parsed = parseDashboardPath(window.location.pathname)
    setRoutePathname(window.location.pathname)
    setActiveView(parsed.view)
    setSelectedTaskTitle(String(parsed.taskTitle || "").trim())
    setFocusedChatChannel(String(parsed.channel || "").trim().toLowerCase())

    const hasAgentSegment = Boolean(String(parsed.agentSegment || "").trim())
    if (hasAgentSegment && agents.length === 0) {
      return
    }

    const parsedAgentId = resolveAgentIdByRouteSegment(parsed.agentSegment)
    if (hasAgentSegment && parsedAgentId && parsedAgentId !== selectedAgentId) {
      handleAgentChange(parsedAgentId)
      return
    }

    if (
      parsed.view === "contextWorkspace" &&
      parsed.contextId &&
      (!hasAgentSegment || !parsedAgentId || parsedAgentId === selectedAgentId)
    ) {
      const routeChannel = String(parsed.channel || "").trim().toLowerCase()
      if (routeChannel) {
        setFocusedChatChannel(routeChannel)
      } else {
        setFocusedChatChannel(resolveChannelFromContextId(parsed.contextId))
      }
      void handleContextChange(parsed.contextId)
    }

    setRouteHydrated(true)
  }, [
    agents.length,
    handleContextChange,
    handleAgentChange,
    resolveAgentIdByRouteSegment,
    routeHydrated,
    selectedAgentId,
  ])

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined
    const onPopState = () => {
      const parsed = parseDashboardPath(window.location.pathname)
      setRoutePathname(window.location.pathname)
      setActiveView(parsed.view)
      setSelectedTaskTitle(String(parsed.taskTitle || "").trim())
      setFocusedChatChannel(String(parsed.channel || "").trim().toLowerCase())
      const parsedAgentId = resolveAgentIdByRouteSegment(parsed.agentSegment)
      if (parsedAgentId && parsedAgentId !== selectedAgentId) {
        handleAgentChange(parsedAgentId)
      }
      if (parsed.view === "contextWorkspace" && parsed.contextId && (!parsedAgentId || parsedAgentId === selectedAgentId)) {
        const routeChannel = String(parsed.channel || "").trim().toLowerCase()
        if (routeChannel) {
          setFocusedChatChannel(routeChannel)
        } else {
          setFocusedChatChannel(resolveChannelFromContextId(parsed.contextId))
        }
        void handleContextChange(parsed.contextId)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [handleContextChange, handleAgentChange, resolveAgentIdByRouteSegment, selectedAgentId])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!routeHydrated) return
    const agentScopedView = activeView !== "globalOverview" &&
      activeView !== "globalModel" &&
      activeView !== "globalChannelAccounts" &&
      activeView !== "globalCommand" &&
      activeView !== "globalAgents" &&
      activeView !== "globalExtensions"
    if (!agentScopedView || !selectedAgentId) return
    const expectedPath = toDashboardPath(activeView, {
      contextId: activeView === "contextWorkspace" ? selectedContextId : undefined,
      taskTitle: activeView === "agentTasks" ? selectedTaskTitle : undefined,
      channel: activeView === "contextOverview"
        ? effectiveFocusedChatChannel
        : activeView === "contextWorkspace"
          ? resolveChannelFromContextId(selectedContextId)
          : undefined,
      agentSegment: resolveAgentRouteSegment(selectedAgentId),
    })
    if (window.location.pathname !== expectedPath) {
      window.history.replaceState({}, "", expectedPath)
    }
  }, [
    activeView,
    effectiveFocusedChatChannel,
    resolveAgentRouteSegment,
    resolveChannelFromContextId,
    routeHydrated,
    selectedAgentId,
    selectedContextId,
    selectedTaskTitle,
  ])

  React.useEffect(() => {
    if (activeView !== "agentTasks") return
    if (!selectedTaskTitle) return
    const exists = tasks.some((item) => String(item.title || "").trim() === selectedTaskTitle)
    if (!exists) {
      setSelectedTaskTitle("")
    }
  }, [activeView, selectedTaskTitle, tasks])

  React.useEffect(() => {
    if (!routeHydrated) return
    if (activeView === "agentServices") {
      navigateToView("agentOverview", { replace: true })
      return
    }
    if (activeView === "agentCommand") {
      navigateToView("globalCommand", { replace: true })
      return
    }
    if (activeView === "agentTasks" && !selectedTaskTitle) {
      navigateToView("agentOverview", { replace: true })
      return
    }
  }, [activeView, navigateToView, routeHydrated, selectedTaskTitle])

  React.useEffect(() => {
    setFocusedChatChannel("")
  }, [selectedAgentId])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    try {
      // 关键点（中文）：折叠偏好是纯 UI 状态，使用本地存储即可跨刷新保留。
      window.localStorage.setItem(DEBUG_PANELS_COLLAPSED_STORAGE_KEY, debugPanelsCollapsed ? "1" : "0")
    } catch {
      // 忽略存储异常（隐私模式或禁用存储）。
    }
  }, [debugPanelsCollapsed])

  React.useEffect(() => {
    if (activeView !== "contextOverview") return
    const normalized = String(focusedChatChannel || "").trim().toLowerCase()
    const hasFocused = Boolean(normalized) && availableChatChannels.includes(normalized)
    if (hasFocused) return
    const fallback = String(availableChatChannels[0] || "").trim().toLowerCase()
    if (!fallback) return
    setFocusedChatChannel(fallback)
  }, [activeView, availableChatChannels, focusedChatChannel])

  const hasGlobalAgentRoute = React.useMemo(() => {
    if (activeView !== "globalOverview") return false
    return Boolean(String(parseDashboardPath(routePathname).agentSegment || "").trim())
  }, [activeView, routePathname])
  const parsedRoute = React.useMemo(() => parseDashboardPath(routePathname), [routePathname])
  const routeAgentId = React.useMemo(() => {
    return resolveAgentIdByRouteSegment(parsedRoute.agentSegment)
  }, [parsedRoute.agentSegment, resolveAgentIdByRouteSegment])

  React.useEffect(() => {
    const hasAgentSegment = Boolean(String(parsedRoute.agentSegment || "").trim())
    if (hasAgentSegment) return
    if (!selectedAgentId) return
    handleAgentChange("")
  }, [handleAgentChange, parsedRoute.agentSegment, selectedAgentId])

  const renderAgentOverviewSection = () => (
    selectedAgent && selectedAgent.running === false ? (
      <section>
        <AgentOverviewStoppedSection
          agent={selectedAgent}
          onStart={(agentId) => startAgentFromHistory(agentId)}
        />
      </section>
    ) : (
      <section className="space-y-6">
        <SummaryCards
          selectedAgent={selectedAgent}
          overview={overview}
          services={services}
          skills={skills}
          tasks={tasks}
          contexts={contexts}
          consoleUiContextId={constants.CONSOLEUI_CONTEXT_ID}
          configStatus={configStatus}
          model={model}
          onSwitchModel={(primaryModelId) => void switchModel(primaryModelId)}
          onStartAgent={async () => {
            if (!selectedAgentId) return
            await startAgentFromHistory(selectedAgentId)
          }}
          onRestartAgent={async () => {
            if (!selectedAgentId) return
            await restartAgentFromHistory(selectedAgentId)
          }}
          onStopAgent={async () => {
            if (!selectedAgentId) return
            await stopAgentFromHistory(selectedAgentId)
          }}
          onOpenTask={(taskTitle) => {
            const normalizedTaskTitle = String(taskTitle || "").trim()
            if (!normalizedTaskTitle) return
            setSelectedTaskTitle(normalizedTaskTitle)
            navigateToView("agentTasks", { taskTitle: normalizedTaskTitle })
          }}
              onOpenContext={(contextId) => {
                const normalizedContextId = String(contextId || "").trim()
                if (!normalizedContextId) return
                navigateToView("contextWorkspace", {
                  contextId: normalizedContextId,
                  channel: resolveChannelFromContextId(normalizedContextId),
                })
                void handleContextChange(normalizedContextId)
              }}
          onControlService={(serviceName, action) => controlService(serviceName, action)}
          chatChannels={chatChannels}
          onChatAction={(action, channel) => runChatChannelAction(action, channel)}
        />
      </section>
    )
  )

  const renderActiveView = () => {
    switch (activeView) {
      case "globalOverview":
        if (hasGlobalAgentRoute) {
          return renderAgentOverviewSection()
        }
        return (
          <section>
            <GlobalOverviewSection
              cityVersion={cityVersion}
              agents={agents}
              extensions={extensions}
              configStatus={configStatus}
              onStartAgent={(agentId) => startAgentFromHistory(agentId)}
              onRestartAgent={(agentId) => restartAgentFromHistory(agentId)}
              onStopAgent={(agentId) => stopAgentFromHistory(agentId)}
            />
          </section>
        )
      case "agentOverview":
        return renderAgentOverviewSection()
      case "agentCommand":
        return (
          <section className="flex min-h-0 flex-1">
            <AgentCommandSection
              selectedAgentId={selectedAgentId}
              selectedAgentName={String(selectedAgent?.name || "").trim() || "agent"}
              agents={agents}
              persistSelectionInUrl={false}
              onExecute={(input) => executeAgentCommand(input)}
            />
          </section>
        )
      case "globalAgents":
        return (
          <section>
            <GlobalOverviewSection
              cityVersion={cityVersion}
              agents={agents}
              extensions={extensions}
              configStatus={configStatus}
              onStartAgent={(agentId) => startAgentFromHistory(agentId)}
              onRestartAgent={(agentId) => restartAgentFromHistory(agentId)}
              onStopAgent={(agentId) => stopAgentFromHistory(agentId)}
            />
          </section>
        )
      case "globalModel":
        return (
          <section>
            <GlobalModelSection
              model={model}
              providers={modelProviders}
              poolItems={modelPoolItems}
              loading={loading}
              onUpsertProvider={(input) => void upsertModelProvider(input)}
              onRemoveProvider={(providerId) => void removeModelProvider(providerId)}
              onTestProvider={(providerId) => void testModelProvider(providerId)}
              onDiscoverProvider={(params) => discoverModelProvider(params)}
              onUpsertModel={(input) => upsertModelPoolItem(input)}
              onRemoveModel={(modelId) => void removeModelPoolItem(modelId)}
              onPauseModel={(modelId, isPaused) => void setModelPoolItemPaused(modelId, isPaused)}
              onTestModel={(modelId, prompt) => void testModelPoolItem(modelId, prompt)}
            />
          </section>
        )
      case "globalChannelAccounts":
        return (
          <section>
            <GlobalChannelAccountsSection
              items={channelAccounts}
              loading={loading}
              onUpsert={(input) => upsertChannelAccount(input)}
              onProbe={(input) => probeChannelAccount(input)}
              onRemove={(id) => removeChannelAccount(id)}
            />
          </section>
        )
      case "globalCommand":
        return (
          <section className="flex min-h-0 flex-1">
            <AgentCommandSection
              selectedAgentId={selectedAgentId}
              selectedAgentName={String(selectedAgent?.name || "").trim() || "agent"}
              agents={agents}
              persistSelectionInUrl
              onExecute={(input) => executeAgentCommand(input)}
            />
          </section>
        )
      case "globalExtensions":
        return (
          <section>
            <ExtensionsSection
              extensions={extensions}
              formatTime={uiHelpers.formatTime}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              onControl={(name, action) => void controlExtension(name, action)}
              onTest={(name) => void testExtension(name)}
            />
          </section>
        )
      case "agentSkills":
        return (
          <section>
            <SkillsSection
              skills={skills}
              loading={loading}
              selectedAgentId={selectedAgentId}
              onRefreshSkills={() => refreshSkills(selectedAgentId)}
              onFindSkill={(query) => runSkillFind(query)}
              onInstallSkill={(input) => runSkillInstall(input)}
            />
          </section>
        )
      case "agentTasks":
        return (
          <section>
            <TasksSection
              tasks={tasks}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              formatTime={uiHelpers.formatTime}
              onRunTask={(title) => void runTask(title)}
              onSetTaskStatus={(title, status) => setTaskStatus(title, status)}
              onDeleteTask={(title) => deleteTask(title)}
              onLoadTaskRuns={(title, limit) => loadTaskRuns(title, limit)}
              onDeleteTaskRun={(title, timestamp) => deleteTaskRun(title, timestamp)}
              onClearTaskRuns={(title) => clearTaskRuns(title)}
              onLoadTaskRunDetail={(title, timestamp) => loadTaskRunDetail(title, timestamp)}
              selectedTaskTitle={selectedTaskTitle}
              onSelectTaskTitle={(taskTitle) => {
                const normalizedTaskTitle = String(taskTitle || "").trim()
                setSelectedTaskTitle(normalizedTaskTitle)
                navigateToView("agentTasks", normalizedTaskTitle ? { taskTitle: normalizedTaskTitle } : undefined)
              }}
            />
          </section>
        )
      case "agentLogs":
        return (
          <section>
            <LogsSection logs={logs} formatTime={uiHelpers.formatTime} />
          </section>
        )
      case "contextOverview":
        return (
          <section>
            <ContextOverviewSection
              contexts={contexts}
              selectedContextId={selectedContextId}
              chatChannels={chatChannels}
              channelAccounts={channelAccounts}
              focusedChannel={effectiveFocusedChatChannel}
              formatTime={uiHelpers.formatTime}
              onOpenContext={(contextId) => {
                setFocusedChatChannel(resolveChannelFromContextId(contextId))
                navigateToView("contextWorkspace", {
                  contextId,
                  channel: resolveChannelFromContextId(contextId),
                })
                void handleContextChange(contextId)
              }}
              onDeleteContext={(contextId) => {
                void deleteChatContext(contextId)
              }}
              deletingContextId={deletingContextId}
              onChatAction={(action, channel) => void runChatChannelAction(action, channel)}
              onChatConfigure={(channel, config) => void configureChatChannel(channel, config)}
            />
          </section>
        )
      case "contextWorkspace":
        return (
          <section className="h-full min-h-0">
            <ContextWorkspaceSection
              selectedContextId={selectedContextId}
              contexts={contexts}
              channelHistory={channelHistory}
              chatChannels={chatChannels}
              contextMessages={contextMessages}
              contextArchives={contextArchives}
              selectedArchiveId={selectedArchiveId}
              contextArchiveMessages={contextArchiveMessages}
              prompt={prompt}
              chatInput={chatInput}
              debugPanelsCollapsed={debugPanelsCollapsed}
              sending={sending}
              clearingContextMessages={clearingContextMessages}
              clearingChatHistory={clearingChatHistory}
              deletingContext={Boolean(deletingContextId)}
              formatTime={uiHelpers.formatTime}
              onChangeInput={setChatInput}
              onSendConsoleUiMessage={() => void sendConsoleUiMessage()}
              onClearContextMessages={() => {
                if (!selectedContextId) return
                void clearContextMessages(selectedContextId)
              }}
              onClearChatHistory={() => {
                if (!selectedContextId) return
                void clearChatHistory(selectedContextId)
              }}
              onDeleteContext={() => {
                if (!selectedContextId) return
                void deleteChatContext(selectedContextId)
              }}
              onRefreshArchives={() => {
                if (!selectedAgentId || !selectedContextId) return
                void refreshContextArchives(selectedAgentId, selectedContextId)
              }}
              onSelectArchive={(archiveId) => {
                if (!selectedAgentId || !selectedContextId) return
                void loadContextArchiveMessages(
                  selectedAgentId,
                  selectedContextId,
                  archiveId,
                )
              }}
              onSelectContext={(contextId) => {
                navigateToView("contextWorkspace", {
                  contextId,
                  channel: resolveChannelFromContextId(contextId),
                })
                void handleContextChange(contextId)
              }}
            />
          </section>
        )
      default:
        return null
    }
  }

  const headerRightActions = activeView === "contextWorkspace" ? (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 rounded-md text-muted-foreground hover:text-foreground"
      onClick={() => {
        // 关键点（中文）：在顶部 header 提供统一入口，不打断聊天区和右侧面板内部结构。
        setDebugPanelsCollapsed((prev) => !prev)
      }}
      aria-label={debugPanelsCollapsed ? "展开 Debug Panels" : "折叠 Debug Panels"}
      title={debugPanelsCollapsed ? "展开 Debug Panels" : "折叠 Debug Panels"}
    >
      {debugPanelsCollapsed ? <ChevronLeftIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
    </Button>
  ) : null

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "18rem",
          "--header-height": "3.25rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        activeView={activeView}
        agents={agents}
        selectedAgentId={selectedAgentId}
        routePathname={routePathname}
        routeAgentId={routeAgentId}
        contexts={contexts}
        chatChannels={chatChannels}
        selectedContextId={selectedContextId}
        tasks={tasks}
        selectedTaskTitle={selectedTaskTitle}
        selectedChatChannel={effectiveFocusedChatChannel}
        onViewChange={(view) => {
          if (view === "contextWorkspace") {
            const nextContextId = selectedContextId || constants.CONSOLEUI_CONTEXT_ID
            setFocusedChatChannel(resolveChannelFromContextId(nextContextId))
            navigateToView("contextWorkspace", {
              contextId: nextContextId,
              channel: resolveChannelFromContextId(nextContextId),
            })
            void handleContextChange(nextContextId)
            return
          }
          if (view !== "contextOverview") {
            setFocusedChatChannel("")
          }
          navigateToView(view)
        }}
        onAgentChange={(agentId) => {
          handleAgentChange(agentId)
          setFocusedChatChannel("")
          navigateToView("globalOverview", { agentId })
        }}
        onAgentEnter={(agentId) => {
          handleAgentChange(agentId)
          setFocusedChatChannel("")
          navigateToView("agentOverview", { agentId })
        }}
        onTaskOpen={(taskTitle) => {
          setFocusedChatChannel("")
          setSelectedTaskTitle(taskTitle)
          navigateToView("agentTasks", { taskTitle })
        }}
        onChannelOpen={(channel) => {
          const normalizedChannel = String(channel || "").trim().toLowerCase()
          setFocusedChatChannel(normalizedChannel)
          navigateToView("contextOverview", { channel: normalizedChannel })
        }}
        onContextOpen={(contextId) => {
          setFocusedChatChannel(resolveChannelFromContextId(contextId))
          navigateToView("contextWorkspace", {
            contextId,
            channel: resolveChannelFromContextId(contextId),
          })
          void handleContextChange(contextId)
        }}
        topbarStatus={topbarStatus}
        topbarError={topbarError}
        loading={loading}
        onRefresh={() => void refreshDashboard()}
        variant="sidebar"
      />
      <SidebarInset>
        <SiteHeader viewLabel={getDashboardViewLabel(activeView)} rightActions={headerRightActions} />

        <main
          className={cn(
            "mainview-shell flex flex-1 min-h-0 flex-col bg-background",
            activeView === "contextWorkspace"
              ? "gap-0 overflow-hidden px-0 py-0 md:px-0 md:py-0"
              : "gap-4 overflow-y-auto overflow-x-hidden px-3 py-2 md:px-4 md:py-3",
          )}
        >
          {renderActiveView()}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
