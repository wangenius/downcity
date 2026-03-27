/**
 * Options 设置页。
 *
 * 关键点（中文）：
 * - 只保留扩展运行必需设置：Console 地址、默认 Agent、默认 Channel Chat。
 * - 请求流必须稳定，避免 effect/callback 互相依赖导致无限刷新。
 * - 只有初始化、手动刷新、切换 Agent 时才重新拉取数据。
 */

import { useEffect, useMemo, useState } from "react";
import type { ChatKeyOption, ConsoleUiAgentOption } from "../types/api";
import type { ExtensionSettings } from "../types/extension";
import {
  fetchAgents,
  fetchChatKeyOptions,
} from "../services/downcityApi";
import { resolveAgentId, resolveChatKey, resolveLinkedChannels } from "../services/chatRouting";
import { buildConsoleBaseUrl, parsePortInput } from "../services/consoleBase";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "../services/storage";
import { getStatusClass, readErrorText, type OptionsStatus } from "./helpers";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";
import { ExtensionPopupSelect } from "../extension-popup/ExtensionPopupSelect";

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [consoleHost, setConsoleHost] = useState(DEFAULT_SETTINGS.consoleHost);
  const [consolePortInput, setConsolePortInput] = useState(
    String(DEFAULT_SETTINGS.consolePort),
  );
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [chatOptions, setChatOptions] = useState<ChatKeyOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [status, setStatus] = useState<OptionsStatus>({
    type: "idle",
    text: "修改后保存即可",
  });

  const agentOptions = useMemo<ExtensionSelectOption[]>(
    () =>
      agents.map((item) => ({
        value: item.id,
        label: item.name,
        description: item.running ? "在线" : "未运行",
      })),
    [agents],
  );

  const chatSelectOptions = useMemo<ExtensionSelectOption[]>(
    () =>
      chatOptions.map((item) => ({
        value: item.chatKey,
        label: item.title,
        description: item.subtitle,
      })),
    [chatOptions],
  );

  async function loadChats(params: {
    agentId: string;
    host: string;
    port: string;
    preferredChatKey: string;
    agentList?: ConsoleUiAgentOption[];
  }): Promise<string> {
    const agentId = String(params.agentId || "").trim();
    if (!agentId) {
      setChatOptions([]);
      setSettings((prev) => ({ ...prev, chatKey: "" }));
      return "";
    }

    const port = parsePortInput(params.port);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return "";
    }

    const consoleBaseUrl = buildConsoleBaseUrl({
      host: params.host,
      port,
    });

    setIsLoadingChats(true);
    try {
      const rawOptions = await fetchChatKeyOptions(agentId, { consoleBaseUrl });
      const sourceAgents = params.agentList || agents;
      const linkedChannels = resolveLinkedChannels(
        sourceAgents.find((item) => item.id === agentId) || null,
      );
      const filtered =
        linkedChannels.size > 0
          ? rawOptions.filter((item) => linkedChannels.has(item.channel))
          : rawOptions;
      const nextChatKey = resolveChatKey(filtered, params.preferredChatKey);

      setChatOptions(filtered);
      setSettings((prev) => ({
        ...prev,
        chatKey: nextChatKey,
      }));
      return nextChatKey;
    } catch (error) {
      setChatOptions([]);
      setSettings((prev) => ({ ...prev, chatKey: "" }));
      setStatus({
        type: "error",
        text: `加载 Channel Chat 失败：${readErrorText(error)}`,
      });
      return "";
    } finally {
      setIsLoadingChats(false);
    }
  }

  async function loadAgents(params: {
    host: string;
    port: string;
    preferredAgentId: string;
    preferredChatKey: string;
  }): Promise<void> {
    const port = parsePortInput(params.port);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return;
    }

    const consoleBaseUrl = buildConsoleBaseUrl({
      host: params.host,
      port,
    });

    setIsLoadingAgents(true);
    setStatus({ type: "loading", text: "加载 Agent 中..." });
    try {
      const response = await fetchAgents({ consoleBaseUrl });
      const nextAgents = response.agents || [];
      const nextAgentId = resolveAgentId({
        agents: nextAgents,
        preferredAgentId: params.preferredAgentId,
        selectedAgentId: response.selectedAgentId,
      });

      setAgents(nextAgents);
      setSettings((prev) => ({
        ...prev,
        consoleHost: params.host,
        consolePort: port,
        agentId: nextAgentId,
      }));

      await loadChats({
        agentId: nextAgentId,
        host: params.host,
        port: String(port),
        preferredChatKey: params.preferredChatKey,
        agentList: nextAgents,
      });

      setStatus({
        type: "idle",
        text:
          nextAgents.length > 0
            ? "已加载 Agent / Chat 配置"
            : "未发现 Agent，请先启动 city agent start",
      });
    } catch (error) {
      setAgents([]);
      setChatOptions([]);
      setStatus({
        type: "error",
        text: `加载 Agent 失败：${readErrorText(error)}`,
      });
    } finally {
      setIsLoadingAgents(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (!mounted) return;
        setSettings(loaded);
        setConsoleHost(loaded.consoleHost);
        setConsolePortInput(String(loaded.consolePort));
        await loadAgents({
          host: loaded.consoleHost,
          port: String(loaded.consolePort),
          preferredAgentId: loaded.agentId,
          preferredChatKey: loaded.chatKey,
        });
      } catch (error) {
        if (!mounted) return;
        setStatus({ type: "error", text: `初始化失败：${readErrorText(error)}` });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleRefreshAgents(): Promise<void> {
    await loadAgents({
      host: String(consoleHost || "").trim() || "127.0.0.1",
      port: consolePortInput,
      preferredAgentId: settings.agentId,
      preferredChatKey: settings.chatKey,
    });
  }

  async function handleSelectAgent(agentId: string): Promise<void> {
    setSettings((prev) => ({
      ...prev,
      agentId,
      chatKey: "",
    }));
    await loadChats({
      agentId,
      host: String(consoleHost || "").trim() || "127.0.0.1",
      port: consolePortInput,
      preferredChatKey: "",
      agentList: agents,
    });
  }

  async function saveAllSettings(): Promise<void> {
    const host = String(consoleHost || "").trim() || "127.0.0.1";
    const port = parsePortInput(consolePortInput);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return;
    }

    const nextSettings: ExtensionSettings = {
      ...settings,
      consoleHost: host,
      consolePort: port,
      agentId: String(settings.agentId || "").trim(),
      chatKey: String(settings.chatKey || "").trim(),
    };

    setIsSaving(true);
    setStatus({ type: "loading", text: "保存中..." });
    try {
      await saveSettings(nextSettings);
      setSettings(nextSettings);
      setStatus({ type: "success", text: "已保存，扩展弹窗和页内输入框会使用新设置" });
    } catch (error) {
      setStatus({ type: "error", text: `保存失败：${readErrorText(error)}` });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto my-6 flex w-[min(720px,calc(100vw-32px))] min-w-0 flex-col gap-4 overflow-x-hidden">
      <header className="rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
          Extension
        </div>
        <h1 className="mt-1 text-xl font-medium tracking-[-0.02em] text-foreground">
          Chrome Extension Settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          配置 Console 连接、默认 Agent 与默认会话，保存后会立即生效。
        </p>
      </header>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid min-w-0 gap-5">
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              IP / Host
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={consoleHost}
                onChange={(event) => setConsoleHost(event.target.value)}
                placeholder="127.0.0.1"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Port
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={consolePortInput}
                onChange={(event) => setConsolePortInput(event.target.value)}
                placeholder="5315"
              />
            </label>

            <div className="flex items-end">
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-[12px] font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => void handleRefreshAgents()}
                disabled={isLoadingAgents}
              >
                {isLoadingAgents ? "刷新中..." : "刷新 Agent"}
              </button>
            </div>
          </div>

          <ExtensionPopupSelect
            label="Default Agent"
            value={settings.agentId}
            placeholder={
              isLoadingAgents
                ? "加载 Agent 中..."
                : agentOptions.length > 0
                  ? "请选择默认 Agent"
                  : "暂无可用 Agent"
            }
            options={agentOptions}
            onChange={(value) => void handleSelectAgent(value)}
            disabled={isLoadingAgents || agentOptions.length === 0}
          />

          <ExtensionPopupSelect
            label="Default Chat"
            value={settings.chatKey}
            placeholder={
              !settings.agentId
                ? "请先选择 Agent"
                : isLoadingChats
                  ? "加载 Chat 中..."
                  : chatSelectOptions.length > 0
                    ? "请选择目标 Channel Chat"
                    : "暂无可用 Channel Chat"
            }
            options={chatSelectOptions}
            onChange={(value) =>
              setSettings((prev) => ({
                ...prev,
                chatKey: value,
              }))
            }
            disabled={!settings.agentId || isLoadingChats || chatSelectOptions.length === 0}
          />

          {!settings.chatKey && chatSelectOptions.length > 1 ? (
            <div className="rounded-[12px] border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
              当前 Agent 有多个会话，请明确选择一个默认 Channel Chat，避免消息发到错误会话。
            </div>
          ) : null}
        </div>
      </section>

      <footer className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className={`text-sm ${getStatusClass(status.type)}`}>{status.text}</div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => void saveAllSettings()}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
