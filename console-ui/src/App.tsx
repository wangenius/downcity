/**
 * Console UI Dashboard 根组件。
 */

import * as React from "react"

import { AppSidebar, type DashboardView } from "@/components/app-sidebar"
import { CommsContextSection } from "@/components/dashboard/CommsContextSection"
import { ContextStatusSection } from "@/components/dashboard/ContextStatusSection"
import { ExtensionsSection } from "@/components/dashboard/ExtensionsSection"
import { LocalChatSection } from "@/components/dashboard/LocalChatSection"
import { LogsSection } from "@/components/dashboard/LogsSection"
import { PromptSection } from "@/components/dashboard/PromptSection"
import { ServicesSection } from "@/components/dashboard/ServicesSection"
import { SummaryCards } from "@/components/dashboard/SummaryCards"
import { TasksSection } from "@/components/dashboard/TasksSection"
import { ToastMessage } from "@/components/dashboard/ToastMessage"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useConsoleDashboard } from "@/hooks/useConsoleDashboard"

const viewLabelMap: Record<DashboardView, string> = {
  overview: "Overview",
  services: "Services",
  commsContext: "Comms & Context",
  tasks: "Tasks",
  logs: "Logs",
  extensions: "Extensions",
  contextDetail: "Context Status",
  localChat: "local_ui Chat",
}

export function App() {
  const [activeView, setActiveView] = React.useState<DashboardView>("overview")

  const {
    agents,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    extensions,
    chatChannels,
    contexts,
    selectedChannel,
    selectedContextId,
    channelHistory,
    contextMessages,
    tasks,
    logs,
    prompt,
    localMessages,
    topbarStatus,
    topbarError,
    loading,
    sending,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleChannelChange,
    handleContextChange,
    refreshDashboard,
    refreshChatChannels,
    refreshExtensions,
    refreshPrompt,
    refreshLocalChat,
    controlService,
    controlExtension,
    runChatChannelAction,
    runTask,
    sendLocalMessage,
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
        contexts={contexts}
        selectedContextId={selectedContextId}
        onViewChange={setActiveView}
        onContextOpen={(contextId) => {
          setActiveView("contextDetail")
          void handleContextChange(contextId)
        }}
        onLocalChatOpen={() => {
          setActiveView("localChat")
          void handleContextChange(constants.LOCAL_UI_CONTEXT_ID)
        }}
        variant="inset"
      />
      <SidebarInset>
        <SiteHeader
          agents={agents}
          selectedAgentId={selectedAgentId}
          topbarStatus={topbarStatus}
          topbarError={topbarError}
          loading={loading}
          onAgentChange={handleAgentChange}
          onRefresh={() => void refreshDashboard()}
          viewLabel={viewLabelMap[activeView]}
        />

        <main className="flex flex-1 flex-col gap-4 bg-muted/35 p-3 md:p-4 lg:p-6">
          {activeView === "overview" ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(760px,1fr)_420px] animate-in fade-in-0 duration-300">
              <div className="space-y-4">
                <SummaryCards
                  selectedAgent={selectedAgent}
                  overview={overview}
                  services={services}
                  localUiContextId={constants.LOCAL_UI_CONTEXT_ID}
                />
                <ServicesSection
                  services={services}
                  statusBadgeVariant={uiHelpers.statusBadgeVariant}
                  onControlService={(name, action) => void controlService(name, action)}
                />
              </div>
              <aside className="space-y-4">
                <CommsContextSection
                  chatChannels={chatChannels}
                  contexts={contexts}
                  selectedChannel={selectedChannel}
                  selectedContextId={selectedContextId}
                  channelHistory={channelHistory}
                  contextMessages={contextMessages}
                  statusBadgeVariant={uiHelpers.statusBadgeVariant}
                  formatTime={uiHelpers.formatTime}
                  onChannelChange={(channel) => void handleChannelChange(channel)}
                  onContextChange={(contextId) => void handleContextChange(contextId)}
                  onRefreshChannels={() => void refreshChatChannels(selectedAgentId)}
                  onChatAction={(action, channel) => void runChatChannelAction(action, channel)}
                />
              </aside>
            </section>
          ) : null}

          {activeView === "services" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ServicesSection
                services={services}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onControlService={(name, action) => void controlService(name, action)}
              />
            </section>
          ) : null}

          {activeView === "commsContext" ? (
            <section className="animate-in fade-in-0 duration-300">
              <CommsContextSection
                chatChannels={chatChannels}
                contexts={contexts}
                selectedChannel={selectedChannel}
                selectedContextId={selectedContextId}
                channelHistory={channelHistory}
                contextMessages={contextMessages}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                formatTime={uiHelpers.formatTime}
                onChannelChange={(channel) => void handleChannelChange(channel)}
                onContextChange={(contextId) => void handleContextChange(contextId)}
                onRefreshChannels={() => void refreshChatChannels(selectedAgentId)}
                onChatAction={(action, channel) => void runChatChannelAction(action, channel)}
              />
            </section>
          ) : null}

          {activeView === "tasks" ? (
            <section className="animate-in fade-in-0 duration-300">
              <TasksSection
                tasks={tasks}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onRunTask={(taskId) => void runTask(taskId)}
              />
            </section>
          ) : null}

          {activeView === "extensions" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ExtensionsSection
                extensions={extensions}
                formatTime={uiHelpers.formatTime}
                statusBadgeVariant={uiHelpers.statusBadgeVariant}
                onRefresh={() => void refreshExtensions(selectedAgentId)}
                onControl={(name, action) => void controlExtension(name, action)}
              />
            </section>
          ) : null}

          {activeView === "logs" ? (
            <section className="animate-in fade-in-0 duration-300">
              <LogsSection logs={logs} formatTime={uiHelpers.formatTime} />
            </section>
          ) : null}

          {activeView === "contextDetail" ? (
            <section className="animate-in fade-in-0 duration-300">
              <ContextStatusSection
                selectedContextId={selectedContextId}
                contexts={contexts}
                channelHistory={channelHistory}
                contextMessages={contextMessages}
                formatTime={uiHelpers.formatTime}
              />
            </section>
          ) : null}

          {activeView === "localChat" ? (
            <section className="animate-in fade-in-0 duration-300">
              <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <LocalChatSection
                  localMessages={localMessages}
                  chatInput={chatInput}
                  sending={sending}
                  onChangeInput={setChatInput}
                  onRefresh={() => void refreshLocalChat(selectedAgentId)}
                  onSend={() => void sendLocalMessage()}
                  formatTime={uiHelpers.formatTime}
                />
                <PromptSection
                  prompt={prompt}
                  localUiContextId={constants.LOCAL_UI_CONTEXT_ID}
                  onRefresh={() => void refreshPrompt(selectedAgentId)}
                />
              </div>
            </section>
          ) : null}
        </main>
      </SidebarInset>

      {toast ? <ToastMessage message={toast.message} type={toast.type} /> : null}
    </SidebarProvider>
  )
}
