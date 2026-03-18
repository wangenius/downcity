/**
 * Popup 主界面。
 *
 * 关键点（中文）：
 * - 支持选择 Agent、选择 chatKey、补充任务说明。
 * - 发送前先把当前页面正文转换为 Markdown 附件。
 * - 投递成功后关闭 popup，执行结果在所选 chatKey 会话查看。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatKeyOption, ConsoleUiAgentOption } from "../types/api";
import type {
  ActiveTabContext,
  ExtensionSettings,
  StatusMessage,
} from "../types/extension";
import {
  dispatchAgentTask,
  fetchAgents,
  fetchChatKeyOptions,
} from "../services/shipmyagentApi";
import { buildPageMarkdownSnapshot } from "../services/pageMarkdown";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../services/storage";
import { getActiveTabContext } from "../services/tab";

function readErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

function buildInstructions(params: {
  tab: ActiveTabContext;
  taskPrompt: string;
  chatKey: string;
  markdownFileName: string;
}): string {
  const safeUrl = params.tab.url || "（当前页面 URL 不可用）";
  return [
    "你收到一个来自 Chrome 插件的网页分享任务。",
    `页面标题：${params.tab.title}`,
    `页面链接：${safeUrl}`,
    `页面正文附件：${params.markdownFileName}`,
    `当前会话 chatKey：${params.chatKey}`,
    "",
    "用户补充要求：",
    params.taskPrompt.trim(),
    "",
    "执行要求：",
    "1) 先阅读附件中的 Markdown 正文，再进行分析。",
    "2) 最终结果直接回复在当前会话，不要切换到其他 channel / chatKey。",
    "3) 若附件内容与页面标题冲突，以附件正文为准。",
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

export function App() {
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
  const [isConsoleOnline, setIsConsoleOnline] = useState(false);
  const [status, setStatus] = useState<StatusMessage>({
    type: "idle",
    text: "准备就绪",
  });

  const selectedAgent = useMemo(
    () => agents.find((item) => item.id === settings.agentId) || null,
    [agents, settings.agentId],
  );

  const selectedChatKeyOption = useMemo(
    () => chatKeyOptions.find((item) => item.chatKey === settings.chatKey) || null,
    [chatKeyOptions, settings.chatKey],
  );
  const linkedChannels = useMemo(
    () => resolveLinkedChannels(selectedAgent),
    [selectedAgent],
  );

  const refreshAgents = useCallback(async (preferredAgentId: string) => {
    setIsLoadingAgents(true);
    try {
      const payload = await fetchAgents();
      setIsConsoleOnline(true);
      const list = payload.agents || [];
      setAgents(list);

      const nextAgentId = resolveAgentId({
        agents: list,
        preferredAgentId,
        selectedAgentId: payload.selectedAgentId,
      });

      setSettings((prev) => ({
        ...prev,
        agentId: nextAgentId,
      }));

      if (list.length === 0) {
        setStatus({ type: "error", text: "未发现可用 Agent，请先启动 `sma agent start`" });
      } else {
        setStatus({ type: "idle", text: "Agent 列表已刷新" });
      }
    } catch (error) {
      setIsConsoleOnline(false);
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
    ) => {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        return;
      }

      setIsLoadingChatKeys(true);
      try {
        const options = await fetchChatKeyOptions(normalizedAgentId);
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
          setStatus({
            type: "error",
            text: "该 Agent 暂无已连接的 chat 渠道。",
          });
          return;
        }

        if (filtered.length === 0) {
          setStatus({
            type: "error",
            text: "已连接渠道中暂无可用 chatKey，请先让该渠道收到过消息。",
          });
        }
      } catch (error) {
        setChatKeyOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        setStatus({
          type: "error",
          text: `加载 chatKey 失败：${readErrorText(error)}`,
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

        await refreshAgents(saved.agentId);
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
    void refreshChatKeys(settings.agentId, settings.chatKey, linkedChannels);
  }, [settings.agentId, refreshChatKeys, linkedChannels]);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const agentId = String(settings.agentId || "").trim();
      const chatKey = String(settings.chatKey || "").trim();
      const taskPrompt = String(settings.taskPrompt || "").trim();

      if (!agentId) {
        setStatus({ type: "error", text: "请选择目标 Agent" });
        return;
      }
      if (!selectedAgent?.running) {
        setStatus({ type: "error", text: "目标 Agent 未运行，请先启动后再试" });
        return;
      }
      if (!chatKey) {
        setStatus({ type: "error", text: "请选择 chatKey" });
        return;
      }
      if (!taskPrompt) {
        setStatus({ type: "error", text: "任务说明不能为空" });
        return;
      }

      const nextSettings: ExtensionSettings = {
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

        await dispatchAgentTask({
          agentId,
          contextId: chatKey,
          body: {
            instructions: buildInstructions({
              tab,
              taskPrompt,
              chatKey,
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

        // 关键点（中文）：用户只关心“提交成功”，无需等待执行完成。
        window.close();
      } catch (error) {
        setStatus({
          type: "error",
          text: `发送失败：${readErrorText(error)}`,
        });
        setIsSubmitting(false);
      }
    },
    [selectedAgent?.running, settings, tab],
  );

  return (
    <main className="popup-root">
      <header className="header-card">
        <div>
          <h1>ShipMyAgent Share</h1>
        </div>
        <div className="inline-status-group">
          <span className={`status-pill ${isConsoleOnline ? "ok" : "warn"}`}>
            {isConsoleOnline ? "Console UI Online" : "Console UI Offline"}
          </span>
          <span className={`status-pill ${selectedAgent?.running ? "ok" : "warn"}`}>
            {selectedAgent?.running ? "Agent Online" : "Agent Offline"}
          </span>
        </div>
      </header>

      <section className="page-card" aria-label="当前页面信息">
        <div className="section-label">Current Page</div>
        <div className="page-title">{tab.title}</div>
        <a href={tab.url || "#"} title={tab.url} className="page-link">
          {shortenUrl(tab.url)}
        </a>
      </section>

      <form className="share-form" onSubmit={onSubmit}>
        <div className="field-row">
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
          <button
            className="ghost-btn"
            type="button"
            onClick={() => void refreshAgents(settings.agentId)}
            disabled={isLoadingAgents || isSubmitting}
          >
            {isLoadingAgents ? "刷新中" : "刷新"}
          </button>
        </div>

        <div className="field-row">
          <label>
            chatKey
            <select
              value={settings.chatKey}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  chatKey: event.target.value,
                }))
              }
              disabled={chatKeyOptions.length === 0}
            >
              <option value="">请选择 chatKey</option>
              {chatKeyOptions.map((option) => (
                <option key={option.chatKey} value={option.chatKey}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="ghost-btn"
            type="button"
            onClick={() =>
              void refreshChatKeys(settings.agentId, settings.chatKey, linkedChannels)
            }
            disabled={isLoadingChatKeys || isSubmitting || !settings.agentId}
          >
            {isLoadingChatKeys ? "刷新中" : "刷新"}
          </button>
        </div>

        <div className="hint-text">
          {selectedChatKeyOption?.subtitle ||
            "仅展示已连接渠道的 chatKey（自动过滤未连接 channel）"}
        </div>

        <label>
          任务说明
          <textarea
            rows={5}
            value={settings.taskPrompt}
            onChange={(event) =>
              setSettings((prev) => ({ ...prev, taskPrompt: event.target.value }))
            }
            placeholder="例如：提炼这篇页面内容，给我 3 条可执行建议。"
          />
        </label>

        <button className="primary-btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "发送中..." : "发送到 Agent"}
        </button>
      </form>

      <footer className={`status-block status-${status.type}`}>{status.text}</footer>
    </main>
  );
}
