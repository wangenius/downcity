/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar, type DashboardView } from "@/components/app-sidebar"
import { AgentModelBindingSection } from "@/components/dashboard/AgentModelBindingSection"
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

const viewLabelMap: Record<DashboardView, string> = {
  globalOverview: "Global / Overview",
  globalModel: "Global / Model",
  globalAgents: "Global / Agents",
  globalExtensions: "Global / Extensions",
  agentOverview: "Agent / Overview",
  agentServices: "Agent / Services",
  agentTasks: "Agent / Tasks",
  agentLogs: "Agent / Logs",
  contextOverview: "Context / Overview",
  contextWorkspace: "Context / Workspace",
}

export function App() {
  const [activeView, setActiveView] = React.useState<DashboardView>("globalOverview")

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
    refreshPrompt,
    controlService,
    controlExtension,
    runChatChannelAction,
    runTask,
    sendLocalMessage,
    switchModel,
    constants,
    uiHelpers,
  } = useConsoleDashboard()

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "17rem",
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
        onViewChange={setActiveView}
        onAgentChange={(agentId) => {
          void handleAgentChange(agentId)
        }}
        onContextOpen={(contextId) => {
          setActiveView("contextWorkspace")
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
          viewLabel={viewLabelMap[activeView]}
        />

        <main className="flex flex-1 flex-col gap-4 bg-muted/35 p-3 md:p-4 lg:p-6">
          {activeView === "globalOverview" ? (
            <section className="animate-in fade-in-0 duration-300">
              <GlobalOverviewSection
                topbarStatus={topbarStatus}
                topbarError={topbarError}
                agents={agents}
                selectedAgent={selectedAgent}
                chatChannels={chatChannels}
                extensions={extensions}
              />
            </section>
          ) : null}

          {activeView === "agentOverview" ? (
            <section className="animate-in fade-in-0 space-y-4 duration-300">
              <SummaryCards
                selectedAgent={selectedAgent}
                overview={overview}
                services={services}
                localUiContextId={constants.LOCAL_UI_CONTEXT_ID}
              />
              <AgentModelBindingSection
                selectedAgent={selectedAgent}
                model={model}
                loading={loading}
                onRefresh={() => void refreshModel(selectedAgentId)}
                onSwitchModel={(primaryModelId) => void switchModel(primaryModelId)}
              />
            </section>
          ) : null}

          {activeView === "agentServices" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ServicesSection
                services={services}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onControlService={(name, action) => void controlService(name, action)}
              />
            </section>
          ) : null}

          {activeView === "globalAgents" ? (
            <section className="animate-in fade-in-0 duration-300">
              <GlobalAgentsSection
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelectAgent={(agentId) => {
                  void handleAgentChange(agentId)
                }}
                onRefresh={() => void refreshDashboard(selectedAgentId)}
              />
            </section>
          ) : null}

          {activeView === "globalModel" ? (
            <section className="animate-in fade-in-0 duration-300">
              <GlobalModelSection
                model={model}
                loading={loading}
                onRefresh={() => void refreshModel(selectedAgentId)}
              />
            </section>
          ) : null}

          {activeView === "globalExtensions" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ExtensionsSection
                extensions={extensions}
                formatTime={uiHelpers.formatTime}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onRefresh={() => void refreshDashboard()}
                onControl={(name, action) => void controlExtension(name, action)}
              />
            </section>
          ) : null}

          {activeView === "agentTasks" ? (
            <section className="animate-in fade-in-0 duration-300">
              <TasksSection
                tasks={tasks}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onRunTask={(taskId) => void runTask(taskId)}
              />
            </section>
          ) : null}

          {activeView === "agentLogs" ? (
            <section className="animate-in fade-in-0 duration-300">
              <LogsSection logs={logs} formatTime={uiHelpers.formatTime} />
            </section>
          ) : null}

          {activeView === "contextOverview" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ContextOverviewSection
                contexts={contexts}
                selectedContextId={selectedContextId}
                chatChannels={chatChannels}
                formatTime={uiHelpers.formatTime}
                onOpenContext={(contextId) => {
                  setActiveView("contextWorkspace")
                  void handleContextChange(contextId)
                }}
                onRefreshChannels={() => void refreshChatChannels(selectedAgentId)}
                onChatAction={(action, channel) => void runChatChannelAction(action, channel)}
              />
            </section>
          ) : null}

          {activeView === "contextWorkspace" ? (
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
                onRefreshPrompt={() => void refreshPrompt(selectedAgentId, selectedContextId || constants.LOCAL_UI_CONTEXT_ID)}
              />
            </section>
          ) : null}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
