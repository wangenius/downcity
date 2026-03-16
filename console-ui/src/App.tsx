/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AgentModelBindingSection } from "@/components/dashboard/AgentModelBindingSection"
import { AgentOverviewStoppedSection } from "@/components/dashboard/AgentOverviewStoppedSection"
import { GlobalModelSection } from "@/components/dashboard/GlobalModelSection"
import { ContextOverviewSection } from "@/components/dashboard/ContextOverviewSection"
import { ContextWorkspaceSection } from "@/components/dashboard/ContextWorkspaceSection"
import { ExtensionsSection } from "@/components/dashboard/ExtensionsSection"
import { GlobalOverviewSection } from "@/components/dashboard/GlobalOverviewSection"
import { LogsSection } from "@/components/dashboard/LogsSection"
import { ServicesSection } from "@/components/dashboard/ServicesSection"
import { SummaryCards } from "@/components/dashboard/SummaryCards"
import { TasksSection } from "@/components/dashboard/TasksSection"
import { ToastMessage } from "@/components/dashboard/ToastMessage"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useConsoleDashboard } from "@/hooks/useConsoleDashboard"
import { getDashboardViewLabel } from "@/lib/dashboard-navigation"
import { parseDashboardPath, toAgentRouteSegment, toDashboardPath } from "@/lib/dashboard-route"
import type { DashboardView } from "@/types/Navigation"

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

  const {
    agents,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    extensions,
    chatChannels,
    contexts,
    selectedContextId,
    channelHistory,
    contextMessages,
    tasks,
    logs,
    model,
    configStatus,
    modelProviders,
    modelPoolItems,
    prompt,
    topbarStatus,
    topbarError,
    loading,
    sending,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleContextChange,
    refreshDashboard,
    refreshChatChannels,
    refreshModel,
    refreshModelPool,
    refreshPrompt,
    controlService,
    controlExtension,
    testExtension,
    runChatChannelAction,
    configureChatChannel,
    runTask,
    loadTaskRuns,
    loadTaskRunDetail,
    sendLocalMessage,
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
        replace?: boolean
      },
    ) => {
      if (typeof window === "undefined") return
      const hasExplicitAgentForGlobalOverview =
        view === "globalOverview" && Boolean(String(options?.agentId || "").trim())
      const nextPath = toDashboardPath(view, {
        contextId: options?.contextId,
        taskTitle: options?.taskTitle,
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
      const parsedAgentId = resolveAgentIdByRouteSegment(parsed.agentSegment)
      if (parsedAgentId && parsedAgentId !== selectedAgentId) {
        handleAgentChange(parsedAgentId)
      }
      if (parsed.view === "contextWorkspace" && parsed.contextId && (!parsedAgentId || parsedAgentId === selectedAgentId)) {
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
      activeView !== "globalAgents" &&
      activeView !== "globalExtensions"
    if (!agentScopedView || !selectedAgentId) return
    const expectedPath = toDashboardPath(activeView, {
      contextId: activeView === "contextWorkspace" ? selectedContextId : undefined,
      taskTitle: activeView === "agentTasks" ? selectedTaskTitle : undefined,
      agentSegment: resolveAgentRouteSegment(selectedAgentId),
    })
    if (window.location.pathname !== expectedPath) {
      window.history.replaceState({}, "", expectedPath)
    }
  }, [activeView, resolveAgentRouteSegment, routeHydrated, selectedAgentId, selectedContextId, selectedTaskTitle])

  React.useEffect(() => {
    if (activeView !== "agentTasks") return
    if (!selectedTaskTitle) return
    const exists = tasks.some((item) => String(item.title || "").trim() === selectedTaskTitle)
    if (!exists) {
      setSelectedTaskTitle("")
    }
  }, [activeView, selectedTaskTitle, tasks])

  const hasGlobalAgentRoute = React.useMemo(() => {
    if (activeView !== "globalOverview") return false
    return Boolean(String(parseDashboardPath(routePathname).agentSegment || "").trim())
  }, [activeView, routePathname])
  const routeAgentId = React.useMemo(() => {
    const parsed = parseDashboardPath(routePathname)
    return resolveAgentIdByRouteSegment(parsed.agentSegment)
  }, [resolveAgentIdByRouteSegment, routePathname])

  const renderAgentOverviewSection = () => (
    selectedAgent && selectedAgent.running === false ? (
      <section>
        <AgentOverviewStoppedSection
          agent={selectedAgent}
          onStart={(agentId) => {
            void startAgentFromHistory(agentId)
          }}
        />
      </section>
    ) : (
      <section className="space-y-6">
        <SummaryCards
          selectedAgent={selectedAgent}
          overview={overview}
          services={services}
          localUiContextId={constants.LOCAL_UI_CONTEXT_ID}
          configStatus={configStatus}
        />
        <AgentModelBindingSection
          selectedAgent={selectedAgent}
          model={model}
          loading={loading}
          onRefresh={() => void refreshModel(selectedAgentId)}
          onSwitchModel={(primaryModelId) => void switchModel(primaryModelId)}
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
              topbarStatus={topbarStatus}
              topbarError={topbarError}
              hasPrompt={Boolean(prompt)}
              agents={agents}
              extensions={extensions}
              configStatus={configStatus}
              onRefresh={() => void refreshDashboard()}
              onStartAgent={(agentId) => {
                void startAgentFromHistory(agentId)
              }}
              onRestartAgent={(agentId) => {
                void restartAgentFromHistory(agentId)
              }}
              onStopAgent={(agentId) => {
                void stopAgentFromHistory(agentId)
              }}
            />
          </section>
        )
      case "agentOverview":
        return renderAgentOverviewSection()
      case "agentServices":
        return (
          <section>
            <ServicesSection
              services={services}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              onControlService={(name, action) => void controlService(name, action)}
            />
          </section>
        )
      case "globalAgents":
        return (
          <section>
            <GlobalOverviewSection
              topbarStatus={topbarStatus}
              topbarError={topbarError}
              hasPrompt={Boolean(prompt)}
              agents={agents}
              extensions={extensions}
              configStatus={configStatus}
              onRefresh={() => void refreshDashboard()}
              onStartAgent={(agentId) => {
                void startAgentFromHistory(agentId)
              }}
              onRestartAgent={(agentId) => {
                void restartAgentFromHistory(agentId)
              }}
              onStopAgent={(agentId) => {
                void stopAgentFromHistory(agentId)
              }}
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
              onRefresh={() => void refreshModel(selectedAgentId)}
              onRefreshPool={() => void refreshModelPool()}
              onUpsertProvider={(input) => void upsertModelProvider(input)}
              onRemoveProvider={(providerId) => void removeModelProvider(providerId)}
              onTestProvider={(providerId) => void testModelProvider(providerId)}
              onDiscoverProvider={(params) => void discoverModelProvider(params)}
              onUpsertModel={(input) => void upsertModelPoolItem(input)}
              onRemoveModel={(modelId) => void removeModelPoolItem(modelId)}
              onPauseModel={(modelId, isPaused) => void setModelPoolItemPaused(modelId, isPaused)}
              onTestModel={(modelId, prompt) => void testModelPoolItem(modelId, prompt)}
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
              onRefresh={() => void refreshDashboard()}
              onControl={(name, action) => void controlExtension(name, action)}
              onTest={(name) => void testExtension(name)}
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
              onLoadTaskRuns={(title, limit) => loadTaskRuns(title, limit)}
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
              formatTime={uiHelpers.formatTime}
              onOpenContext={(contextId) => {
                navigateToView("contextWorkspace", { contextId })
                void handleContextChange(contextId)
              }}
              onRefreshChannels={() => void refreshChatChannels(selectedAgentId)}
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
              prompt={prompt}
              chatInput={chatInput}
              sending={sending}
              formatTime={uiHelpers.formatTime}
              onChangeInput={setChatInput}
              onSendLocalMessage={() => void sendLocalMessage()}
              onRefreshPrompt={() =>
                void refreshPrompt(selectedAgentId, selectedContextId || constants.LOCAL_UI_CONTEXT_ID)
              }
              onSelectContext={(contextId) => {
                navigateToView("contextWorkspace", { contextId })
                void handleContextChange(contextId)
              }}
            />
          </section>
        )
      default:
        return null
    }
  }

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
        selectedContextId={selectedContextId}
        tasks={tasks}
        selectedTaskTitle={selectedTaskTitle}
        onViewChange={(view) => {
          if (view === "contextWorkspace") {
            const nextContextId = selectedContextId || constants.LOCAL_UI_CONTEXT_ID
            navigateToView("contextWorkspace", { contextId: nextContextId })
            void handleContextChange(nextContextId)
            return
          }
          navigateToView(view)
        }}
        onAgentChange={(agentId) => {
          handleAgentChange(agentId)
          navigateToView("globalOverview", { agentId })
        }}
        onAgentEnter={(agentId) => {
          handleAgentChange(agentId)
          navigateToView("agentOverview", { agentId })
        }}
        onTaskOpen={(taskTitle) => {
          setSelectedTaskTitle(taskTitle)
          navigateToView("agentTasks", { taskTitle })
        }}
        onContextOpen={(contextId) => {
          navigateToView("contextWorkspace", { contextId })
          void handleContextChange(contextId)
        }}
        variant="sidebar"
      />
      <SidebarInset>
        <SiteHeader
          topbarStatus={topbarStatus}
          topbarError={topbarError}
          loading={loading}
          onRefresh={() => void refreshDashboard()}
          viewLabel={getDashboardViewLabel(activeView)}
        />

        <main className="mainview-shell flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden bg-background px-3 py-2 md:px-4 md:py-3">
          {renderActiveView()}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
