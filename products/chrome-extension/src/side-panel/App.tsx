/**
 * Side Panel 对话界面。
 *
 * 关键点（中文）：
 * - 右侧栏是 Chrome Extension 的 RemoteAgent 浏览器对话入口。
 * - 对话通过轻量 RemoteAgent client 访问 Town runtime API，不依赖 ChatPlugin。
 * - 当前页面上下文跟随 Chrome 活动标签页变化，并收进输入框区域。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ConsoleUiAgentOption, AgentSdkHistoryItem } from "../types/api";
import type {
  ActiveTabContext,
  ExtensionSettings,
  StatusMessage,
} from "../types/extension";
import type { ComposerSubmitPayload } from "../types/sidePanel";
import { fetchConsoleAuthStatus, isAuthErrorMessage } from "../services/auth";
import { resolveAgentSessionId } from "../services/agentSession";
import { fetchAgents } from "../services/downcityApi";
import { resolveAgentId } from "../services/chatRouting";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import {
  resolveAgentRuntimeBaseUrl,
  resolveRoutePreference,
  resolveSelectedConnection,
} from "../services/serverConnection";
import { createRemoteAgentClient } from "../services/remoteAgentClient";
import {
  DEFAULT_SETTINGS,
  loadConnectionToken,
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext, subscribeActiveTabContext } from "../services/tab";
import { readErrorText } from "../extension-popup/helpers";
import { Composer } from "./Composer";
import { MarkdownMessage } from "./MarkdownMessage";

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
  /**
   * 关联的 Agent turn id。
   */
  turnId?: string;
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
  if (Array.isArray(item.parts)) {
    return item.parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as Record<string, unknown>;
        if (record.type === "text" && typeof record.text === "string") {
          return record.text.trim();
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function escapeContextAttribute(input: string): string {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeContextAttribute(input: string): string {
  return String(input || "")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripCurrentContextBlock(input: string): string {
  return String(input || "")
    .replace(/<current_context>[\s\S]*?<\/current_context>/giu, "")
    .trim();
}

function stripLegacyFileBlocks(input: string): string {
  return String(input || "")
    .replace(/<file\b[\s\S]*?<\/file>/giu, "")
    .trim();
}

function readXmlAttribute(attributes: string, name: string): string {
  const pattern = new RegExp(`\\b${name}="([^"]*)"`, "iu");
  const match = attributes.match(pattern);
  return unescapeContextAttribute(match?.[1] || "").trim();
}

function extractCurrentContextLabels(input: string): string[] {
  const text = String(input || "");
  const labels: string[] = [];
  const siteMatches = text.matchAll(/<site\b[^>]*\btitle="([^"]*)"[^>]*>/giu);
  for (const match of siteMatches) {
    const title = unescapeContextAttribute(match[1] || "").trim();
    if (title) labels.push(`@ ${title}`);
  }
  const selectionMatches = text.matchAll(/<selection\b[^>]*\blabel="([^"]*)"[^>]*>/giu);
  for (const match of selectionMatches) {
    const label = unescapeContextAttribute(match[1] || "").trim();
    if (label) labels.push(`@ ${label}`);
  }
  return labels;
}

function extractLegacyFileLabels(input: string): string[] {
  const labels: string[] = [];
  const fileMatches = String(input || "").matchAll(/<file\b([^>]*)>/giu);
  for (const match of fileMatches) {
    const attributes = match[1] || "";
    const caption = readXmlAttribute(attributes, "caption");
    const name = readXmlAttribute(attributes, "name");
    const label = caption || name;
    if (label) labels.push(`@ ${label}`);
  }
  return labels;
}

function formatHistoryUserMessageText(input: string): string {
  const text = String(input || "").trim();
  if (!text) return "";
  const query = stripLegacyFileBlocks(stripCurrentContextBlock(text));
  const labels = [
    ...extractCurrentContextLabels(text),
    ...extractLegacyFileLabels(text),
  ];
  if (labels.length < 1) return query;
  return [query || "引用上下文", "", labels.join("\n")].join("\n").trim();
}

function normalizeMessageCreatedAt(item: AgentSdkHistoryItem): number {
  if (typeof item.createdAt === "number" && Number.isFinite(item.createdAt)) {
    return item.createdAt;
  }
  const metadata = item.metadata;
  if (metadata && typeof metadata === "object") {
    const timestamp = (metadata as Record<string, unknown>).ts;
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  return Date.now();
}

function toPanelMessage(item: AgentSdkHistoryItem, index: number): PanelMessage | null {
  const role = String(item.role || "").trim();
  if (role !== "user" && role !== "assistant" && role !== "system") return null;
  const text = normalizeMessageText(item);
  if (!text) return null;
  const displayText = role === "user" ? formatHistoryUserMessageText(text) : text;
  if (!displayText) return null;
  return {
    id: String(item.id || (item.turnId ? `${role}-${item.turnId}` : `history-${index}`)),
    role,
    text: displayText,
    createdAt: normalizeMessageCreatedAt(item),
    turnId: typeof item.turnId === "string" ? item.turnId : undefined,
  };
}

function findLastTurnUserIndex(messages: PanelMessage[], turnId: string): number {
  let foundIndex = -1;
  messages.forEach((message, index) => {
    if (message.role === "user" && message.turnId === turnId) {
      foundIndex = index;
    }
  });
  return foundIndex;
}

function placeAssistantAfterTurnUser(
  messages: PanelMessage[],
  turnId: string,
): PanelMessage[] {
  const normalizedTurnId = String(turnId || "").trim();
  if (!normalizedTurnId) return messages;
  const assistantIndex = messages.findIndex(
    (message) =>
      message.role === "assistant" &&
      (message.id === normalizedTurnId || message.turnId === normalizedTurnId),
  );
  if (assistantIndex < 0) return messages;

  const withoutAssistant = messages.filter((_, index) => index !== assistantIndex);
  const userIndex = findLastTurnUserIndex(withoutAssistant, normalizedTurnId);
  if (userIndex < 0) return messages;

  const assistantMessage: PanelMessage = {
    ...messages[assistantIndex],
    id: normalizedTurnId,
    turnId: normalizedTurnId,
  };
  return [
    ...withoutAssistant.slice(0, userIndex + 1),
    assistantMessage,
    ...withoutAssistant.slice(userIndex + 1),
  ];
}

function bindUserMessageTurn(params: {
  messages: PanelMessage[];
  userMessageId: string;
  turnId: string;
}): PanelMessage[] {
  const turnId = String(params.turnId || "").trim();
  if (!turnId) return params.messages;
  const boundMessages = params.messages.map((message) =>
    message.id === params.userMessageId
      ? {
          ...message,
          turnId,
        }
      : message,
  );
  return placeAssistantAfterTurnUser(boundMessages, turnId);
}

function insertAssistantMessage(params: {
  messages: PanelMessage[];
  message: PanelMessage;
}): PanelMessage[] {
  const turnId = String(params.message.turnId || params.message.id || "").trim();
  const userIndex = findLastTurnUserIndex(params.messages, turnId);
  if (userIndex < 0) {
    return [...params.messages, params.message];
  }
  return [
    ...params.messages.slice(0, userIndex + 1),
    params.message,
    ...params.messages.slice(userIndex + 1),
  ];
}

function appendAssistantDelta(params: {
  messages: PanelMessage[];
  turnId: string;
  text: string;
}): PanelMessage[] {
  const turnId = String(params.turnId || "").trim();
  const text = String(params.text || "");
  if (!turnId || !text) return params.messages;
  const existingIndex = params.messages.findIndex(
    (item) =>
      item.role === "assistant" && (item.id === turnId || item.turnId === turnId),
  );
  if (existingIndex >= 0) {
    const nextMessages = params.messages.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            id: turnId,
            turnId,
            text: `${item.text}${text}`,
            createdAt: Date.now(),
          }
        : item,
    );
    return placeAssistantAfterTurnUser(nextMessages, turnId);
  }
  return insertAssistantMessage({
    messages: params.messages,
    message: {
      id: turnId,
      turnId,
      role: "assistant",
      text,
      createdAt: Date.now(),
    },
  });
}

function finalizeAssistantMessage(params: {
  messages: PanelMessage[];
  turnId: string;
  text: string;
}): PanelMessage[] {
  const turnId = String(params.turnId || "").trim();
  const text = String(params.text || "").trim();
  if (!turnId || !text) return params.messages;
  const existingIndex = params.messages.findIndex(
    (item) =>
      item.role === "assistant" && (item.id === turnId || item.turnId === turnId),
  );
  if (existingIndex >= 0) {
    const nextMessages = params.messages.map((item, index) =>
      index === existingIndex
        ? {
            ...item,
            id: turnId,
            turnId,
            text,
            createdAt: Date.now(),
          }
        : item,
    );
    return placeAssistantAfterTurnUser(nextMessages, turnId);
  }
  return appendAssistantDelta({ messages: params.messages, turnId, text });
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

function formatUserMessagePreview(payload: ComposerSubmitPayload): string {
  const text = String(payload.text || "").trim();
  const references = payload.references
    .map((item) => `@ ${item.label}`)
    .filter(Boolean);
  if (references.length < 1) return text;
  return [text || "引用上下文", "", references.join("\n")].join("\n").trim();
}

function buildSelectionContextLabel(input: string): string {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return "选中文本";
  if (text.length <= 42) return `选中文本：${text}`;
  return `选中文本：${text.slice(0, 39).trimEnd()}...`;
}

function orderHistoryMessages(messages: PanelMessage[]): PanelMessage[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      if (left.message.createdAt !== right.message.createdAt) {
        return left.message.createdAt - right.message.createdAt;
      }
      return left.index - right.index;
    })
    .map((item) => item.message);
}

