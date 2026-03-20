/**
 * Agent 概览区（重构版）。
 *
 * 关键点（中文）
 * - Overview 按“重要块”组织：Runtime、Model、Services、Config。
 * - 每个块都输出可读明细，避免只展示统计数字。
 * - 服务细节按服务类型展开（chat/task/skills/memory/context）。
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowRightIcon, Loader2Icon, PauseIcon, PlayIcon, RotateCwIcon, SquareIcon } from "lucide-react";
import type {
  UiAgentOption,
  UiChannelAccountItem,
  UiConfigStatusItem,
  UiChatChannelStatus,
  UiContextSummary,
  UiModelSummary,
  UiOverviewResponse,
  UiServiceItem,
  UiSkillSummaryItem,
  UiTaskItem,
} from "../../types/Dashboard";

export interface SummaryCardsProps {
  /**
   * 当前路由对应的 agent。
   */
  selectedAgent: UiAgentOption | null;
  /**
   * 概览数据快照。
   */
  overview: UiOverviewResponse | null;
  /**
   * service 列表快照。
   */
  services: UiServiceItem[];
  /**
   * skills 列表快照（来自 skill service 的 list）。
   */
  skills: UiSkillSummaryItem[];
  /**
   * task 列表快照。
   */
  tasks: UiTaskItem[];
  /**
   * context 列表（用于 chat overview 跳转）。
   */
  contexts: UiContextSummary[];
  /**
   * channel account 列表（用于显示当前绑定账号名称）。
   */
  channelAccounts: UiChannelAccountItem[];
  /**
   * consoleui channel 默认 context id。
   */
  consoleUiContextId: string;
  /**
   * 配置状态列表。
   */
  configStatus: UiConfigStatusItem[];
  /**
   * 模型快照。
   */
  model: UiModelSummary | null;
  /**
   * 切换 model.primary。
   */
  onSwitchModel: (primaryModelId: string) => void;
  /**
   * 启动当前 agent。
   */
  onStartAgent: () => Promise<void> | void;
  /**
   * 重启当前 agent。
   */
  onRestartAgent: () => Promise<void> | void;
  /**
   * 停止当前 agent。
   */
  onStopAgent: () => Promise<void> | void;
  /**
   * 打开 task 详情。
   */
  onOpenTask: (taskTitle: string) => void;
  /**
   * 打开 context workspace。
   */
  onOpenContext: (contextId: string) => void;
  /**
   * 控制 service 生命周期。
   */
  onControlService: (serviceName: string, action: string) => Promise<void> | void;
  /**
   * chat channel 状态快照。
   */
  chatChannels: UiChatChannelStatus[];
  /**
   * 执行 chat channel 动作。
   */
  onChatAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => Promise<void> | void;
}

function formatLastRun(rawInput?: string): string {
  const raw = String(rawInput || "").trim();
  if (!raw) return "-";
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})$/);
  if (!match) return raw;

  const [, y, m, d, hh, mm, ss, ms] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
    Number(ms),
  );
  if (Number.isNaN(date.getTime())) return raw;

  const absolute = date.toLocaleString("zh-CN", { hour12: false });
  const deltaMs = Date.now() - date.getTime();
  if (!Number.isFinite(deltaMs)) return absolute;
  if (deltaMs < 60_000) return `${absolute} · 刚刚`;
  if (deltaMs < 3_600_000) return `${absolute} · ${Math.floor(deltaMs / 60_000)} 分钟前`;
  if (deltaMs < 86_400_000) return `${absolute} · ${Math.floor(deltaMs / 3_600_000)} 小时前`;
  return `${absolute} · ${Math.floor(deltaMs / 86_400_000)} 天前`;
}

function KV(props: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{props.label}</div>
      <div className="truncate text-foreground" title={props.value}>{props.value}</div>
    </div>
  );
}

