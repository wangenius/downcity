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
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";
import type { ChatKeyOption, ConsoleUiAgentOption } from "../types/api";
import type { PopupSelectOption } from "../types/PopupSelect";
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
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getActiveTabContext } from "../services/tab";
import { PopupSelect } from "./PopupSelect";

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
    `我浏览到了这个网页，${safeUrl}， 网页的内容保存到了（可能保存下来的有问题）：${params.markdownFileName}`,
    `${userPrompt || "请阅读附件并按需求处理。"}`,
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

function getToastToneClass(type: ToastMessage["type"]): string {
  return type === "error"
    ? "border-[#d9b2ae] bg-[#faf5f5] text-[#7f1d1d]"
    : "border-border bg-surface text-foreground";
}

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
  const agentOptions = useMemo<PopupSelectOption[]>(
    () =>
      agents.map((agent) => ({
        value: agent.id,
        label: agent.name,
        description: agent.running ? "在线" : "未运行",
        disabled: false,
      })),
    [agents],
  );
  const chatOptions = useMemo<PopupSelectOption[]>(
    () =>
      chatKeyOptions.map((option) => ({
        value: option.chatKey,
        label: option.title,
        description: option.subtitle,
      })),
    [chatKeyOptions],
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

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
    [selectedAgent?.running, settings, showToast, tab],
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
    <main className="relative min-h-[470px] w-[380px] bg-background p-3">
      <section className="rounded-[12px] border border-border bg-surface p-3">
        <header className="mb-3 flex items-center justify-between border-b border-border pb-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Web Share
          </span>
          <span
            className={[
              "inline-flex max-w-[190px] items-center gap-1.5 truncate text-[10px] font-medium",
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
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            <span className="truncate">{status.text}</span>
          </span>
        </header>

        <form ref={formRef} className="flex flex-col gap-3" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1 text-[10px] font-medium tracking-[0.04em] text-muted-foreground">
            Ask
            <textarea
              className="w-full min-h-[150px] resize-none rounded-[11px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-[#d9d9de] focus:bg-surface focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60 leading-[1.55]"
              rows={6}
              value={settings.taskPrompt}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, taskPrompt: event.target.value }))
              }
              onKeyDown={onTaskPromptKeyDown}
              placeholder="Ask for follow-up changes"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <PopupSelect
              label="Agent"
              value={settings.agentId}
              placeholder={
                isLoadingAgents
                  ? "加载 Agent 中..."
                  : agents.length < 1
                    ? "没有可用 Agent"
                    : "请选择 Agent"
              }
              options={agentOptions}
              onChange={(value) =>
                setSettings((prev) => ({
                  ...prev,
                  agentId: value,
                  chatKey: "",
                }))
              }
              disabled={isLoadingAgents}
            />

            <PopupSelect
              label="Chat"
              value={settings.chatKey}
              placeholder={
                !settings.agentId
                  ? "请先选择 Agent"
                  : isLoadingChatKeys
                    ? "加载 Chat 中..."
                    : chatOptions.length < 1
                      ? "当前 Agent 暂无 Chat"
                      : "请选择 Chat"
              }
              options={chatOptions}
              onChange={(value) =>
                setSettings((prev) => ({
                  ...prev,
                  chatKey: value,
                }))
              }
              disabled={chatOptions.length === 0 || isLoadingChatKeys}
            />
          </div>

          <div className="border-t border-border pt-2 text-[10px] leading-[1.45] text-muted-foreground">
            <div className="truncate text-[11px] text-foreground" title={tab.title}>
              {tab.title || "（未获取到页面标题）"}
            </div>
            <div className="truncate text-[10px]" title={tab.url}>
              {shortenUrl(tab.url)}
            </div>
          </div>

          <button
            className="inline-flex h-10 items-center justify-center rounded-[10px] border border-primary bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "发送中..." : "发送到 Agent"}
          </button>
        </form>
      </section>

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