function findLatestAssistantId(messages: PanelMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index]?.id || "";
  }
  return "";
}

/**
 * 设置图标。
 */
function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.1 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.1l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V2.8a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.9 7l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
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
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "",
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

      setStatus({ type: "loading", text: "连接 Agent 中..." });
      const remoteAgent = createRemoteAgentClient({
        baseUrl: params.baseUrl,
        token: params.token,
      });
      const session = await remoteAgent.getSession(params.nextSessionId);
      const history = await session.history({ limit: 120 });
      setMessages(
        orderHistoryMessages(history.map(toPanelMessage).filter(Boolean) as PanelMessage[]),
      );

      unsubscribeRef.current = await session.subscribe({
        onEvent: (event) => {
          if (event.type === "text-delta" && event.turnId) {
            setMessages((prev) =>
              appendAssistantDelta({
                messages: prev,
                turnId: event.turnId || "",
                text: String(event.text || ""),
              }),
            );
            setStatus({ type: "loading", text: "Agent 正在回复..." });
            return;
          }
          if (event.type === "reasoning-delta" && event.turnId) {
            setStatus({ type: "loading", text: "Agent 正在思考..." });
            return;
          }
          if (event.type === "tool-call") {
            setStatus({ type: "loading", text: "Agent 正在使用工具..." });
            return;
          }
          if (event.type === "tool-result") {
            setStatus({ type: "loading", text: "Agent 已完成工具调用..." });
            return;
          }
          if (event.type === "turn-finish" && event.turnId) {
            setMessages((prev) =>
              finalizeAssistantMessage({
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

      setStatus({ type: "idle", text: "" });
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

  useEffect(() => {
    const unsubscribe = subscribeActiveTabContext((nextTab) => {
      setTab(nextTab);
    });
    return unsubscribe;
  }, []);

  const buildPrompt = useCallback(async (payload: ComposerSubmitPayload): Promise<string> => {
    const query = String(payload.text || "").trim();
    const pageRefs = payload.references.filter((item) => item.type === "page");
    const selectionRefs = payload.references.filter((item) => item.type === "selection");
    if (!query && pageRefs.length < 1 && selectionRefs.length < 1) return "";
    const contextParts: string[] = [];

    for (const reference of pageRefs) {
      const snapshot = await buildPageMarkdownSnapshot(tab);
      contextParts.push(
        `<site title="${escapeContextAttribute(reference.label)}" url="${escapeContextAttribute(snapshot.url)}" file="${escapeContextAttribute(snapshot.fileName)}">`,
        snapshot.markdown,
        "</site>",
      );
    }

    selectionRefs.forEach((reference) => {
      const text = String(reference.text || "").trim();
      if (!text) return;
      const label = buildSelectionContextLabel(text);
      contextParts.push(
        `<selection label="${escapeContextAttribute(label)}"${reference.url ? ` url="${escapeContextAttribute(reference.url)}"` : ""}>`,
        text,
        "</selection>",
      );
    });

    const parts = [query || "请根据当前上下文继续处理。"];
    if (contextParts.length > 0) {
      parts.push("", "<current_context>", ...contextParts, "</current_context>");
    }

    return parts.join("\n");
  }, [tab]);

  const sendMessage = useCallback(async (payload: ComposerSubmitPayload) => {
    if (isSending || authRequired) return;
    const query = String(payload.text || "").trim();
    if (!query && payload.references.length < 1) return;
    if (!agentRuntimeBaseUrl || !sessionId) {
      setStatus({ type: "error", text: "当前连接或 Session 不可用。" });
      return;
    }
    if (!selectedAgent?.running) {
      setStatus({ type: "error", text: "目标 Agent 未运行，请先启动。" });
      return;
    }

    setIsSending(true);
    setStatus({ type: "loading", text: "发送中..." });

    const userMessageId = `local-user-${Date.now()}`;
    const localUserMessage: PanelMessage = {
      id: userMessageId,
      role: "user",
      text: formatUserMessagePreview(payload),
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, localUserMessage]);

    try {
      const prompt = await buildPrompt(payload);
      const remoteAgent = createRemoteAgentClient({
        baseUrl: agentRuntimeBaseUrl,
        token: authToken,
      });
      const session = await remoteAgent.getSession(sessionId);
      const turnId = await session.prompt({ query: prompt });
      setMessages((prev) =>
        bindUserMessageTurn({
          messages: prev,
          userMessageId,
          turnId,
        }),
      );
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
    isSending,
    selectedAgent?.running,
    sessionId,
  ]);

  const openSettingsPage = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  const agentName = selectedAgent?.name || "Downcity Agent";
  const errorText =
    authRequired
      ? "当前 Town 需要 Token，请到设置页填写。"
      : selectedAgent && !selectedAgent.running
        ? "目标 Agent 未运行，请先启动。"
        : status.type === "error"
          ? status.text
          : "";
  const isWorking = status.type === "loading" || isSending || isInitializing;
  const latestAssistantId = isWorking ? findLatestAssistantId(messages) : "";
  const shouldShowLoadingDots =
    isWorking && messages[messages.length - 1]?.role === "user";
  const canSend =
    !isInitializing &&
    !authRequired &&
    !isSending &&
    Boolean(agentRuntimeBaseUrl) &&
    Boolean(sessionId);

  return (
    <main className="flex h-screen min-h-[520px] min-w-0 max-w-full flex-col overflow-x-hidden bg-background text-foreground">
      <header className="flex min-h-[58px] min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden bg-surface px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              errorText
                ? "bg-error"
                : isWorking
                  ? "animate-pulse bg-[#4f7cff]"
                  : "bg-[#4f7cff]"
            }`}
          />
          <h1 className="truncate text-[15px] font-medium text-foreground">
            {agentName}
          </h1>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={openSettingsPage}
          aria-label="设置"
          title="设置"
        >
          <SettingsIcon />
        </button>
      </header>
      {errorText ? (
        <div className="min-w-0 max-w-full overflow-hidden bg-surface px-4 pb-2 text-[12px] leading-5 text-error [overflow-wrap:anywhere]">
          {errorText}
        </div>
      ) : null}

      <section className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        <div className="grid min-w-0 max-w-full gap-3 overflow-hidden">
          {messages.length > 0 ? (
            messages.map((message) => (
              <article
                key={message.id}
                className={`min-w-0 max-w-[92%] overflow-hidden rounded-[16px] px-3.5 py-2.5 ${
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-transparent text-foreground"
                }`}
              >
                <MarkdownMessage
                  role={message.role}
                  text={message.text}
                  streaming={message.id === latestAssistantId}
                />
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
            <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-[13px] leading-6 text-muted-foreground">
              和 {agentName} 开始对话。
            </div>
          )}
          {shouldShowLoadingDots ? (
            <div className="mr-auto flex items-center gap-1 rounded-[16px] bg-transparent px-3.5 py-2.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </section>

      <footer className="min-w-0 max-w-full overflow-hidden bg-background px-3 pb-3 pt-2">
        <Composer
          tab={tab}
          disabled={!canSend}
          sending={isSending}
          onSubmit={(payload) => {
            void sendMessage(payload);
          }}
        />
      </footer>
    </main>
  );
}
