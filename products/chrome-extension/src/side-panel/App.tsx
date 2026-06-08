/**
 * Side Panel 对话界面。
 *
 * 关键点（中文）：
 * - 右侧栏是 Chrome Extension 的原生 Agent Session 对话入口。
 * - 对话直连 `/api/sdk/*`，不依赖 ChatPlugin，因此普通 Agent 也能立即联通。
 * - IM 转发仍保留在 Popup / Options 中，Side Panel 只负责浏览器常驻 session。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ConsoleUiAgentOption, AgentSdkHistoryItem } from "../types/api";
import type {
  ActiveTabContext,
  ExtensionSettings,
  StatusMessage,
} from "../types/extension";
import { fetchConsoleAuthStatus, isAuthErrorMessage } from "../services/auth";
import {
  ensureAgentSdkSession,
  fetchAgentSdkHistory,
  promptAgentSdkSession,
  resolveAgentSessionId,
  subscribeAgentSdkSessionEvents,
} from "../services/agentSession";
import { fetchAgents } from "../services/downcityApi";
import { resolveAgentId } from "../services/chatRouting";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import {
  formatServerConnectionLabel,
  resolveAgentRuntimeBaseUrl,
  resolveRoutePreference,
  resolveSelectedConnection,
} from "../services/serverConnection";
import {
  DEFAULT_SETTINGS,
  loadConnectionToken,
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext } from "../services/tab";
import { readErrorText, shortenUrl } from "../extension-popup/helpers";

type PanelMessage = {
  /**
   * 本地消息 id。
   */
  id: string;
  /**
   * 消息角色。
   */
  role: "user" | "assistant" | "system";
  /**
   * 消息文本。
   */
  text: string;
  /**
   * 消息时间。
   */
  createdAt: number;
};

