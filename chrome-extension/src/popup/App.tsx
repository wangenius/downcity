/**
 * Popup 主界面。
 *
 * 关键点（中文）：
 * - 只保留极简发送主链路：Agent 切换、Ask 输入、发送按钮。
 * - Chat 不在 popup 中显式展示，始终自动使用当前 Agent 的首个可用会话。
 * - 展示当前页面发送历史，并提供设置入口跳转到 options 页面。
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
import type { ChatKeyOption, ConsoleUiAgentOption } from "../types/api";
import type { PopupSelectOption } from "../types/PopupSelect";
import type {
  ActiveTabContext,
  ExtensionPageSendRecord,
  ExtensionSettings,
  StatusMessage,
} from "../types/extension";
import {
  dispatchAgentTask,
  fetchAgents,
  fetchChatKeyOptions,
} from "../services/downcityApi";
import { resolveAgentId, resolveChatKey, resolveLinkedChannels } from "../services/chatRouting";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import {
  appendPageSendRecord,
  DEFAULT_SETTINGS,
  loadSettings,
  loadPageSendRecords,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext } from "../services/tab";
import {
  buildPopupInstructions,
  formatHistoryTime,
  getToastToneClass,
  normalizeInitialTaskPrompt,
  readErrorText,
  resolvePopupConsoleBaseUrl,
  shortenUrl,
  type PopupToastMessage,
} from "./helpers";
import { PopupSelect } from "./PopupSelect";

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
  const [pageHistory, setPageHistory] = useState<ExtensionPageSendRecord[]>([]);

  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingChatKeys, setIsLoadingChatKeys] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<PopupToastMessage | null>(null);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const consoleEndpoint = resolvePopupConsoleBaseUrl(settings);
  const consoleBaseUrl = consoleEndpoint.baseUrl;

  const showToast = useCallback((type: PopupToastMessage["type"], text: string): void => {
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

  const selectedAgent = agents.find((item) => item.id === settings.agentId) || null;
  const linkedChannels = useMemo(
    () => resolveLinkedChannels(selectedAgent),
    [selectedAgent],
  );
  const chatOptions = useMemo<PopupSelectOption[]>(
    () =>
      chatKeyOptions.map((item) => ({
        value: item.chatKey,
        label: item.title,
        description: item.subtitle,
      })),
    [chatKeyOptions],
  );
  const linkedChannelKey = useMemo(
    () => Array.from(linkedChannels).sort().join(","),
    [linkedChannels],
  );

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
        setStatus((prev) => (prev.type === "error" ? prev : { type: "idle", text: "准备就绪" }));
        return;
      }

      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        setStatus((prev) => (prev.type === "error" ? prev : { type: "idle", text: "准备就绪" }));
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
          setStatus((prev) => (prev.type === "error" ? prev : { type: "idle", text: "准备就绪" }));
          return;
        }

        if (filtered.length === 0) {
          setStatus({
            type: "error",
            text: "已连接渠道中暂无可用 Channel Chat，请先让该渠道收到过消息。",
          });
          return;
        }

        setStatus((prev) => (prev.type === "loading" ? prev : { type: "idle", text: "准备就绪" }));
      } catch (error) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        const errorText = readErrorText(error);
        if (/failed to fetch/i.test(errorText)) {
          setStatus((prev) =>
            prev.type === "loading" ? { type: "idle", text: "准备就绪" } : prev,
          );
          return;
        }
        setStatus({
          type: "error",
          text: `加载 Channel Chat 失败：${errorText}`,
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
        if (activeTab.url) {
          const records = await loadPageSendRecords({
            pageUrl: activeTab.url,
            limit: 8,
          });
          if (isMounted) {
            setPageHistory(records);
          }
        }

        const endpoint = resolvePopupConsoleBaseUrl(saved);
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
  }, [refreshAgents]);

  const refreshPageHistory = useCallback(async (pageUrl: string) => {
    const records = await loadPageSendRecords({
      pageUrl,
      limit: 8,
    });
    setPageHistory(records);
  }, []);

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
    refreshChatKeys,
    consoleBaseUrl,
    linkedChannelKey,
  ]);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const agentId = String(settings.agentId || "").trim();
      const chatKey = String(settings.chatKey || "").trim();
      const taskPrompt = String(settings.taskPrompt || "").trim();
      const activeConsoleBaseUrl = resolvePopupConsoleBaseUrl(settings).baseUrl;

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
        const message = "请先点击设置，选择目标 Channel Chat";
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
            instructions: buildPopupInstructions({
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
          await refreshPageHistory(tab.url);
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
    [refreshPageHistory, selectedAgent?.running, settings, showToast, tab],
  );

  const cycleAgent = useCallback(
    (direction: -1 | 1) => {
      if (agents.length < 2) return;
      const currentIndex = agents.findIndex((item) => item.id === settings.agentId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + agents.length) % agents.length;
      const nextAgent = agents[nextIndex];
      if (!nextAgent) return;
      setSettings((prev) => ({
        ...prev,
        agentId: nextAgent.id,
        chatKey: "",
      }));
    },
    [agents, settings.agentId],
  );

  const openSettingsPage = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

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
    <main className="relative min-h-[520px] w-[380px] bg-background p-3 text-foreground">
      <section className="rounded-[12px] border border-border bg-surface p-3">
        <header className="mb-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-border bg-muted px-1 py-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-[15px] font-medium text-muted-foreground transition-all hover:border-border hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => cycleAgent(-1)}
              disabled={agents.length < 2 || isLoadingAgents}
              aria-label="上一个 Agent"
            >
              ‹
            </button>
            <div className="min-w-0 flex-1 px-2 text-center">
              <div className="truncate text-[12px] font-medium">
                {isLoadingAgents
                  ? "加载 Agent 中..."
                  : selectedAgent?.name || "未选择 Agent"}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {selectedAgent
                  ? selectedAgent.running
                    ? isLoadingChatKeys
                      ? "会话加载中..."
                      : settings.chatKey
                        ? "目标会话已设置"
                        : chatKeyOptions.length === 1
                          ? "已自动选择唯一会话"
                          : chatKeyOptions.length > 1
                            ? "请在下方选择会话"
                            : "暂无可用会话"
                    : "Agent 未运行"
                  : "请在设置中检查连接"}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-[15px] font-medium text-muted-foreground transition-all hover:border-border hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => cycleAgent(1)}
              disabled={agents.length < 2 || isLoadingAgents}
              aria-label="下一个 Agent"
            >
              ›
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-border bg-[linear-gradient(180deg,#ffffff_0%,#f4f4f5_100%)] text-[14px] text-[#3f3f46] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_6px_18px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-[1px] hover:border-[#cfcfd4] hover:text-foreground"
            onClick={openSettingsPage}
            aria-label="打开设置"
            title="设置"
          >
            ⚙
          </button>
        </header>

        <form ref={formRef} className="flex flex-col gap-3" onSubmit={onSubmit}>
          <textarea
            className="min-h-[164px] w-full resize-none rounded-[11px] border border-border bg-muted px-3 py-3 text-[13px] leading-[1.55] text-foreground outline-none transition focus:border-[#d9d9de] focus:bg-surface focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
            rows={7}
            value={settings.taskPrompt}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, taskPrompt: event.target.value }))
            }
            onKeyDown={onTaskPromptKeyDown}
            placeholder="输入要发送给 Agent 的内容"
          />

          <PopupSelect
            label="Channel Chat"
            value={settings.chatKey}
            placeholder={
              !settings.agentId
                ? "请先选择 Agent"
                : isLoadingChatKeys
                  ? "加载 Chat 中..."
                  : chatOptions.length > 0
                    ? "请选择目标 Channel Chat"
                    : "暂无可用 Channel Chat"
            }
            options={chatOptions}
            onChange={(value) =>
              setSettings((prev) => ({
                ...prev,
                chatKey: value,
              }))
            }
            disabled={!settings.agentId || isLoadingChatKeys || chatOptions.length === 0}
          />

          <div className="rounded-[10px] border border-border bg-muted px-3 py-2 text-[10px] leading-[1.45] text-muted-foreground">
            <div className="truncate text-[11px] text-foreground" title={tab.title}>
              {tab.title || "（未获取到页面标题）"}
            </div>
            <div className="truncate" title={tab.url}>
              {shortenUrl(tab.url)}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div
              className={[
                "min-w-0 flex-1 truncate text-[10px]",
                status.type === "error"
                  ? "text-[#7f1d1d]"
                  : status.type === "success"
                    ? "text-[#166534]"
                    : status.type === "loading"
                      ? "text-[#9a6700]"
                      : "text-muted-foreground",
              ].join(" ")}
              aria-live="polite"
            >
              {status.text}
            </div>
            <button
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[12px] border border-[#111114] bg-[linear-gradient(180deg,#2f2f35_0%,#151519_100%)] px-4 text-[12px] font-semibold tracking-[0.01em] text-white shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_24px_rgba(15,23,42,0.22)] transition-all hover:-translate-y-[1px] hover:bg-[linear-gradient(180deg,#3a3a42_0%,#19191d_100%)] disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "发送中..." : "发送"}
            </button>
          </div>
        </form>
      </section>

      {pageHistory.length > 0 ? (
        <section className="mt-3 rounded-[12px] border border-border bg-surface p-3">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-medium text-foreground">本页发送历史</h2>
            <span className="text-[10px] text-muted-foreground">
              {pageHistory.length} 条
            </span>
          </header>

          <div className="flex flex-col gap-2">
            {pageHistory.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full flex-col gap-1 rounded-[10px] border border-border bg-muted px-3 py-2 text-left transition hover:bg-background"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    taskPrompt: item.taskPrompt,
                    agentId: item.agentId || prev.agentId,
                    chatKey: "",
                  }))
                }
              >
                <div className="line-clamp-2 text-[12px] leading-[1.45] text-foreground">
                  {item.taskPrompt || "（空内容）"}
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="truncate">{formatHistoryTime(item.sentAt)}</span>
                  <span className="truncate">
                    {agents.find((agent) => agent.id === item.agentId)?.name || item.agentId}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {toast ? (
        <div
          className={[
            "fixed top-3 left-1/2 z-20 max-w-[calc(100vw-28px)] -translate-x-1/2 rounded-[11px] border px-3 py-2 text-[11px] font-medium leading-[1.45] shadow-soft",
            getToastToneClass(toast.type),
          ].join(" ")}
          data-type={toast.type}
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      ) : null}
    </main>
  );
}
