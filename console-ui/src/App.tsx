/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AgentOverviewStoppedSection } from "@/components/dashboard/AgentOverviewStoppedSection"
import { AuthorizationSection } from "@/components/dashboard/AuthorizationSection"
import { AgentCommandSection } from "@/components/dashboard/AgentCommandSection"
import { GlobalChannelAccountsSection } from "@/components/dashboard/GlobalChannelAccountsSection"
import { EnvSection } from "@/components/dashboard/EnvSection"
import { GlobalModelSection } from "@/components/dashboard/GlobalModelSection"
import { SessionOverviewSection } from "@/components/dashboard/SessionOverviewSection"
import { SessionWorkspaceSection } from "@/components/dashboard/SessionWorkspaceSection"
import { PluginsSection } from "@/components/dashboard/PluginsSection"
import { GlobalOverviewSection } from "@/components/dashboard/GlobalOverviewSection"
import { LogsSection } from "@/components/dashboard/LogsSection"
import { SkillsSection } from "@/components/dashboard/SkillsSection"
import { SummaryCards } from "@/components/dashboard/SummaryCards"
import { TasksSection } from "@/components/dashboard/TasksSection"
import { ToastMessage } from "@/components/dashboard/ToastMessage"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@downcity/ui"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useConsoleDashboard } from "@/hooks/useConsoleDashboard"
import { getDashboardViewLabel } from "@/lib/dashboard-navigation"
import { resolveSessionChannel } from "@/lib/context-groups"
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
    authorization,
    services,
    skills,
    plugins,
    chatChannels,
    sessions,
    selectedSessionId,
    channelHistory,
    sessionMessages,
    sessionArchives,
    selectedArchiveId,
    sessionArchiveMessages,
    tasks,
    logs,
    model,
    configStatus,
    modelProviders,
    modelPoolItems,
    channelAccounts,
    globalEnvItems,
    agentEnvItems,
    prompt,
    topbarStatus,
    topbarError,
    loading,
    sending,
    clearingSessionMessages,
    clearingChatHistory,
    deletingSessionId,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleSessionChange,
    refreshDashboard,
    refreshSkills,
    refreshSessionArchives,
    controlService,
    runPluginAction,
    runChatChannelAction,
    configureChatChannel,
    refreshAuthorization,
    saveAuthorizationConfig,
    runAuthorizationAction,
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
    clearSessionMessages,
    clearChatHistory,
    deleteChatSession,
    loadSessionArchiveMessages,
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
    pickAgentDirectory,
    inspectAgentDirectory,
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
    upsertGlobalEnv,
    removeGlobalEnv,
    importGlobalEnv,
    upsertAgentEnv,
    removeAgentEnv,
    importAgentEnv,
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

  const resolveChannelFromSessionId = React.useCallback((sessionIdInput?: string): string => {
    const sessionId = String(sessionIdInput || "").trim()
    if (!sessionId) return ""
    const target = sessions.find((item) => String(item.sessionId || "").trim() === sessionId)
    return resolveSessionChannel(target || sessionId)
  }, [sessions])

  const availableChatChannels = React.useMemo(() => {
    const channelSet = new Set<string>()
    for (const item of chatChannels) {
      const channel = String(item.channel || "").trim().toLowerCase()
      if (channel) channelSet.add(channel)
    }
    for (const item of sessions) {
      const channel = resolveSessionChannel(item)
      if (channel) channelSet.add(channel)
    }
    const preferredOrder = ["telegram", "qq", "feishu", "consoleui", "other"]
    const orderedKnown = preferredOrder.filter((channel) => channelSet.has(channel))
    const orderedExtra = [...channelSet]
      .filter((channel) => !preferredOrder.includes(channel))
      .sort((a, b) => a.localeCompare(b))
    return [...orderedKnown, ...orderedExtra]
  }, [chatChannels, sessions])
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
        sessionId?: string
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
        sessionId: options?.sessionId,
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
      parsed.sessionId &&
      (!hasAgentSegment || !parsedAgentId || parsedAgentId === selectedAgentId)
    ) {
      const routeChannel = String(parsed.channel || "").trim().toLowerCase()
      if (routeChannel) {
        setFocusedChatChannel(routeChannel)
      } else {
        setFocusedChatChannel(resolveChannelFromSessionId(parsed.sessionId))
      }
      void handleSessionChange(parsed.sessionId)
    }

    setRouteHydrated(true)
  }, [
    agents.length,
    handleSessionChange,
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
      if (parsed.view === "contextWorkspace" && parsed.sessionId && (!parsedAgentId || parsedAgentId === selectedAgentId)) {
        const routeChannel = String(parsed.channel || "").trim().toLowerCase()
        if (routeChannel) {
          setFocusedChatChannel(routeChannel)
        } else {
          setFocusedChatChannel(resolveChannelFromSessionId(parsed.sessionId))
        }
        void handleSessionChange(parsed.sessionId)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [handleSessionChange, handleAgentChange, resolveAgentIdByRouteSegment, selectedAgentId])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (!routeHydrated) return
    const agentScopedView = activeView !== "globalOverview" &&
      activeView !== "globalModel" &&
      activeView !== "globalChannelAccounts" &&
      activeView !== "globalCommand" &&
      activeView !== "globalAgents" &&
      activeView !== "globalPlugins"
    if (!agentScopedView || !selectedAgentId) return
    const expectedPath = toDashboardPath(activeView, {
      sessionId: activeView === "contextWorkspace" ? selectedSessionId : undefined,
      taskTitle: activeView === "agentTasks" ? selectedTaskTitle : undefined,
      channel: activeView === "contextOverview"
        ? effectiveFocusedChatChannel
        : activeView === "contextWorkspace"
          ? resolveChannelFromSessionId(selectedSessionId)
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
    resolveChannelFromSessionId,
    routeHydrated,
    selectedAgentId,
    selectedSessionId,
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
          sessions={sessions}
          channelAccounts={channelAccounts}
          consoleUiSessionId={constants.CONSOLEUI_SESSION_ID}
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
              onOpenSession={(sessionId) => {
                const normalizedSessionId = String(sessionId || "").trim()
                if (!normalizedSessionId) return
                navigateToView("contextWorkspace", {
                  sessionId: normalizedSessionId,
                  channel: resolveChannelFromSessionId(normalizedSessionId),
                })
                void handleSessionChange(normalizedSessionId)
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
              modelPoolItems={modelPoolItems}
              plugins={plugins}
              configStatus={configStatus}
              onPickAgentDirectory={() => pickAgentDirectory()}
              onInspectAgentDirectory={(projectRoot) => inspectAgentDirectory(projectRoot)}
              onStartAgent={(agentId) => startAgentFromHistory(agentId)}
              onStartAgentWithInitialization={(agentId, options) =>
                startAgentFromHistory(agentId, {
                  initializeIfNeeded: true,
                  initialization: {
                    projectRoot: agentId,
                    agentName: options.agentName,
                    primaryModelId: options.primaryModelId,
                  },
                })}
              onRestartAgent={(agentId) => restartAgentFromHistory(agentId)}
              onStopAgent={(agentId) => stopAgentFromHistory(agentId)}
            />
          </section>
        )
      case "globalEnv":
        {
          const envItems = [...globalEnvItems, ...agentEnvItems].sort((left, right) => {
            const scopeCompare = String(left.scope || "global").localeCompare(String(right.scope || "global"))
            if (scopeCompare !== 0) return scopeCompare
            const agentCompare = String(left.agentId || "").localeCompare(String(right.agentId || ""))
            if (agentCompare !== 0) return agentCompare
            return String(left.key || "").localeCompare(String(right.key || ""))
          })
        return (
          <section>
            <EnvSection
              title="Env"
              description="统一管理全局共享与 agent 私有 env，通过范围标签区分。"
              emptyText="暂无 env，点击右上角 + 新建。"
              items={envItems}
              loading={loading}
              writable
              agentOptions={agents.map((item) => ({
                id: item.id,
                name: String(item.name || item.id || "").trim() || item.id,
              }))}
              onUpsert={(input) => {
                if (input.scope === "agent") {
                  return upsertAgentEnv({
                    agentId: String(input.agentId || "").trim(),
                    key: input.key,
                    value: input.value,
                  })
                }
                return upsertGlobalEnv({
                  key: input.key,
                  value: input.value,
                })
              }}
              onRemove={(input) => {
                if (input.scope === "agent") {
                  return removeAgentEnv(String(input.agentId || "").trim(), input.key)
                }
                return removeGlobalEnv(input.key)
              }}
              onImport={(input) => {
                if (input.scope === "agent") {
                  return importAgentEnv(String(input.agentId || "").trim(), input.raw)
                }
                return importGlobalEnv(input.raw)
              }}
            />
          </section>
        )
      }
      case "agentOverview":
        return renderAgentOverviewSection()
      case "agentAuthorization":
        return (
          <section>
            <AuthorizationSection
              authorization={authorization}
              loading={loading}
              selectedAgent={selectedAgent}
              formatTime={uiHelpers.formatTime}
              onRefresh={() => refreshAuthorization(selectedAgentId)}
              onSaveConfig={(config) => saveAuthorizationConfig(config)}
              onRunAction={(input) => runAuthorizationAction(input)}
            />
          </section>
        )
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
              modelPoolItems={modelPoolItems}
              plugins={plugins}
              configStatus={configStatus}
              onPickAgentDirectory={() => pickAgentDirectory()}
              onInspectAgentDirectory={(projectRoot) => inspectAgentDirectory(projectRoot)}
              onStartAgent={(agentId) => startAgentFromHistory(agentId)}
              onStartAgentWithInitialization={(agentId, options) =>
                startAgentFromHistory(agentId, {
                  initializeIfNeeded: true,
                  initialization: {
                    projectRoot: agentId,
                    agentName: options.agentName,
                    primaryModelId: options.primaryModelId,
                  },
                })}
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
      case "globalPlugins":
        return (
          <section>
            <PluginsSection
              plugins={plugins}
              hasRunningAgent={selectedAgent?.running === true}
              selectedAgentName={String(selectedAgent?.name || "").trim()}
              formatTime={uiHelpers.formatTime}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              onRunAction={(name, action) => runPluginAction(name, action)}
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
            <SessionOverviewSection
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              chatChannels={chatChannels}
              channelAccounts={channelAccounts}
              focusedChannel={effectiveFocusedChatChannel}
              formatTime={uiHelpers.formatTime}
              onOpenSession={(sessionId) => {
                setFocusedChatChannel(resolveChannelFromSessionId(sessionId))
                navigateToView("contextWorkspace", {
                  sessionId: sessionId,
                  channel: resolveChannelFromSessionId(sessionId),
                })
                void handleSessionChange(sessionId)
              }}
              onDeleteSession={(sessionId) => {
                void deleteChatSession(sessionId)
              }}
              deletingSessionId={deletingSessionId}
              onChatAction={(action, channel) => void runChatChannelAction(action, channel)}
              onChatConfigure={(channel, config) => void configureChatChannel(channel, config)}
            />
          </section>
        )
      case "contextWorkspace":
        return (
          <section className="h-full min-h-0">
            <SessionWorkspaceSection
              selectedSessionId={selectedSessionId}
              sessions={sessions}
              channelHistory={channelHistory}
              chatChannels={chatChannels}
              sessionMessages={sessionMessages}
              sessionArchives={sessionArchives}
              selectedArchiveId={selectedArchiveId}
              sessionArchiveMessages={sessionArchiveMessages}
              prompt={prompt}
              chatInput={chatInput}
              debugPanelsCollapsed={debugPanelsCollapsed}
              sending={sending}
              clearingSessionMessages={clearingSessionMessages}
              clearingChatHistory={clearingChatHistory}
              deletingSession={Boolean(deletingSessionId)}
              formatTime={uiHelpers.formatTime}
              onChangeInput={setChatInput}
              onSendConsoleUiMessage={() => void sendConsoleUiMessage()}
              onClearSessionMessages={() => {
                if (!selectedSessionId) return
                void clearSessionMessages(selectedSessionId)
              }}
              onClearChatHistory={() => {
                if (!selectedSessionId) return
                void clearChatHistory(selectedSessionId)
              }}
              onDeleteSession={() => {
                if (!selectedSessionId) return
                void deleteChatSession(selectedSessionId)
              }}
              onRefreshArchives={() => {
                if (!selectedAgentId || !selectedSessionId) return
                void refreshSessionArchives(selectedAgentId, selectedSessionId)
              }}
              onSelectArchive={(archiveId) => {
                if (!selectedAgentId || !selectedSessionId) return
                void loadSessionArchiveMessages(
                  selectedAgentId,
                  selectedSessionId,
                  archiveId,
                )
              }}
              onSelectSession={(sessionId) => {
                navigateToView("contextWorkspace", {
                  sessionId,
                  channel: resolveChannelFromSessionId(sessionId),
                })
                void handleSessionChange(sessionId)
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
      className="size-8 rounded-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
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
          "--sidebar-width": "18.5rem",
          "--header-height": "3.5rem",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        activeView={activeView}
        agents={agents}
        selectedAgentId={selectedAgentId}
        routePathname={routePathname}
        routeAgentId={routeAgentId}
        sessions={sessions}
        chatChannels={chatChannels}
        selectedSessionId={selectedSessionId}
        tasks={tasks}
        selectedTaskTitle={selectedTaskTitle}
        selectedChatChannel={effectiveFocusedChatChannel}
        onViewChange={(view) => {
          if (view === "contextWorkspace") {
            const nextSessionId = selectedSessionId || constants.CONSOLEUI_SESSION_ID
            setFocusedChatChannel(resolveChannelFromSessionId(nextSessionId))
            navigateToView("contextWorkspace", {
              sessionId: nextSessionId,
              channel: resolveChannelFromSessionId(nextSessionId),
            })
            void handleSessionChange(nextSessionId)
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
        onSessionOpen={(sessionId) => {
          setFocusedChatChannel(resolveChannelFromSessionId(sessionId))
          navigateToView("contextWorkspace", {
            sessionId: sessionId,
            channel: resolveChannelFromSessionId(sessionId),
          })
          void handleSessionChange(sessionId)
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
            "mainview-shell flex flex-1 min-h-0 flex-col bg-transparent",
            activeView === "contextWorkspace"
              ? "gap-0 overflow-hidden px-3 pb-3 pt-1 md:px-4 md:pb-4 md:pt-1"
              : "gap-4 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-1 md:px-4 md:pb-4 md:pt-1",
          )}
        >
          {renderActiveView()}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
