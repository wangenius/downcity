/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { AgentModelBindingSection } from "@/components/dashboard/AgentModelBindingSection"
import { ConsoleStatusSection } from "@/components/dashboard/ConsoleStatusSection"
import { GlobalAgentsSection } from "@/components/dashboard/GlobalAgentsSection"
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
import { parseDashboardPath, toDashboardPath } from "@/lib/dashboard-route"
import type { DashboardView } from "@/types/Navigation"

export function App() {
  const [activeView, setActiveView] = React.useState<DashboardView>(() => {
    if (typeof window === "undefined") return "globalOverview"
    return parseDashboardPath(window.location.pathname).view
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
    runChatChannelAction,
    configureChatChannel,
    runTask,
    loadTaskRuns,
    loadTaskRunDetail,
    sendLocalMessage,
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
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

  const navigateToView = React.useCallback((view: DashboardView, contextId?: string) => {
    if (typeof window === "undefined") return
    const nextPath = toDashboardPath(view, contextId)
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath)
    }
    setActiveView(view)
  }, [])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const parsed = parseDashboardPath(window.location.pathname)
    if (parsed.view === "contextWorkspace" && parsed.contextId) {
      void handleContextChange(parsed.contextId)
    }
  }, [handleContextChange])

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined
    const onPopState = () => {
      const parsed = parseDashboardPath(window.location.pathname)
      setActiveView(parsed.view)
      if (parsed.view === "contextWorkspace" && parsed.contextId) {
        void handleContextChange(parsed.contextId)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [handleContextChange])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    if (activeView !== "contextWorkspace") return
    if (!selectedContextId) return
    const expectedPath = toDashboardPath("contextWorkspace", selectedContextId)
    if (window.location.pathname !== expectedPath) {
      window.history.replaceState({}, "", expectedPath)
    }
  }, [activeView, selectedContextId])

  const renderActiveView = () => {
    switch (activeView) {
      case "globalOverview":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <GlobalOverviewSection
              topbarStatus={topbarStatus}
              topbarError={topbarError}
              agents={agents}
              extensions={extensions}
              configStatus={configStatus}
            />
          </section>
        )
      case "globalRuntime":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <ConsoleStatusSection
              selectedAgent={selectedAgent}
              topbarStatus={topbarStatus}
              topbarError={topbarError}
              hasPrompt={Boolean(prompt)}
              extensions={extensions}
              configStatus={configStatus}
              onRefresh={() => void refreshDashboard()}
            />
          </section>
        )
      case "agentOverview":
        return (
          <section className="animate-in fade-in-0 space-y-4 duration-300">
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
      case "agentServices":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <ServicesSection
              services={services}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              onControlService={(name, action) => void controlService(name, action)}
            />
          </section>
        )
      case "globalAgents":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <GlobalAgentsSection
              agents={agents}
              selectedAgentId={selectedAgentId}
              model={model}
              onSelectAgent={(agentId) => {
                void handleAgentChange(agentId)
              }}
              onRefresh={() => void refreshDashboard(selectedAgentId)}
              onSwitchModel={(agentId, primaryModelId) => {
                void switchModelForAgent(agentId, primaryModelId)
              }}
              onStartAgent={(agentId) => {
                void startAgentFromHistory(agentId)
              }}
            />
          </section>
        )
      case "globalModel":
        return (
          <section className="animate-in fade-in-0 duration-300">
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
          <section className="animate-in fade-in-0 duration-300">
            <ExtensionsSection
              extensions={extensions}
              formatTime={uiHelpers.formatTime}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              onRefresh={() => void refreshDashboard()}
              onControl={(name, action) => void controlExtension(name, action)}
            />
          </section>
        )
      case "agentTasks":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <TasksSection
              tasks={tasks}
              statusBadgeVariant={uiHelpers.statusBadgeVariant}
              formatTime={uiHelpers.formatTime}
              onRunTask={(title) => void runTask(title)}
              onLoadTaskRuns={(title, limit) => loadTaskRuns(title, limit)}
              onLoadTaskRunDetail={(title, timestamp) => loadTaskRunDetail(title, timestamp)}
            />
          </section>
        )
      case "agentLogs":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <LogsSection logs={logs} formatTime={uiHelpers.formatTime} />
          </section>
        )
      case "contextOverview":
        return (
          <section className="animate-in fade-in-0 duration-300">
            <ContextOverviewSection
              contexts={contexts}
              selectedContextId={selectedContextId}
              chatChannels={chatChannels}
              formatTime={uiHelpers.formatTime}
              onOpenContext={(contextId) => {
                navigateToView("contextWorkspace", contextId)
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
          <section className="animate-in fade-in-0 duration-300">
            <ContextWorkspaceSection
              selectedContextId={selectedContextId}
              contexts={contexts}
              channelHistory={channelHistory}
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
                navigateToView("contextWorkspace", contextId)
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
        contexts={contexts}
        selectedContextId={selectedContextId}
        onViewChange={(view) => {
          if (view === "contextWorkspace") {
            const nextContextId = selectedContextId || constants.LOCAL_UI_CONTEXT_ID
            navigateToView("contextWorkspace", nextContextId)
            void handleContextChange(nextContextId)
            return
          }
          navigateToView(view)
        }}
        onAgentChange={(agentId) => {
          void handleAgentChange(agentId)
        }}
        onContextOpen={(contextId) => {
          navigateToView("contextWorkspace", contextId)
          void handleContextChange(contextId)
        }}
        variant="inset"
      />
      <SidebarInset>
        <SiteHeader
          topbarStatus={topbarStatus}
          topbarError={topbarError}
          loading={loading}
          onRefresh={() => void refreshDashboard()}
          viewLabel={getDashboardViewLabel(activeView)}
        />

        <main className="flex flex-1 flex-col gap-4 overflow-hidden bg-background p-3 md:p-4 lg:p-6">
          {renderActiveView()}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
