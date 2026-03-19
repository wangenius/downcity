/**
 * Popup 主界面。
 *
 * 关键点（中文）：
 * - 只保留发送主链路：选择 Agent / Channel，输入 Ask，发送。
 * - 常用预置模板已移除，改为最近 ask 历史回填。
 * - 设置入口已移除，popup 仅保留发送相关能力。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import type { ChatKeyOption, ConsoleUiAgentOption } from "../types/api";
import type {
  ActiveTabContext,
  ExtensionSettings,
  StatusMessage,
} from "../types/extension";
import {
  buildConsoleBaseUrl,
  dispatchAgentTask,
  fetchAgents,
  fetchChatKeyOptions,
} from "../services/downcityApi";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import {
  appendPageSendRecord,
  DEFAULT_SETTINGS,
  loadRecentAskHistory,
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext } from "../services/tab";

function readErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

function resolveConsoleBaseUrl(settings: ExtensionSettings): {
  baseUrl: string;
  errorText?: string;
} {
  try {
    return {
      baseUrl: buildConsoleBaseUrl({
        host: settings.consoleHost,
        port: settings.consolePort,
      }),
    };
  } catch (error) {
    return {
      baseUrl: "",
      errorText: readErrorText(error),
    };
  }
}

function buildInstructions(params: {
  tab: ActiveTabContext;
  taskPrompt: string;
  markdownFileName: string;
}): string {
  const safeUrl = params.tab.url || "N/A";
  const userPrompt = String(params.taskPrompt || "").trim();
  return [
    `附件：${params.markdownFileName}`,
    `原文链接：${safeUrl}`,
    `用户要求：${userPrompt || "请阅读附件并按需求处理。"}`,
  ].join("\n");
}

function resolveAgentId(params: {
  agents: ConsoleUiAgentOption[];
  preferredAgentId: string;
  selectedAgentId: string;
}): string {
  const candidateList = [
    params.preferredAgentId,
    params.selectedAgentId,
    ...(params.agents.filter((item) => item.running).map((item) => item.id)),
    ...(params.agents.map((item) => item.id)),
  ];

  for (const id of candidateList) {
    const normalized = String(id || "").trim();
    if (!normalized) continue;
    if (params.agents.some((item) => item.id === normalized)) {
      return normalized;
    }
  }

  return "";
}

function resolveChatKey(options: ChatKeyOption[], preferredChatKey: string): string {
  const preferred = String(preferredChatKey || "").trim();
  if (preferred && options.some((item) => item.chatKey === preferred)) {
    return preferred;
  }
  return options[0]?.chatKey || "";
}

function resolveLinkedChannels(
  agent: ConsoleUiAgentOption | null | undefined,
): Set<"telegram" | "feishu" | "qq"> {
  const out = new Set<"telegram" | "feishu" | "qq">();
  const profiles = Array.isArray(agent?.chatProfiles) ? agent?.chatProfiles : [];
  for (const profile of profiles) {
    const channel = String(profile?.channel || "").trim().toLowerCase();
    const linkState = String(profile?.linkState || "").trim().toLowerCase();
    if (linkState !== "connected") continue;
    if (channel === "telegram" || channel === "feishu" || channel === "qq") {
      out.add(channel);
    }
  }
  return out;
}

function clearChatLoadRelatedErrorStatus(
  setStatus: Dispatch<SetStateAction<StatusMessage>>,
): void {
  setStatus((prev) => {
    if (prev.type !== "error") return prev;
    if (!/chatkey|channel\s*chat|会话|chat\s*渠道|已连接渠道/i.test(String(prev.text || ""))) {
      return prev;
    }
    return { type: "idle", text: "准备就绪" };
  });
}

function shortenUrl(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "（当前页面 URL 不可用）";
  if (text.length <= 72) return text;
  return `${text.slice(0, 69)}...`;
}

function shortenAsk(value: string): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= 60) return text;
  return `${text.slice(0, 57)}...`;
}

function normalizeInitialTaskPrompt(value: string): string {
  const incoming = String(value || "").trim();
  const defaultPrompt = String(DEFAULT_SETTINGS.taskPrompt || "").trim();
  if (!incoming) return "";
  if (incoming === defaultPrompt) return "";
  return incoming;
}

type ToastMessage = {
  /** Toast 类型（中文）：成功或失败。 */
  type: "success" | "error";
  /** Toast 文本（中文）：展示给用户的提示内容。 */
  text: string;
};

