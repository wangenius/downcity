/**
 * Popup 主界面。
 *
 * 关键点（中文）：
 * - popup 只保留发送主流程，设置项统一迁移到独立 options 页面。
 * - 顶部状态点用于提示当前状态，避免打断主操作。
 * - 支持常用问题模板快速填入，减少重复输入。
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
  ExtensionPageSendRecord,
  ExtensionQuickPromptItem,
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
  loadPageSendRecords,
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

function shortenUrl(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "（当前页面 URL 不可用）";
  if (text.length <= 66) return text;
  return `${text.slice(0, 63)}...`;
}

function shortenText(value: string, maxChars: number): string {
  const text = String(value || "").trim();
  if (!text) return "（无任务说明）";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function formatSentTime(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || Number.isNaN(value)) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
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

function getQuickPromptById(
  prompts: ExtensionQuickPromptItem[],
  id: string,
): ExtensionQuickPromptItem | null {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;
  return prompts.find((item) => item.id === normalizedId) || null;
}

export function App() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [selectedQuickPromptId, setSelectedQuickPromptId] = useState("");

  const [tab, setTab] = useState<ActiveTabContext>({
    tabId: null,
    title: "加载中...",
    url: "",
  });
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [chatKeyOptions, setChatKeyOptions] = useState<ChatKeyOption[]>([]);
  const [pageSendRecords, setPageSendRecords] = useState<ExtensionPageSendRecord[]>([]);

  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingChatKeys, setIsLoadingChatKeys] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const consoleEndpoint = useMemo(
    () => resolveConsoleBaseUrl(settings),
    [settings],
  );
  const consoleBaseUrl = consoleEndpoint.baseUrl;

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === settings.agentId) || null,
    [agents, settings.agentId],
  );
  const linkedChannels = useMemo(
    () => resolveLinkedChannels(selectedAgent),
    [selectedAgent],
  );
  const selectedQuickPrompt = useMemo(
    () => getQuickPromptById(settings.quickPrompts, selectedQuickPromptId),
    [settings.quickPrompts, selectedQuickPromptId],
  );

  const refreshPageSendHistory = useCallback(async (pageUrl: string) => {
    const safeUrl = String(pageUrl || "").trim();
    if (!safeUrl) {
      setPageSendRecords([]);
      return;
    }
    try {
      const records = await loadPageSendRecords({ pageUrl: safeUrl, limit: 8 });
      setPageSendRecords(records);
    } catch {
      setPageSendRecords([]);
    }
  }, []);

  const refreshAgents = useCallback(async (params: {
    preferredAgentId: string;
    consoleBaseUrl: string;
  }) => {
    if (!params.consoleBaseUrl) {
      setStatus({
        type: "error",
        text: "Console 地址无效，请在设置页检查目标 IP 与端口",
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

      if (list.length === 0) {
        setStatus({ type: "error", text: "未发现可用 Agent，请先启动 `city agent start`" });
      } else {
        setStatus({ type: "idle", text: "Agent 列表已刷新" });
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
        setSettings(saved);
        setTab(activeTab);

        const preferredQuickPromptId =
          saved.defaultQuickPromptId || saved.quickPrompts[0]?.id || "";
        setSelectedQuickPromptId(preferredQuickPromptId);

        const endpoint = resolveConsoleBaseUrl(saved);
        if (!endpoint.baseUrl) {
          setStatus({
            type: "error",
            text: endpoint.errorText || "Console 地址无效，请在设置页检查配置",
          });
        } else {
          await refreshAgents({
            preferredAgentId: saved.agentId,
            consoleBaseUrl: endpoint.baseUrl,
          });
        }

        await refreshPageSendHistory(activeTab.url);
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
  }, [refreshAgents, refreshPageSendHistory]);

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

  useEffect(() => {
    void refreshPageSendHistory(tab.url);
  }, [tab.url, refreshPageSendHistory]);

  useEffect(() => {
    if (settings.quickPrompts.length === 0) {
      setSelectedQuickPromptId("");
      return;
    }
    const exists = settings.quickPrompts.some((item) => item.id === selectedQuickPromptId);
    if (exists) return;
    setSelectedQuickPromptId(settings.defaultQuickPromptId || settings.quickPrompts[0].id);
  }, [selectedQuickPromptId, settings.defaultQuickPromptId, settings.quickPrompts]);

  const openSettingsPage = useCallback(() => {
    if (typeof chrome.runtime.openOptionsPage === "function") {
      chrome.runtime.openOptionsPage(() => {
        const error = chrome.runtime.lastError;
        if (error) {
          setStatus({ type: "error", text: `打开设置页失败：${error.message}` });
          return;
        }
        setStatus({ type: "idle", text: "已打开设置页" });
      });
      return;
    }

    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        setStatus({ type: "error", text: `打开设置页失败：${error.message}` });
        return;
      }
      setStatus({ type: "idle", text: "已打开设置页" });
    });
  }, []);

  const applySelectedQuickPrompt = useCallback(() => {
    if (!selectedQuickPrompt) {
      setStatus({ type: "error", text: "请先选择常用问题模板" });
      return;
    }
    setSettings((prev) => ({
      ...prev,
      taskPrompt: selectedQuickPrompt.prompt,
    }));
    setStatus({ type: "idle", text: `已填入模板：${selectedQuickPrompt.title}` });
  }, [selectedQuickPrompt]);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const agentId = String(settings.agentId || "").trim();
      const chatKey = String(settings.chatKey || "").trim();
      const taskPrompt = String(settings.taskPrompt || "").trim();
      const activeConsoleBaseUrl = resolveConsoleBaseUrl(settings).baseUrl;

      if (!agentId) {
        setStatus({ type: "error", text: "请选择目标 Agent" });
        return;
      }
      if (!selectedAgent?.running) {
        setStatus({ type: "error", text: "目标 Agent 未运行，请先启动后再试" });
        return;
      }
      if (!chatKey) {
        setStatus({ type: "error", text: "请选择 Channel Chat" });
        return;
      }
      if (!taskPrompt) {
        setStatus({ type: "error", text: "任务说明不能为空" });
        return;
      }
      if (!activeConsoleBaseUrl) {
        setStatus({ type: "error", text: "Console 地址无效，请在设置页检查目标 IP 与端口" });
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
          await refreshPageSendHistory(tab.url);
        } catch {
          // ignore local history failures
        }

        setStatus({ type: "success", text: "已发送，任务已进入队列。" });
      } catch (error) {
        setStatus({
          type: "error",
          text: `发送失败：${readErrorText(error)}`,
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshPageSendHistory, selectedAgent?.running, settings, tab],
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
      <header className="header-card">
        <div className="brand-block">
          <img className="brand-logo" src="/icon-32.png" alt="Downcity logo" />
          <h1>Downcity Share</h1>
        </div>
        <button
          className="ghost-btn settings-btn"
          type="button"
          onClick={openSettingsPage}
          disabled={isSubmitting}
        >
          设置
        </button>
      </header>

      <div className={`status-inline status-${status.type}`} aria-live="polite">
        <span className="status-dot" />
        <span>{status.text}</span>
      </div>

      <form ref={formRef} className="share-form" onSubmit={onSubmit}>
        <section className="selector-grid" aria-label="目标选择">
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
            >
              <option value="">请选择 Agent</option>
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
        </section>

        <section className="compose-card" aria-label="页面与任务输入">
          <div className="compose-header">
            <div className="compose-quote-mark">“</div>
            <div className="compose-meta">
              <div className="page-title" title={tab.title}>
                {tab.title || "（未获取到页面标题）"}
              </div>
              <a href={tab.url || "#"} title={tab.url} className="page-link">
                {shortenUrl(tab.url)}
              </a>
            </div>
          </div>

          <div className="quick-row" aria-label="常用问题模板">
            <select
              value={selectedQuickPromptId}
              onChange={(event) => setSelectedQuickPromptId(event.target.value)}
              disabled={settings.quickPrompts.length === 0}
            >
              <option value="">{settings.quickPrompts.length > 0 ? "选择常用问题" : "暂无模板"}</option>
              {settings.quickPrompts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button
              className="ghost-btn"
              type="button"
              onClick={applySelectedQuickPrompt}
              disabled={!selectedQuickPrompt}
            >
              快速填入
            </button>
          </div>

          <label className="compose-label">
            <textarea
              rows={5}
              value={settings.taskPrompt}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, taskPrompt: event.target.value }))
              }
              onKeyDown={onTaskPromptKeyDown}
              placeholder="例如：提炼这篇页面内容，给我 3 条可执行建议。"
            />
            <div className="field-hint">快捷发送：Cmd/Ctrl + Enter</div>
          </label>
        </section>

        <button className="primary-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "发送中..." : "发送到 Agent"}
        </button>
      </form>

      {pageSendRecords.length > 0 ? (
        <section className="panel-card history-card" aria-label="当前页面发送记录">
          <div className="panel-title">当前页面发送记录</div>
          <ul className="history-list">
            {pageSendRecords.map((record) => (
              <li key={record.id} className="history-item">
                <div className="history-meta">
                  <span>{formatSentTime(record.sentAt)}</span>
                  <span className="history-badge">已发送</span>
                </div>
                <div className="history-text">{shortenText(record.taskPrompt, 80)}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