function normalizeMessageText(item: AgentSdkHistoryItem): string {
  if (typeof item.text === "string") return item.text.trim();
  if (typeof item.content === "string") return item.content.trim();
  if (Array.isArray(item.content)) {
    return item.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        return String(record.text || record.content || "").trim();
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function toPanelMessage(item: AgentSdkHistoryItem, index: number): PanelMessage | null {
  const role = String(item.role || "").trim();
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  const text = normalizeMessageText(item);
  if (!text) return null;
  return {
    id: String(item.id || item.turnId || `history-${index}`),
    role,
    text,
    createdAt:
      typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
        ? item.createdAt
        : Date.now(),
  };
}

function mergeAssistantEvent(params: {
  messages: PanelMessage[];
  turnId: string;
  text: string;
}): PanelMessage[] {
  const turnId = String(params.turnId || "").trim();
  const text = String(params.text || "").trim();
  if (!turnId || !text) return params.messages;
  const existingIndex = params.messages.findIndex((item) => item.id === turnId);
  if (existingIndex >= 0) {
    return params.messages.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            text,
            createdAt: Date.now(),
          }
        : item,
    );
  }
  return [
    ...params.messages,
    {
      id: turnId,
      role: "assistant",
      text,
      createdAt: Date.now(),
    },
  ];
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function SidePanelApp() {
  const endRef = useRef<HTMLDivElement | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const settingsRef = useRef<ExtensionSettings>(DEFAULT_SETTINGS);

  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<ActiveTabContext>({
    tabId: null,
    title: "加载中...",
    url: "",
  });
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [includePage, setIncludePage] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const selectedConnection = useMemo(
    () => resolveSelectedConnection(settings),
    [settings],
  );
  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === agentId) || null,
    [agentId, agents],
  );
  const serverBaseUrl = useMemo(() => {
    if (!selectedConnection) return "";
    return `${selectedConnection.protocol}://${selectedConnection.host}:${selectedConnection.port}${selectedConnection.basePath || ""}`;
  }, [selectedConnection]);
  const agentRuntimeBaseUrl = useMemo(
    () =>
      resolveAgentRuntimeBaseUrl({
        agent: selectedAgent,
        fallbackBaseUrl: serverBaseUrl,
      }),
    [selectedAgent, serverBaseUrl],
  );

  const scrollToEnd = useCallback(() => {
    window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end" });
    });
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    scrollToEnd();
  }, [messages, scrollToEnd]);

  const persistAgentSession = useCallback(
    async (params: {
      nextSettings: ExtensionSettings;
      connectionId: string;
      nextAgentId: string;
      nextSessionId: string;
    }) => {
      const preference = resolveRoutePreference({
        settings: params.nextSettings,
        connectionId: params.connectionId,
      });
      const nextSettings: ExtensionSettings = {
        ...params.nextSettings,
        selectedConnectionId: params.connectionId,
        routePreferences: {
          ...params.nextSettings.routePreferences,
          [params.connectionId]: {
            ...preference,
            targetMode: "agent_session",
            agentId: params.nextAgentId,
            agentSessionId: params.nextSessionId,
          },
        },
      };
      settingsRef.current = nextSettings;
      setSettings(nextSettings);
      await saveSettings(nextSettings);
    },
    [],
  );

  const connectSession = useCallback(
    async (params: {
      baseUrl: string;
      token: string;
      nextSessionId: string;
    }) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;

      setStatus({ type: "loading", text: "连接 Agent Session 中..." });
      await ensureAgentSdkSession({
        serverBaseUrl: params.baseUrl,
        sessionId: params.nextSessionId,
        authToken: params.token,
      });
      const history = await fetchAgentSdkHistory({
        serverBaseUrl: params.baseUrl,
        sessionId: params.nextSessionId,
        authToken: params.token,
        limit: 120,
      });
      setMessages(history.map(toPanelMessage).filter(Boolean) as PanelMessage[]);

      unsubscribeRef.current = await subscribeAgentSdkSessionEvents({
        serverBaseUrl: params.baseUrl,
        sessionId: params.nextSessionId,
        authToken: params.token,
        onEvent: (event) => {
          if (event.type === "turn-finish" && event.turnId) {
            setMessages((prev) =>
              mergeAssistantEvent({
                messages: prev,
                turnId: event.turnId || "",
                text: String(event.text || ""),
              }),
            );
            setStatus({
              type: event.success === false ? "error" : "success",
              text: event.success === false ? event.error || "执行失败" : "已完成",
            });
          }
        },
        onError: (error) => {
          setStatus({ type: "error", text: readErrorText(error) });
        },
      });

      setStatus({ type: "idle", text: "准备就绪" });
    },
    [],
  );

  const initialize = useCallback(async () => {
    setIsInitializing(true);
    try {
      const [loadedSettings, activeTab] = await Promise.all([
        loadSettings(),
        getActiveTabContext(),
      ]);
      const connection = resolveSelectedConnection(loadedSettings);
      setTab(activeTab);
      setSettings(loadedSettings);
      if (!connection) {
        setStatus({ type: "error", text: "未找到可用连接，请先到设置页配置。" });
        return;
      }

      const token = await loadConnectionToken(connection.id);
      setAuthToken(token);
      const baseUrl = `${connection.protocol}://${connection.host}:${connection.port}${connection.basePath || ""}`;
      const authStatus = await fetchConsoleAuthStatus({ consoleBaseUrl: baseUrl });
      const requiresToken = authStatus.requireToken === true;
      setAuthRequired(requiresToken && !token);
      if (requiresToken && !token) {
        setStatus({
          type: "error",
          text: "当前 Town 需要 Token，请到设置页填写。",
        });
        return;
      }

      const payload = await fetchAgents({ serverBaseUrl: baseUrl, authToken: token });
      const list = Array.isArray(payload.agents) ? payload.agents : [];
      const preference = resolveRoutePreference({
        settings: loadedSettings,
        connectionId: connection.id,
      });
      const nextAgentId = resolveAgentId({
        agents: list,
        preferredAgentId: preference.agentId,
        selectedAgentId: payload.selectedAgentId,
      });
      setAgents(list);
      setAgentId(nextAgentId);
      const nextAgent = list.find((item) => item.id === nextAgentId) || null;

      if (!nextAgentId) {
        setStatus({ type: "error", text: "未发现可用 Agent，请先启动 Agent。" });
        return;
      }
      const nextAgentRuntimeBaseUrl = resolveAgentRuntimeBaseUrl({
        agent: nextAgent,
        fallbackBaseUrl: baseUrl,
      });

      const nextSessionId = resolveAgentSessionId({
        preferredSessionId: preference.agentSessionId,
        connectionId: connection.id,
        agentId: nextAgentId,
      });
      setSessionId(nextSessionId);
      await persistAgentSession({
        nextSettings: loadedSettings,
        connectionId: connection.id,
        nextAgentId,
        nextSessionId,
      });
      await connectSession({
        baseUrl: nextAgentRuntimeBaseUrl,
        token,
        nextSessionId,
      });
    } catch (error) {
      const errorText = readErrorText(error);
      if (isAuthErrorMessage(errorText)) {
        setAuthRequired(true);
      }
      setStatus({ type: "error", text: `初始化失败：${errorText}` });
    } finally {
      setIsInitializing(false);
    }
  }, [connectSession, persistAgentSession]);

  useEffect(() => {
    void initialize();
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [initialize]);

  const handleSelectAgent = useCallback(
    async (nextAgentId: string) => {
      if (!selectedConnection || !serverBaseUrl) return;
      const nextAgent = agents.find((item) => item.id === nextAgentId) || null;
      const nextAgentRuntimeBaseUrl = resolveAgentRuntimeBaseUrl({
        agent: nextAgent,
        fallbackBaseUrl: serverBaseUrl,
      });
      const nextSessionId = resolveAgentSessionId({
        connectionId: selectedConnection.id,
        agentId: nextAgentId,
      });
      setAgentId(nextAgentId);
      setSessionId(nextSessionId);
      await persistAgentSession({
        nextSettings: settingsRef.current,
        connectionId: selectedConnection.id,
        nextAgentId,
        nextSessionId,
      });
      await connectSession({
        baseUrl: nextAgentRuntimeBaseUrl,
        token: authToken,
        nextSessionId,
      });
    },
    [
      agents,
      authToken,
      connectSession,
      persistAgentSession,
      selectedConnection,
      serverBaseUrl,
    ],
  );

  const buildPrompt = useCallback(async (): Promise<string> => {
    const query = String(input || "").trim();
    if (!query) return "";
    if (!includePage) return query;
    const snapshot = await buildPageMarkdownSnapshot(tab);
    return [
      query,
      "",
      `当前页面：${tab.title}`,
      `URL：${tab.url}`,
      "",
      `<file type="document" name="${snapshot.fileName}" caption="来源页面：${snapshot.url}">`,
      snapshot.markdown,
      "</file>",
    ].join("\n");
  }, [includePage, input, tab]);

  const sendMessage = useCallback(async () => {
    if (isSending || authRequired) return;
    const query = String(input || "").trim();
    if (!query) return;
    if (!agentRuntimeBaseUrl || !sessionId) {
      setStatus({ type: "error", text: "当前连接或 Session 不可用。" });
      return;
    }
    if (!selectedAgent?.running) {
      setStatus({ type: "error", text: "目标 Agent 未运行，请先启动。" });
      return;
    }

    setIsSending(true);
    setInput("");
    setStatus({ type: "loading", text: includePage ? "提取页面并发送中..." : "发送中..." });

    const localUserMessage: PanelMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text: query,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, localUserMessage]);

    try {
      const prompt = await buildPrompt();
      await promptAgentSdkSession({
        serverBaseUrl: agentRuntimeBaseUrl,
        sessionId,
        authToken,
        query: prompt,
      });
      setStatus({ type: "loading", text: "Agent 正在回复..." });
    } catch (error) {
      setStatus({ type: "error", text: `发送失败：${readErrorText(error)}` });
    } finally {
      setIsSending(false);
    }
  }, [
    agentRuntimeBaseUrl,
    authRequired,
    authToken,
    buildPrompt,
    includePage,
    input,
    isSending,
    selectedAgent?.running,
    sessionId,
  ]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      void sendMessage();
    },
    [sendMessage],
  );

  const openSettingsPage = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  return (
    <main className="flex h-screen min-h-[520px] flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Downcity
            </div>
            <h1 className="mt-1 text-[18px] font-medium text-foreground">
              Agent Chat
            </h1>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-border bg-muted px-3 text-[11px] font-medium text-foreground transition hover:bg-background"
            onClick={openSettingsPage}
          >
            设置
          </button>
        </div>

        <div className="mt-3 grid gap-2">
          <select
            className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[12px] text-foreground outline-none"
            value={agentId}
            onChange={(event) => {
              void handleSelectAgent(event.target.value);
            }}
            disabled={isInitializing || agents.length < 1}
          >
            {agents.length > 0 ? (
              agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} {agent.running ? "" : "（未运行）"}
                </option>
              ))
            ) : (
              <option value="">暂无可用 Agent</option>
            )}
          </select>
          <div className="rounded-[10px] border border-border bg-muted px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            {selectedConnection
              ? formatServerConnectionLabel(selectedConnection)
              : "当前没有可用连接"}
            <br />
            Session: {sessionId || "未连接"}
          </div>
        </div>
      </header>

      <section className="border-b border-border px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Current Page
        </div>
        <div className="mt-1 truncate text-[12px] font-medium text-foreground">
          {tab.title}
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {shortenUrl(tab.url)}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="grid gap-3">
          {messages.length > 0 ? (
            messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[92%] rounded-[12px] border px-3 py-2.5 ${
                  message.role === "user"
                    ? "ml-auto border-primary bg-primary text-primary-foreground"
                    : "mr-auto border-border bg-surface text-foreground"
                }`}
              >
                <div className="whitespace-pre-wrap break-words text-[13px] leading-6">
                  {message.text}
                </div>
                <div
                  className={`mt-1 text-[10px] ${
                    message.role === "user"
                      ? "text-primary-foreground/65"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatMessageTime(message.createdAt)}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[12px] border border-dashed border-border bg-surface px-3 py-6 text-center text-[12px] leading-6 text-muted-foreground">
              这条 Chrome Agent Session 还没有消息。
            </div>
          )}
          <div ref={endRef} />
        </div>
      </section>

      <footer className="border-t border-border bg-surface px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={includePage}
              onChange={(event) => setIncludePage(event.target.checked)}
            />
            附带当前页面
          </label>
          <div
            className={`truncate text-[11px] ${
              status.type === "error" ? "text-error" : "text-muted-foreground"
            }`}
          >
            {authRequired ? "需要 Token" : status.text}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-[78px] flex-1 resize-none rounded-[12px] border border-border bg-background px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none transition focus:border-border-strong"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="和 Agent 对话..."
            disabled={isInitializing || authRequired || isSending}
          />
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[12px] border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void sendMessage();
            }}
            disabled={isInitializing || authRequired || isSending || !input.trim()}
          >
            {isSending ? "发送中" : "发送"}
          </button>
        </div>
      </footer>
    </main>
  );
}
