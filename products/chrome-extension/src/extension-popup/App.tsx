/**
 * Extension Popup 主界面。
 *
 * 关键点（中文）：
 * - Popup 只保留网页投递主链路，不再承担 Inline Composer 能力。
 * - 所有默认路由都按当前 Server Connection 独立保存。
 * - 发送历史按「当前页面 + 当前连接」过滤，避免多连接之间串记录。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ConsoleUiAgentOption, SessionOption } from "../types/api";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";
import type {
  ActiveTabContext,
  ExtensionPageSendRecord,
  ExtensionSettings,
  ExtensionServerConnection,
  StatusMessage,
} from "../types/extension";
import { fetchConsoleAuthStatus, isAuthErrorMessage } from "../services/auth";
import {
  executeAgentTask,
  fetchAgents,
  fetchSessionOptions,
} from "../services/downcityApi";
import {
  resolveAgentId,
  resolveLinkedChannels,
  resolveSessionId,
} from "../services/chatRouting";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import {
  formatServerConnectionLabel,
  resolveRoutePreference,
  resolveSelectedConnection,
} from "../services/serverConnection";
import {
  appendPageSendRecord,
  DEFAULT_SETTINGS,
  loadConnectionToken,
  loadPageSendRecords,
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext } from "../services/tab";
import {
  buildExtensionPopupInstructions,
  formatHistoryTime,
  getToastToneClass,
  normalizeInitialTaskPrompt,
  readErrorText,
  resolveExtensionPopupServerBaseUrl,
  shortenUrl,
  type ExtensionPopupToastMessage,
} from "./helpers";
import { ExtensionPopupSelect } from "./ExtensionPopupSelect";

const POPUP_HEADER_TEXT_BUTTON_CLASS_NAME =
  "inline-flex h-9 items-center justify-center rounded-[10px] border border-transparent px-3 text-[11px] font-medium tracking-[0.02em] text-foreground/72 outline-none transition hover:bg-background hover:text-foreground focus:bg-background focus:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

function toConnectionOptions(
  connections: ExtensionServerConnection[],
): ExtensionSelectOption[] {
  return connections.map((item) => ({
    value: item.id,
    label: item.name,
    description: `${item.protocol}://${item.host}:${item.port}${item.basePath || ""}`,
  }));
}

function toAgentOptions(agents: ConsoleUiAgentOption[]): ExtensionSelectOption[] {
  return agents.map((item) => ({
    value: item.id,
    label: item.name,
    description: item.running ? "在线" : "未运行",
  }));
}

function toSessionSelectOptions(sessions: SessionOption[]): ExtensionSelectOption[] {
  return sessions.map((item) => ({
    value: item.sessionId,
    label: item.title,
    description: item.subtitle,
  }));
}

function mergeRoutePreferenceSettings(params: {
  settings: ExtensionSettings;
  connectionId: string;
  agentId?: string;
  sessionId?: string;
  taskPrompt?: string;
}): ExtensionSettings {
  const connectionId = String(params.connectionId || "").trim();
  const currentPreference = resolveRoutePreference({
    settings: params.settings,
    connectionId,
  });

  return {
    ...params.settings,
    ...(params.taskPrompt !== undefined ? { taskPrompt: params.taskPrompt } : {}),
    selectedConnectionId: connectionId || params.settings.selectedConnectionId,
    routePreferences: {
      ...params.settings.routePreferences,
      [connectionId]: {
        agentId:
          params.agentId !== undefined ? String(params.agentId || "").trim() : currentPreference.agentId,
        sessionId:
          params.sessionId !== undefined
            ? String(params.sessionId || "").trim()
            : currentPreference.sessionId,
      },
    },
  };
}

export function ExtensionPopupApp() {
  const toastTimerRef = useRef<number | null>(null);
  const settingsRef = useRef<ExtensionSettings>(DEFAULT_SETTINGS);
  const taskPromptRef = useRef("");

  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<ActiveTabContext>({
    tabId: null,
    title: "加载中...",
    url: "",
  });
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    DEFAULT_SETTINGS.selectedConnectionId,
  );
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [pageHistory, setPageHistory] = useState<ExtensionPageSendRecord[]>([]);
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [taskPrompt, setTaskPrompt] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [toast, setToast] = useState<ExtensionPopupToastMessage | null>(null);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const effectiveSettings = useMemo<ExtensionSettings>(
    () => ({
      ...settings,
      selectedConnectionId:
        String(selectedConnectionId || "").trim() || settings.selectedConnectionId,
    }),
    [selectedConnectionId, settings],
  );

  const selectedConnection = useMemo(
    () => resolveSelectedConnection(effectiveSettings),
    [effectiveSettings],
  );
  const routePreference = useMemo(
    () =>
      resolveRoutePreference({
        settings: effectiveSettings,
        connectionId: selectedConnection?.id || "",
      }),
    [effectiveSettings, selectedConnection?.id],
  );
  const serverEndpoint = useMemo(
    () => resolveExtensionPopupServerBaseUrl(effectiveSettings),
    [effectiveSettings],
  );
  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === agentId) || null,
    [agentId, agents],
  );
  const linkedChannels = useMemo(
    () => resolveLinkedChannels(selectedAgent),
    [selectedAgent],
  );
  const connectionOptions = useMemo(
    () => toConnectionOptions(settings.connections),
    [settings.connections],
  );
  const agentOptions = useMemo(() => toAgentOptions(agents), [agents]);
  const sessionOptions = useMemo(
    () => toSessionSelectOptions(sessions),
    [sessions],
  );

  const showToast = useCallback((type: ExtensionPopupToastMessage["type"], text: string): void => {
    const message = String(text || "").trim();
    if (!message) return;
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ type, text: message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const persistSettings = useCallback(async (nextSettings: ExtensionSettings): Promise<void> => {
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    await saveSettings(nextSettings);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    taskPromptRef.current = taskPrompt;
  }, [taskPrompt]);

  const refreshPageHistory = useCallback(
    async (pageUrl: string, connectionId: string) => {
      if (!pageUrl || !connectionId) {
        setPageHistory([]);
        return;
      }
      const records = await loadPageSendRecords({
        connectionId,
        pageUrl,
        limit: 8,
      });
      setPageHistory(records);
    },
    [],
  );

  const refreshSessions = useCallback(
    async (params: {
      connectionId: string;
      agentId: string;
      preferredSessionId: string;
      authToken: string;
      serverBaseUrl: string;
      agentList: ConsoleUiAgentOption[];
    }): Promise<void> => {
      const normalizedAgentId = String(params.agentId || "").trim();
      if (!normalizedAgentId) {
        setSessions([]);
        setSessionId("");
        return;
      }

      setIsLoadingSessions(true);
      try {
        const rawSessions = await fetchSessionOptions(normalizedAgentId, {
          serverBaseUrl: params.serverBaseUrl,
          authToken: params.authToken,
        });
        const linked = resolveLinkedChannels(
          params.agentList.find((item) => item.id === normalizedAgentId) || null,
        );
        const filtered =
          linked.size > 0
            ? rawSessions.filter((item) => linked.has(item.channel))
            : rawSessions;
        const nextSessionId = resolveSessionId(filtered, params.preferredSessionId);
        setSessions(filtered);
        setSessionId(nextSessionId);

        const nextSettings = mergeRoutePreferenceSettings({
          settings: settingsRef.current,
          connectionId: params.connectionId,
          agentId: normalizedAgentId,
          sessionId: nextSessionId,
          taskPrompt: taskPromptRef.current,
        });
        await persistSettings(nextSettings);

        if (filtered.length < 1) {
          setStatus({
            type: "error",
            text: "当前 Agent 暂无可用 Session，请先让目标渠道产生会话。",
          });
          return;
        }

        setStatus((prev) =>
          prev.type === "loading" ? prev : { type: "idle", text: "准备就绪" },
        );
      } catch (error) {
        const errorText = readErrorText(error);
        setSessions([]);
        setSessionId("");
        if (isAuthErrorMessage(errorText)) {
          setAuthRequired(true);
          setStatus({
            type: "error",
            text: "当前连接需要 Bearer Token，请到设置页为该连接填写 Token。",
          });
          return;
        }
        setStatus({
          type: "error",
          text: `加载 Session 失败：${errorText}`,
        });
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [persistSettings],
  );

  const refreshAgents = useCallback(
    async (params: {
      connectionId: string;
      preferredAgentId: string;
      preferredSessionId: string;
      authToken: string;
      serverBaseUrl: string;
    }): Promise<void> => {
      if (!params.serverBaseUrl) {
        setStatus({
          type: "error",
          text: "Server 地址无效，请到设置页检查连接配置。",
        });
        return;
      }

      setIsLoadingAgents(true);
      try {
        const payload = await fetchAgents({
          serverBaseUrl: params.serverBaseUrl,
          authToken: params.authToken,
        });
        const list = Array.isArray(payload.agents) ? payload.agents : [];
        const nextAgentId = resolveAgentId({
          agents: list,
          preferredAgentId: params.preferredAgentId,
          selectedAgentId: payload.selectedAgentId,
        });

        setAgents(list);
        setAgentId(nextAgentId);

        const nextSettings = mergeRoutePreferenceSettings({
          settings: settingsRef.current,
          connectionId: params.connectionId,
          agentId: nextAgentId,
          sessionId: "",
          taskPrompt: taskPromptRef.current,
        });
        await persistSettings(nextSettings);

        if (list.length < 1) {
          setSessions([]);
          setSessionId("");
          setStatus({
            type: "error",
            text: "未发现可用 Agent，请先启动 `city agent start`。",
          });
          return;
        }

        await refreshSessions({
          connectionId: params.connectionId,
          agentId: nextAgentId,
          preferredSessionId: params.preferredSessionId,
          authToken: params.authToken,
          serverBaseUrl: params.serverBaseUrl,
          agentList: list,
        });
      } catch (error) {
        const errorText = readErrorText(error);
        setAgents([]);
        setSessions([]);
        setAgentId("");
        setSessionId("");
        if (isAuthErrorMessage(errorText)) {
          setAuthRequired(true);
          setStatus({
            type: "error",
            text: "当前连接需要 Bearer Token，请到设置页为该连接填写 Token。",
          });
          return;
        }
        setStatus({
          type: "error",
          text: `加载 Agent 失败：${errorText}`,
        });
      } finally {
        setIsLoadingAgents(false);
      }
    },
    [persistSettings, refreshSessions],
  );

  const initializeConnection = useCallback(
    async (savedSettings: ExtensionSettings, nextConnectionId: string, activeTab: ActiveTabContext) => {
      const normalizedConnectionId =
        String(nextConnectionId || "").trim() || savedSettings.connections[0]?.id || "";
      const nextSettings = {
        ...savedSettings,
        selectedConnectionId: normalizedConnectionId,
      };
      setSettings(nextSettings);
      setSelectedConnectionId(normalizedConnectionId);
      setTaskPrompt(normalizeInitialTaskPrompt(savedSettings.taskPrompt));

      const selected = resolveSelectedConnection(nextSettings);
      if (!selected) {
        setStatus({
          type: "error",
          text: "未找到可用的 Server Connection，请先到设置页创建连接。",
        });
        return;
      }

      const token = await loadConnectionToken(selected.id);
      setAuthToken(token);

      if (activeTab.url) {
        await refreshPageHistory(activeTab.url, selected.id);
      }

      const endpoint = resolveExtensionPopupServerBaseUrl(nextSettings);
      if (!endpoint.baseUrl) {
        setStatus({
          type: "error",
          text: endpoint.errorText || "Server 地址无效，请到设置页检查连接。",
        });
        return;
      }

      const authStatus = await fetchConsoleAuthStatus({
        consoleBaseUrl: endpoint.baseUrl,
      });
      const requiresToken = authStatus.requireToken === true;
      setAuthRequired(requiresToken && !token);
      if (requiresToken && !token) {
        setAgents([]);
        setSessions([]);
        setAgentId("");
        setSessionId("");
        setStatus({
          type: "error",
          text: "当前连接需要 Bearer Token，请到设置页为该连接填写 Token。",
        });
        return;
      }

      const preference = resolveRoutePreference({
        settings: nextSettings,
        connectionId: selected.id,
      });
      setStatus({ type: "loading", text: "加载当前连接配置中..." });
      await refreshAgents({
        connectionId: selected.id,
        preferredAgentId: preference.agentId,
        preferredSessionId: preference.sessionId,
        authToken: token,
        serverBaseUrl: endpoint.baseUrl,
      });
    },
    [refreshAgents, refreshPageHistory],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [savedSettings, activeTab] = await Promise.all([
          loadSettings(),
          getActiveTabContext(),
        ]);
        if (!isMounted) return;
        setTab(activeTab);
        await initializeConnection(
          savedSettings,
          savedSettings.selectedConnectionId || savedSettings.connections[0]?.id || "",
          activeTab,
        );
      } catch (error) {
        if (!isMounted) return;
        setStatus({
          type: "error",
          text: `初始化失败：${readErrorText(error)}`,
        });
      } finally {
        if (isMounted) {
          setAuthInitializing(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initializeConnection]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  const handleSelectConnection = useCallback(
    async (connectionId: string) => {
      const normalizedConnectionId = String(connectionId || "").trim();
      if (!normalizedConnectionId || normalizedConnectionId === selectedConnectionId) {
        return;
      }
      setAuthInitializing(true);
      try {
        const nextSettings = {
          ...settings,
          selectedConnectionId: normalizedConnectionId,
        };
        await persistSettings(nextSettings);
        await initializeConnection(nextSettings, normalizedConnectionId, tab);
      } catch (error) {
        setStatus({
          type: "error",
          text: `切换连接失败：${readErrorText(error)}`,
        });
      } finally {
        setAuthInitializing(false);
      }
    },
    [initializeConnection, persistSettings, selectedConnectionId, settings, tab],
  );

  const handleSelectAgent = useCallback(
    async (nextAgentId: string) => {
      if (!selectedConnection || !serverEndpoint.baseUrl) return;
      const normalizedAgentId = String(nextAgentId || "").trim();
      setAgentId(normalizedAgentId);
      setSessionId("");
      const nextSettings = mergeRoutePreferenceSettings({
        settings,
        connectionId: selectedConnection.id,
        agentId: normalizedAgentId,
        sessionId: "",
        taskPrompt,
      });
      await persistSettings(nextSettings);
      await refreshSessions({
        connectionId: selectedConnection.id,
        agentId: normalizedAgentId,
        preferredSessionId: "",
        authToken,
        serverBaseUrl: serverEndpoint.baseUrl,
        agentList: agents,
      });
    },
    [
      agents,
      authToken,
      persistSettings,
      refreshSessions,
      selectedConnection,
      serverEndpoint.baseUrl,
      settings,
      taskPrompt,
    ],
  );

  const handleSelectSession = useCallback(
    async (nextSessionId: string) => {
      if (!selectedConnection) return;
      const normalizedSessionId = String(nextSessionId || "").trim();
      setSessionId(normalizedSessionId);
      const nextSettings = mergeRoutePreferenceSettings({
        settings,
        connectionId: selectedConnection.id,
        agentId,
        sessionId: normalizedSessionId,
        taskPrompt,
      });
      await persistSettings(nextSettings);
    },
    [agentId, persistSettings, selectedConnection, settings, taskPrompt],
  );

  const cycleAgent = useCallback(
    async (direction: -1 | 1) => {
      if (agents.length < 2) return;
      const currentIndex = agents.findIndex((item) => item.id === agentId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + agents.length) % agents.length;
      const nextAgent = agents[nextIndex];
      if (!nextAgent) return;
      await handleSelectAgent(nextAgent.id);
    },
    [agentId, agents, handleSelectAgent],
  );

  const submitTask = useCallback(async () => {
    const normalizedAgentId = String(agentId || "").trim();
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedTaskPrompt = String(taskPrompt || "").trim();

    if (!selectedConnection) {
      const message = "请先选择一个 Server Connection";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }
    if (!normalizedAgentId) {
      const message = "请选择目标 Agent";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }
    if (!selectedAgent?.running) {
      const message = "目标 Agent 未运行，请先启动后再试";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }
    if (!normalizedSessionId) {
      const message = "请先选择目标 Session";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }
    if (!normalizedTaskPrompt) {
      const message = "Ask 不能为空";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }
    if (!serverEndpoint.baseUrl) {
      const message = "当前连接地址无效，请到设置页检查连接配置";
      setStatus({ type: "error", text: message });
      showToast("error", message);
      return;
    }

    const nextSettings = mergeRoutePreferenceSettings({
      settings,
      connectionId: selectedConnection.id,
      agentId: normalizedAgentId,
      sessionId: normalizedSessionId,
      taskPrompt: normalizedTaskPrompt,
    });

    setIsSubmitting(true);
    setStatus({ type: "loading", text: "任务投递中..." });

    try {
      await persistSettings(nextSettings);
      setTaskPrompt(normalizedTaskPrompt);

      setStatus({ type: "loading", text: "正在提取页面正文..." });
      const markdownSnapshot = await buildPageMarkdownSnapshot(tab);
      setStatus({ type: "loading", text: "正在上传 Markdown 附件..." });

      await executeAgentTask({
        serverBaseUrl: serverEndpoint.baseUrl,
        agentId: normalizedAgentId,
        sessionId: normalizedSessionId,
        authToken,
        body: {
          instructions: buildExtensionPopupInstructions({
            tab,
            taskPrompt: normalizedTaskPrompt,
            markdownFileName: markdownSnapshot.fileName,
          }),
          attachments: [
            {
              type: "document",
              fileName: markdownSnapshot.fileName,
              caption: `来源页面：${markdownSnapshot.url}`,
              contentType: "text/markdown; charset=utf-8",
              content: markdownSnapshot.markdown,
            },
          ],
        },
      });

      try {
        await appendPageSendRecord({
          connectionId: selectedConnection.id,
          pageUrl: tab.url,
          pageTitle: tab.title,
          agentId: normalizedAgentId,
          sessionId: normalizedSessionId,
          taskPrompt: normalizedTaskPrompt,
          attachmentFileName: markdownSnapshot.fileName,
        });
        await refreshPageHistory(tab.url, selectedConnection.id);
      } catch {
        // ignore local history failures
      }

      setStatus({
        type: "success",
        text: "已发送，任务已进入队列。",
      });
      showToast("success", "发送成功");
    } catch (error) {
      const message = `发送失败：${readErrorText(error)}`;
      setStatus({ type: "error", text: message });
      showToast("error", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    agentId,
    authToken,
    persistSettings,
    refreshPageHistory,
    selectedAgent?.running,
    selectedConnection,
    serverEndpoint.baseUrl,
    sessionId,
    settings,
    showToast,
    tab,
    taskPrompt,
  ]);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitTask();
    },
    [submitTask],
  );

  const onTaskPromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (isSubmitting) return;
      void submitTask();
    },
    [isSubmitting, submitTask],
  );

  const openSettingsPage = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const composerDisabled = authInitializing || authRequired || !selectedConnection;

  return (
    <main className="w-[380px] bg-background text-foreground">
      <div className="flex min-h-[560px] flex-col">
        <header className="border-b border-border bg-surface px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Downcity
              </div>
              <h1 className="mt-1 text-[18px] font-medium tracking-[-0.02em] text-foreground">
                Web Share
              </h1>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                把当前网页作为 Markdown 附件发送到指定 Agent Session。
              </p>
            </div>
            <button
              type="button"
              className={POPUP_HEADER_TEXT_BUTTON_CLASS_NAME}
              onClick={openSettingsPage}
            >
              设置
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <ExtensionPopupSelect
              label="Server"
              value={selectedConnectionId}
              placeholder="请先到设置页创建连接"
              options={connectionOptions}
              onChange={(value) => {
                void handleSelectConnection(value);
              }}
              disabled={connectionOptions.length === 0 || authInitializing}
            />

            <div className="rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[11px] text-muted-foreground">
              {selectedConnection
                ? formatServerConnectionLabel(selectedConnection)
                : "当前没有可用连接"}
            </div>
          </div>
        </header>

        <section className="border-b border-border px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Current Page
          </div>
          <div className="mt-1 text-[13px] font-medium text-foreground">
            {tab.title}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {shortenUrl(tab.url)}
          </div>
        </section>

        <form className="flex flex-1 flex-col" onSubmit={onSubmit}>
          <div className="grid gap-3 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className={POPUP_HEADER_TEXT_BUTTON_CLASS_NAME}
                onClick={() => {
                  void cycleAgent(-1);
                }}
                disabled={composerDisabled || agents.length < 2}
              >
                上一位
              </button>
              <button
                type="button"
                className={POPUP_HEADER_TEXT_BUTTON_CLASS_NAME}
                onClick={() => {
                  void cycleAgent(1);
                }}
                disabled={composerDisabled || agents.length < 2}
              >
                下一位
              </button>
            </div>

            <ExtensionPopupSelect
              label="Agent"
              value={agentId}
              placeholder={
                isLoadingAgents
                  ? "加载 Agent 中..."
                  : agentOptions.length > 0
                    ? "请选择目标 Agent"
                    : "暂无可用 Agent"
              }
              options={agentOptions}
              onChange={(value) => {
                void handleSelectAgent(value);
              }}
              disabled={composerDisabled || isLoadingAgents || agentOptions.length === 0}
            />

            <ExtensionPopupSelect
              label="Session"
              value={sessionId}
              placeholder={
                !agentId
                  ? "请先选择 Agent"
                  : isLoadingSessions
                    ? "加载 Session 中..."
                    : sessionOptions.length > 0
                      ? "请选择目标 Session"
                      : linkedChannels.size > 0
                        ? "暂无可用 Session"
                        : "当前 Agent 没有关联渠道"
              }
              options={sessionOptions}
              onChange={(value) => {
                void handleSelectSession(value);
              }}
              disabled={
                composerDisabled ||
                !agentId ||
                isLoadingSessions ||
                sessionOptions.length === 0
              }
            />

            <label className="flex min-w-0 flex-col gap-1 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Ask
              <textarea
                className="min-h-[116px] w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none transition focus:border-border-strong"
                value={taskPrompt}
                onChange={(event) => setTaskPrompt(event.target.value)}
                onKeyDown={onTaskPromptKeyDown}
                placeholder="告诉 Agent 你希望它如何处理这个页面"
                disabled={composerDisabled || isSubmitting}
              />
            </label>
          </div>

          <div className="mt-auto border-t border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-h-5 text-[12px] text-muted-foreground">
                {authInitializing
                  ? "正在检查当前连接状态..."
                  : authRequired
                    ? "当前连接需要 Token，请到设置页配置"
                    : status.text}
              </div>
              <button
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={composerDisabled || isSubmitting}
              >
                {isSubmitting ? "发送中..." : "发送"}
              </button>
            </div>
          </div>
        </form>

        <section className="border-t border-border bg-surface px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            History
          </div>
          <div className="mt-2 grid gap-2">
            {pageHistory.length > 0 ? (
              pageHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-[12px] border border-border bg-background px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[12px] font-medium text-foreground">
                      {item.taskPrompt || "未命名请求"}
                    </div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      {formatHistoryTime(item.sentAt)}
                    </div>
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {item.attachmentFileName}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[12px] border border-dashed border-border bg-background px-3 py-3 text-[11px] text-muted-foreground">
                当前页面在这个连接下还没有发送记录。
              </div>
            )}
          </div>
        </section>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            className={`rounded-[12px] border px-3 py-2 text-[11px] shadow-sm ${getToastToneClass(
              toast.type,
            )}`}
          >
            {toast.text}
          </div>
        </div>
      ) : null}
    </main>
  );
}