export function SummaryCards(props: SummaryCardsProps) {
  const {
    selectedAgent,
    overview,
    services,
    skills,
    tasks,
    contexts,
    channelAccounts,
    consoleUiContextId,
    configStatus,
    model,
    onSwitchModel,
    onStartAgent,
    onRestartAgent,
    onStopAgent,
    onOpenTask,
    onOpenContext,
    onControlService,
    chatChannels,
    onChatAction,
  } = props;

  const overviewContexts = Array.isArray(overview?.contexts?.items) ? overview.contexts.items : [];
  const consoleUiExists = overviewContexts.some((item) => item.contextId === consoleUiContextId);
  const chatProfiles = Array.isArray(selectedAgent?.chatProfiles) ? selectedAgent.chatProfiles : [];
  const agentConfigItems = configStatus.filter((item) => item.scope === "agent");
  const badConfigItems = agentConfigItems.filter((item) => String(item.status || "").toLowerCase() !== "ok");
  const memoryConfigItems = agentConfigItems.filter((item) => {
    const key = String(item.key || "").toLowerCase();
    const label = String(item.label || "").toLowerCase();
    const path = String(item.path || "").toLowerCase();
    return key.includes("memory") || label.includes("memory") || path.includes("/memory");
  });

  const availableModels = Array.isArray(model?.availableModels) ? model.availableModels : [];
  const currentModelId = String(
    model?.agentPrimaryModelId || model?.primaryModelId || selectedAgent?.primaryModelId || "",
  ).trim();
  const [targetModelId, setTargetModelId] = React.useState(currentModelId);
  const [pendingAgentAction, setPendingAgentAction] = React.useState<"" | "start" | "restart" | "stop">("");
  const [pendingServiceActions, setPendingServiceActions] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setTargetModelId(currentModelId);
  }, [currentModelId]);
  const isServiceActionPending = React.useCallback(
    (key: string) => Boolean(pendingServiceActions[key]),
    [pendingServiceActions],
  );
  /**
   * 关键点（中文）：统一按 channel 建索引，方便 chat overview 渲染动作禁用态。
   */
  const chatStatusByChannel = React.useMemo(() => {
    const map = new Map<string, { enabled?: boolean; configured?: boolean; channelAccountId?: string }>();
    for (const item of chatChannels) {
      const channel = String(item.channel || "").trim().toLowerCase();
      if (!channel) continue;
      const detail = item.detail;
      const detailRecord =
        detail && typeof detail === "object" && !Array.isArray(detail)
          ? (detail as Record<string, unknown>)
          : null;
      const configRecord =
        detailRecord?.config && typeof detailRecord.config === "object" && !Array.isArray(detailRecord.config)
          ? (detailRecord.config as Record<string, unknown>)
          : null;
      map.set(channel, {
        enabled: item.enabled,
        configured: item.configured,
        channelAccountId: String(configRecord?.channelAccountId || "").trim(),
      });
    }
    return map;
  }, [chatChannels]);

  /**
   * 关键点（中文）：把 accountId -> 名称做本地映射，保证 agent overview 可直接显示当前绑定账号。
   */
  const channelAccountNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of channelAccounts) {
      const id = String(item.id || "").trim();
      if (!id) continue;
      const label = String(item.name || item.id || "").trim() || id;
      map.set(id, label);
    }
    return map;
  }, [channelAccounts]);

  /**
   * 关键点（中文）：补齐内置 service，避免接口偶发缺项导致 UI 不显示（例如 skill）。
   */
  const normalizedServices = React.useMemo(() => {
    const baseOrder = ["chat", "task", "skill", "memory"];
    const mapByName = new Map<string, UiServiceItem>();
    for (const item of services) {
      const name = String(item.name || item.service || "").trim().toLowerCase();
      if (!name) continue;
      if (!mapByName.has(name)) mapByName.set(name, item);
    }

    const merged: UiServiceItem[] = baseOrder.map((name) => {
      const hit = mapByName.get(name);
      if (hit) return hit;
      return {
        name,
        state: "stopped",
      };
    });

    for (const [name, item] of mapByName.entries()) {
      if (baseOrder.includes(name)) continue;
      merged.push(item);
    }
    return merged;
  }, [services]);

  const resolveContextIdByChatProfile = React.useCallback(
    (channelInput?: string): string => {
      const channel = String(channelInput || "").trim().toLowerCase();
      if (!channel) return "";
      const contextCandidates = contexts
        .map((item) => String(item.contextId || "").trim())
        .filter((contextId) => contextId.startsWith(`${channel}-`));
      if (contextCandidates.length === 0) return "";
      return contextCandidates[0] || "";
    },
    [contexts],
  );

  /**
   * 根据当前 service 状态返回可执行动作。
   * 关键点（中文）：优先给出最常用动作，保证交互简洁。
   */
  const resolveServiceActions = React.useCallback((stateRaw: string): string[] => {
    const state = String(stateRaw || "").trim().toLowerCase();
    if (state === "running") return ["pause", "restart", "stop"];
    if (state === "paused") return ["resume", "restart", "stop"];
    if (state === "stopped" || state === "idle" || state === "unknown") return ["start", "restart"];
    return ["start", "restart", "stop"];
  }, []);

  const serviceActionMeta: Record<string, { label: string; icon: React.ReactNode }> = {
    start: { label: "start", icon: <PlayIcon className="size-3.5" /> },
    resume: { label: "resume", icon: <PlayIcon className="size-3.5" /> },
    pause: { label: "pause", icon: <PauseIcon className="size-3.5" /> },
    restart: { label: "restart", icon: <RotateCwIcon className="size-3.5" /> },
    stop: { label: "stop", icon: <SquareIcon className="size-3.5" /> },
  };

  if (!selectedAgent) {
    return <div className="py-6 text-sm text-muted-foreground">未选择 agent</div>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3 px-1 py-1">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <img src="/image.png" alt="bot" className="mt-0.5 size-8 shrink-0 rounded-[4px] object-cover" />
            <div className="min-w-0 space-y-1">
              <div className="truncate text-xl font-semibold leading-none text-foreground">{selectedAgent.name || "-"}</div>
              <div className="truncate text-xs text-muted-foreground">{selectedAgent.projectRoot || selectedAgent.id || "-"}</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {selectedAgent.running ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setPendingAgentAction("restart");
                  void Promise.resolve(onRestartAgent()).finally(() => setPendingAgentAction(""));
                }}
                disabled={pendingAgentAction !== ""}
                title="restart"
                aria-label="restart"
              >
                {pendingAgentAction === "restart" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RotateCwIcon className="size-4" />
                )}
              </Button>
              <Button
                size="icon-sm"
                variant="destructive"
                onClick={() => {
                  setPendingAgentAction("stop");
                  void Promise.resolve(onStopAgent()).finally(() => setPendingAgentAction(""));
                }}
                disabled={pendingAgentAction !== ""}
                title="stop"
                aria-label="stop"
              >
                {pendingAgentAction === "stop" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SquareIcon className="size-4" />
                )}
              </Button>
            </>
          ) : (
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => {
                setPendingAgentAction("start");
                void Promise.resolve(onStartAgent()).finally(() => setPendingAgentAction(""));
              }}
              disabled={pendingAgentAction !== ""}
              title="start"
              aria-label="start"
            >
              {pendingAgentAction === "start" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <PlayIcon className="size-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      <section className="rounded-[18px] bg-secondary px-3.5 py-3">
        <div className="grid gap-x-6 md:grid-cols-2">
          <div>
            <KV label="DC" value={String(overview?.cityVersion || "-")} />
            <KV label="PID" value={String(selectedAgent.daemonPid || "-")} />
            <KV label="Host" value={String(selectedAgent.host || "-")} />
            <KV label="Port" value={selectedAgent.port ? String(selectedAgent.port) : "-"} />
            <KV label="Path" value={String(selectedAgent.projectRoot || selectedAgent.id || "-")} />
          </div>
          <div>
            <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-sm">
              <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Model</div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto max-w-full justify-start p-0 text-left text-sm font-medium"
                    />
                  }
                >
                  <span className="truncate">{targetModelId || "选择 model.primary"}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-72 min-w-[20rem]">
                  {availableModels.length === 0 ? (
                    <DropdownMenuItem disabled>无可选模型</DropdownMenuItem>
                  ) : (
                    availableModels.map((item) => {
                      const modelId = String(item.id || "").trim();
                      if (!modelId) return null;
                      return (
                        <DropdownMenuItem
                          key={modelId}
                          onClick={() => {
                            const nextModelId = String(modelId || "").trim();
                            setTargetModelId(nextModelId);
                            if (!nextModelId || nextModelId === currentModelId) return;
                            onSwitchModel(nextModelId);
                          }}
                        >
                          {`${modelId} · ${item.name || "-"} · ${item.providerType || "-"}${item.isPaused ? " · paused" : ""}`}
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      {normalizedServices.length === 0 ? (
        <section className="space-y-1 rounded-[18px] bg-secondary px-3.5 py-3">
          <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Service Overview</div>
          <div className="text-sm text-muted-foreground">暂无 service</div>
        </section>
      ) : (
        normalizedServices.map((service, index) => {
          const name = String(service.name || service.service || `service-${index}`).trim();
          const displayName = name.toLowerCase() === "skill" ? "skills" : name;
          const state = String(service.state || service.status || "unknown").trim().toLowerCase();
          const normalizedName = name.toLowerCase();
          const isRunning = state === "running";
          const isHealthy =
            state === "running" || state === "ok" || state === "active" || state === "enabled" || state === "idle" || state === "success";
          const isError = state === "error" || state === "failed";
          const serviceActions = resolveServiceActions(state);
          const stateTone = isError
            ? "text-destructive"
            : isRunning
              ? "text-emerald-700"
              : isHealthy
                ? "text-foreground"
                : "text-muted-foreground";
          const dotTone = isError ? "bg-destructive" : isRunning ? "bg-emerald-600" : isHealthy ? "bg-foreground/70" : "bg-muted-foreground/60";

          let details: string[] = ["无额外明细"];
          let taskItems: UiTaskItem[] = [];
          let chatItems: Array<{
            channel: string;
            link: string;
            accountName: string;
            contextId: string;
            clickable: boolean;
          }> = [];
          let contextItems: string[] = [];
          const isTaskOverview = normalizedName.includes("task");
          const isChatOverview = normalizedName.includes("chat");
          const isSkillOverview = normalizedName.includes("skill");
          const isMemoryOverview = normalizedName.includes("memory");
          const isContextOverview = normalizedName.includes("context");
          if (normalizedName.includes("chat")) {
            chatItems = chatProfiles.map((profile) => {
                  const channel = String(profile.channel || "-");
                  const link = String(profile.linkState || profile.statusText || "unknown");
                  const contextId = resolveContextIdByChatProfile(channel);
                  const status = chatStatusByChannel.get(channel.trim().toLowerCase());
                  const channelAccountId = String(status?.channelAccountId || "").trim();
                  const accountName = channelAccountId
                    ? String(channelAccountNameById.get(channelAccountId) || channelAccountId)
                    : "no binding";
                  return {
                    channel,
                    link,
                    accountName,
                    contextId,
                    clickable: Boolean(contextId),
                  };
                });
            details = chatItems.length ? [] : ["无 channel"];
          } else if (normalizedName.includes("task")) {
            taskItems = tasks.slice(0, 20);
            details = taskItems.length ? [] : ["无 task"];
          } else if (normalizedName.includes("skill")) {
            details = skills.length ? [] : ["无已发现 skills"];
          } else if (normalizedName.includes("memory")) {
            details = memoryConfigItems.length
              ? memoryConfigItems.map((item) => `${item.label}: ${item.status}`)
              : ["无 memory 配置"];
          } else if (normalizedName.includes("context")) {
            contextItems = contexts.slice(0, 8).map((item) => String(item.contextId || "-"));
            details = contextItems.length
              ? []
              : [`consoleui: ${consoleUiExists ? "ok" : "missing"}`];
          }

          const panelTone = "bg-secondary";

          return (
            <section key={`${name}:${index}`} className={`space-y-1 rounded-[18px] px-3.5 py-3 ${panelTone}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs uppercase tracking-[0.12em] text-muted-foreground">{`${displayName} Overview`}</div>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center gap-1">
                    {serviceActions.map((action) => {
                      const meta = serviceActionMeta[action];
                      if (!meta) return null;
                      return (
                        <button
                          key={`${name}:action:${action}`}
                          type="button"
                          className={
                            action === "stop"
                              ? "inline-flex h-6 w-6 items-center justify-center rounded-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                              : "inline-flex h-6 w-6 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          }
                          title={meta.label}
                          aria-label={meta.label}
                          disabled={isServiceActionPending(`${name}:${action}`)}
                          onClick={() => {
                            const key = `${name}:${action}`;
                            setPendingServiceActions((prev) => ({ ...prev, [key]: true }));
                            void Promise.resolve(onControlService(name, action)).finally(() => {
                              setPendingServiceActions((prev) => ({ ...prev, [key]: false }));
                            });
                          }}
                        >
                          {isServiceActionPending(`${name}:${action}`) ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            meta.icon
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className={`inline-flex items-center gap-1 text-[11px] ${stateTone}`}>
                    <span className={`size-1.5 rounded-full ${dotTone}`} />
                    <span>{state || "-"}</span>
                  </div>
                </div>
              </div>
              {isTaskOverview && taskItems.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px]">
                  <table className="w-full border-separate border-spacing-y-1.5 text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Task</th>
                        <th className="py-1 pr-2 font-medium">Status</th>
                        <th className="py-1 pr-2 font-medium">Last Run</th>
                        <th className="py-1 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskItems.map((task, taskIndex) => {
                        const title = String(task.title || `task-${taskIndex}`).trim();
                        const status = String(task.status || "unknown").trim().toLowerCase();
                        return (
                          <tr key={`${name}:task:${title}:${taskIndex}`} className="bg-transparent text-muted-foreground transition-colors hover:bg-background">
                            <td className="max-w-0 rounded-l-[14px] py-2 pr-2 pl-2 truncate">{title}</td>
                            <td className="py-1.5 pr-2">{status}</td>
                            <td className="py-1.5 pr-2">{formatLastRun(task.lastRunTimestamp)}</td>
                            <td className="rounded-r-[14px] py-1.5 pr-2 text-right">
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground"
                                onClick={() => onOpenTask(title)}
                              >
                                <span>open</span>
                                <ArrowRightIcon className="size-3 shrink-0" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isChatOverview && chatItems.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px]">
                  <table className="w-full border-separate border-spacing-y-1.5 text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Channel</th>
                        <th className="py-1 pr-2 font-medium">Link</th>
                        <th className="py-1 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chatItems.map((chatItem, chatIndex) => (
                        <tr key={`${name}:chat:${chatItem.channel}:${chatIndex}`} className="bg-transparent text-muted-foreground transition-colors hover:bg-background">
                          <td className="rounded-l-[14px] py-2 pr-2 pl-2">{chatItem.channel}</td>
                          <td className="py-1.5 pr-2">
                            <div className="space-y-0.5">
                              <div>{chatItem.link}</div>
                              <div className="text-[10px] text-muted-foreground/80">{chatItem.accountName}</div>
                            </div>
                          </td>
                          <td className="rounded-r-[14px] py-1.5 pr-2 text-right">
                            {(() => {
                              const normalizedChannel = String(chatItem.channel || "").trim();
                              const hasValidChannel = Boolean(normalizedChannel) && normalizedChannel !== "-";
                              const status = chatStatusByChannel.get(normalizedChannel.toLowerCase());
                              const enabled = status?.enabled === true;
                              const configured = status?.configured === true;
                              const runtimeActionDisabled = !hasValidChannel || (status ? !(enabled && configured) : false);
                              const openDisabled = !hasValidChannel || (status ? enabled : false);
                              const closeDisabled = !hasValidChannel || (status ? !enabled : false);
                              const testKey = `${name}:chat:${normalizedChannel}:test`;
                              const reconnectKey = `${name}:chat:${normalizedChannel}:reconnect`;
                              const openKey = `${name}:chat:${normalizedChannel}:open`;
                              const closeKey = `${name}:chat:${normalizedChannel}:close`;
                              return (
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                    onClick={() => onOpenContext(chatItem.contextId)}
                                    disabled={!chatItem.clickable}
                                  >
                                    <span>context</span>
                                    <ArrowRightIcon className="size-3 shrink-0" />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                    disabled={openDisabled || isServiceActionPending(openKey)}
                                    onClick={() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [openKey]: true }));
                                      void Promise.resolve(onChatAction("open", normalizedChannel)).finally(() => {
                                        setPendingServiceActions((prev) => ({ ...prev, [openKey]: false }));
                                      });
                                    }}
                                  >
                                    {isServiceActionPending(openKey) ? <Loader2Icon className="size-3 animate-spin" /> : null}
                                    <span>open</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                    disabled={closeDisabled || isServiceActionPending(closeKey)}
                                    onClick={() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [closeKey]: true }));
                                      void Promise.resolve(onChatAction("close", normalizedChannel)).finally(() => {
                                        setPendingServiceActions((prev) => ({ ...prev, [closeKey]: false }));
                                      });
                                    }}
                                  >
                                    {isServiceActionPending(closeKey) ? <Loader2Icon className="size-3 animate-spin" /> : null}
                                    <span>close</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                    disabled={runtimeActionDisabled || isServiceActionPending(testKey)}
                                    onClick={() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [testKey]: true }));
                                      void Promise.resolve(onChatAction("test", normalizedChannel)).finally(() => {
                                        setPendingServiceActions((prev) => ({ ...prev, [testKey]: false }));
                                      });
                                    }}
                                  >
                                    {isServiceActionPending(testKey) ? <Loader2Icon className="size-3 animate-spin" /> : null}
                                    <span>test</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
                                    disabled={runtimeActionDisabled || isServiceActionPending(reconnectKey)}
                                    onClick={() => {
                                      setPendingServiceActions((prev) => ({ ...prev, [reconnectKey]: true }));
                                      void Promise.resolve(onChatAction("reconnect", normalizedChannel)).finally(() => {
                                        setPendingServiceActions((prev) => ({ ...prev, [reconnectKey]: false }));
                                      });
                                    }}
                                  >
                                    {isServiceActionPending(reconnectKey) ? <Loader2Icon className="size-3 animate-spin" /> : null}
                                    <span>reconnect</span>
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isSkillOverview && skills.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px]">
                  <table className="w-full border-separate border-spacing-y-1.5 text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Skill</th>
                        <th className="py-1 pr-2 font-medium">Description</th>
                        <th className="py-1 pr-2 font-medium">Source</th>
                        <th className="py-1 pr-2 font-medium">Tools</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skills.map((item, skillIndex) => (
                        <tr key={`${name}:skill:${item.id || item.name || skillIndex}`} className="bg-transparent text-muted-foreground transition-colors hover:bg-background">
                          <td className="rounded-l-[14px] py-2 pr-2 pl-2">{item.name || item.id || "-"}</td>
                          <td className="py-1.5 pr-2 max-w-0 truncate">{item.description || "-"}</td>
                          <td className="py-1.5 pr-2">{item.source || "-"}</td>
                          <td className="max-w-0 rounded-r-[14px] py-1.5 pr-2 truncate">
                            {Array.isArray(item.allowedTools) && item.allowedTools.length > 0
                              ? item.allowedTools.join(", ")
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isMemoryOverview && memoryConfigItems.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px]">
                  <table className="w-full border-separate border-spacing-y-1.5 text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Key</th>
                        <th className="py-1 pr-2 font-medium">Status</th>
                        <th className="py-1 pr-2 font-medium">Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memoryConfigItems.map((item) => (
                        <tr key={`${name}:memory:${item.key}`} className="bg-transparent text-muted-foreground transition-colors hover:bg-background">
                          <td className="rounded-l-[14px] py-2 pr-2 pl-2">{item.label}</td>
                          <td className="py-1.5 pr-2">{item.status}</td>
                          <td className="max-w-0 rounded-r-[14px] py-1.5 pr-2 truncate">{item.path}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {isContextOverview && contextItems.length > 0 ? (
                <div className="overflow-x-auto rounded-[18px]">
                  <table className="w-full border-separate border-spacing-y-1.5 text-left text-[11px]">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">Context ID</th>
                        <th className="py-1 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contextItems.map((contextId) => (
                        <tr key={`${name}:context:${contextId}`} className="bg-transparent text-muted-foreground transition-colors hover:bg-background">
                          <td className="max-w-0 rounded-l-[14px] py-2 pr-2 pl-2 truncate">{contextId}</td>
                          <td className="rounded-r-[14px] py-1.5 pr-2 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-[10px] px-1.5 py-1 hover:bg-secondary hover:text-foreground"
                              onClick={() => onOpenContext(contextId)}
                            >
                              <span>open</span>
                              <ArrowRightIcon className="size-3 shrink-0" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {details.length > 0 ? (
                <ul className="space-y-0.5 text-[11px]">
                  {details.map((line, lineIndex) => (
                    <li key={`${name}:detail:${lineIndex}`} className="truncate text-muted-foreground">{line}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })
      )}

      {badConfigItems.length > 0 ? (
        <section className="rounded-[18px] bg-destructive/8 px-3.5 py-3">
          <div className="text-xs font-medium text-destructive">{`配置异常 ${badConfigItems.length} 项`}</div>
          <div className="mt-1 text-xs text-destructive/90">
            {badConfigItems.map((item) => `${item.label}(${item.reason || item.status || "unknown"})`).join(" · ")}
          </div>
        </section>
      ) : null}
    </section>
  );
}