export function App() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<ActiveTabContext>({
    tabId: null,
    title: "加载中...",
    url: "",
  });

  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [chatKeyOptions, setChatKeyOptions] = useState<ChatKeyOption[]>([]);
  const [askHistory, setAskHistory] = useState<string[]>([]);
  const [selectedAskHistoryIndex, setSelectedAskHistoryIndex] = useState("");

  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingChatKeys, setIsLoadingChatKeys] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const consoleEndpoint = useMemo(
    () => resolveConsoleBaseUrl(settings),
    [settings],
  );
  const consoleBaseUrl = consoleEndpoint.baseUrl;

  const showToast = useCallback((type: ToastMessage["type"], text: string): void => {
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

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === settings.agentId) || null,
    [agents, settings.agentId],
  );
  const linkedChannels = useMemo(
    () => resolveLinkedChannels(selectedAgent),
    [selectedAgent],
  );

  const refreshAskHistory = useCallback(async () => {
    try {
      const history = await loadRecentAskHistory({ limit: 12 });
      setAskHistory(history);
    } catch {
      setAskHistory([]);
    }
  }, []);

  const refreshAgents = useCallback(async (params: {
    preferredAgentId: string;
    consoleBaseUrl: string;
  }) => {
    if (!params.consoleBaseUrl) {
      setStatus({
        type: "error",
        text: "Console 地址无效，请检查 Console 是否已启动",
      });
      return;
    }

    setIsLoadingAgents(true);
    try {
      const payload = await fetchAgents({
        consoleBaseUrl: params.consoleBaseUrl,
      });
      const list = payload.agents || [];
      setAgents(list);

      const nextAgentId = resolveAgentId({
        agents: list,
        preferredAgentId: params.preferredAgentId,
        selectedAgentId: payload.selectedAgentId,
      });

      setSettings((prev) => ({
        ...prev,
        agentId: nextAgentId,
      }));

      if (list.length < 1) {
        setStatus({ type: "error", text: "未发现可用 Agent，请先启动 `city agent start`" });
      } else {
        setStatus({ type: "idle", text: "准备就绪" });
      }
    } catch (error) {
      setStatus({
        type: "error",
        text: `加载 Agent 失败：${readErrorText(error)}`,
      });
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  const refreshChatKeys = useCallback(
    async (
      agentId: string,
      preferredChatKey: string,
      allowedChannels: Set<"telegram" | "feishu" | "qq">,
      baseUrl: string,
    ) => {
      if (!baseUrl) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        clearChatLoadRelatedErrorStatus(setStatus);
        return;
      }

      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        clearChatLoadRelatedErrorStatus(setStatus);
        return;
      }

      setIsLoadingChatKeys(true);
      try {
        const options = await fetchChatKeyOptions(normalizedAgentId, {
          consoleBaseUrl: baseUrl,
        });
        const filtered =
          allowedChannels.size > 0
            ? options.filter((item) => allowedChannels.has(item.channel))
            : [];

        setChatKeyOptions(filtered);

        const nextChatKey = resolveChatKey(filtered, preferredChatKey);
        setSettings((prev) => ({
          ...prev,
          chatKey: nextChatKey,
        }));

        if (allowedChannels.size === 0) {
          clearChatLoadRelatedErrorStatus(setStatus);
          return;
        }

        if (filtered.length === 0) {
          setStatus({
            type: "error",
            text: "已连接渠道中暂无可用 Channel Chat，请先让该渠道收到过消息。",
          });
          return;
        }

        clearChatLoadRelatedErrorStatus(setStatus);
      } catch (error) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        setStatus({
          type: "error",
          text: `加载 Channel Chat 失败：${readErrorText(error)}`,
        });
      } finally {
        setIsLoadingChatKeys(false);
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const [saved, activeTab] = await Promise.all([
          loadSettings(),
          getActiveTabContext(),
        ]);

        if (!isMounted) return;

        setSettings({
          ...saved,
          taskPrompt: normalizeInitialTaskPrompt(saved.taskPrompt),
        });
        setTab(activeTab);

        const endpoint = resolveConsoleBaseUrl(saved);
        if (!endpoint.baseUrl) {
          setStatus({
            type: "error",
            text: endpoint.errorText || "Console 地址无效，请检查 Console 是否已启动",
          });
        } else {
          await refreshAgents({
            preferredAgentId: saved.agentId,
            consoleBaseUrl: endpoint.baseUrl,
          });
        }

        await refreshAskHistory();
      } catch (error) {
        if (!isMounted) return;
        setStatus({
          type: "error",
          text: `初始化失败：${readErrorText(error)}`,
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [refreshAgents, refreshAskHistory]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void refreshChatKeys(
      settings.agentId,
      settings.chatKey,
      linkedChannels,
      consoleBaseUrl,
    );
  }, [
    settings.agentId,
    settings.chatKey,
    linkedChannels,
    refreshChatKeys,
    consoleBaseUrl,
  ]);

  const applyAskHistoryByIndex = useCallback((indexText: string) => {
    const normalized = String(indexText || "").trim();
    setSelectedAskHistoryIndex(normalized);

    if (!normalized) {
      return;
    }

    const index = Number.parseInt(normalized, 10);
    if (!Number.isFinite(index) || Number.isNaN(index)) {
      return;
    }

    const selected = askHistory[index];
    if (!selected) {
      return;
    }

    setSettings((prev) => ({
      ...prev,
      taskPrompt: selected,
    }));
    setStatus({ type: "idle", text: "已填入历史 ask" });
  }, [askHistory]);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const agentId = String(settings.agentId || "").trim();
      const chatKey = String(settings.chatKey || "").trim();
      const taskPrompt = String(settings.taskPrompt || "").trim();
      const activeConsoleBaseUrl = resolveConsoleBaseUrl(settings).baseUrl;

      if (!agentId) {
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
      if (!chatKey) {
        const message = "请选择 Channel Chat";
        setStatus({ type: "error", text: message });
        showToast("error", message);
        return;
      }
      if (!taskPrompt) {
        const message = "Ask 不能为空";
        setStatus({ type: "error", text: message });
        showToast("error", message);
        return;
      }
      if (!activeConsoleBaseUrl) {
        const message = "Console 地址无效，请检查 Console 是否已启动";
        setStatus({ type: "error", text: message });
        showToast("error", message);
        return;
      }

      const nextSettings: ExtensionSettings = {
        ...settings,
        consoleHost: String(settings.consoleHost || "").trim(),
        consolePort: Number(settings.consolePort),
        agentId,
        chatKey,
        taskPrompt,
      };

      setIsSubmitting(true);
      setStatus({ type: "loading", text: "任务投递中..." });

      try {
        await saveSettings(nextSettings);

        setStatus({ type: "loading", text: "正在提取页面正文..." });
        const markdownSnapshot = await buildPageMarkdownSnapshot(tab);

        setStatus({ type: "loading", text: "正在上传 Markdown 附件..." });
        const accepted = dispatchAgentTask({
          consoleBaseUrl: activeConsoleBaseUrl,
          agentId,
          contextId: chatKey,
          body: {
            instructions: buildInstructions({
              tab,
              taskPrompt,
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
        if (!accepted) {
          throw new Error("任务投递失败，请稍后重试");
        }

        try {
          await appendPageSendRecord({
            pageUrl: tab.url,
            pageTitle: tab.title,
            agentId,
            chatKey,
            taskPrompt,
            attachmentFileName: markdownSnapshot.fileName,
          });
          await refreshAskHistory();
        } catch {
          // ignore local history failures
        }

        const message = "已发送，任务已进入队列。";
        setStatus({ type: "success", text: message });
        showToast("success", "发送成功");
      } catch (error) {
        const message = `发送失败：${readErrorText(error)}`;
        setStatus({
          type: "error",
          text: message,
        });
        showToast("error", message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshAskHistory, selectedAgent?.running, settings, showToast, tab],
  );

  const onTaskPromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key !== "Enter") return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      if (isSubmitting) return;
      formRef.current?.requestSubmit();
    },
    [isSubmitting],
  );

  return (
    <main className="popup-root">
      <header className="popup-header">
        <div className="popup-title">Downcity Share</div>
      </header>

      <div className={`popup-status status-${status.type}`} aria-live="polite">
        {status.text}
      </div>

      <form ref={formRef} className="popup-form" onSubmit={onSubmit}>
        <div className="field-grid">
          <label>
            Agent
            <select
              value={settings.agentId}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  agentId: event.target.value,
                  chatKey: "",
                }))
              }
              disabled={isLoadingAgents}
            >
              <option value="">{isLoadingAgents ? "加载 Agent 中..." : "请选择 Agent"}</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                  {agent.running ? "" : "（未运行）"}
                </option>
              ))}
            </select>
          </label>

          <label>
            Channel Chat
            <select
              value={settings.chatKey}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  chatKey: event.target.value,
                }))
              }
              disabled={chatKeyOptions.length === 0 || isLoadingChatKeys}
            >
              <option value="">
                {isLoadingChatKeys ? "加载 Channel Chat 中..." : "请选择 Channel Chat"}
              </option>
              {chatKeyOptions.map((option) => (
                <option key={option.chatKey} value={option.chatKey}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Ask 历史
          <select
            value={selectedAskHistoryIndex}
            onChange={(event) => applyAskHistoryByIndex(event.target.value)}
            disabled={askHistory.length < 1}
          >
            <option value="">{askHistory.length < 1 ? "暂无历史 ask" : "选择历史 ask"}</option>
            {askHistory.map((item, index) => (
              <option key={`${index}-${item.slice(0, 20)}`} value={String(index)}>
                {shortenAsk(item)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ask
          <textarea
            rows={6}
            value={settings.taskPrompt}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, taskPrompt: event.target.value }))
            }
            onKeyDown={onTaskPromptKeyDown}
            placeholder="例如：提炼这篇页面内容，给我 3 条可执行建议。"
          />
        </label>

        <div className="page-ref" title={tab.url}>
          {tab.title || "（未获取到页面标题）"}
          <span>{shortenUrl(tab.url)}</span>
        </div>

        <button className="primary-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "发送中..." : "发送到 Agent"}
        </button>
      </form>

      {toast ? (
        <div className="popup-toast" data-type={toast.type} role="status" aria-live="polite">
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
