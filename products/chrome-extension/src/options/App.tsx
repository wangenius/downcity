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
  fetchConsoleAuthStatus,
  isAuthErrorMessage,
  normalizeAuthToken,
} from "../services/auth";
import {
  fetchAgents,
  fetchChatKeyOptions,
} from "../services/downcityApi";
import { resolveAgentId, resolveChatKey, resolveLinkedChannels } from "../services/chatRouting";
import { buildConsoleBaseUrl, parsePortInput } from "../services/consoleBase";
import {
  clearAuthState,
  DEFAULT_SETTINGS,
  loadAuthState,
  loadSettings,
  saveAuthState,
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
  const [authInitializing, setAuthInitializing] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authTokenInput, setAuthTokenInput] = useState("");
  const [authUsername, setAuthUsername] = useState("");
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

  const hasSavedToken = Boolean(normalizeAuthToken(authToken));
  const hasDraftToken = Boolean(normalizeAuthToken(authTokenInput));

  async function loadChats(params: {
    agentId: string;
    host: string;
    port: string;
    authToken: string;
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
      const rawOptions = await fetchChatKeyOptions(agentId, {
        consoleBaseUrl,
        authToken: params.authToken,
      });
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
      const errorText = readErrorText(error);
      if (isAuthErrorMessage(errorText)) {
        await clearAuthState().catch(() => undefined);
        setAuthRequired(true);
        setIsAuthenticated(false);
        setAuthToken("");
        setAuthUsername("");
        setChatOptions([]);
        setSettings((prev) => ({ ...prev, chatKey: "" }));
        setStatus({
          type: "error",
          text: "Token 已失效，请重新填写 Bearer Token。",
        });
        return "";
      }
      setChatOptions([]);
      setSettings((prev) => ({ ...prev, chatKey: "" }));
      setStatus({
        type: "error",
        text: `加载 Channel Chat 失败：${errorText}`,
      });
      return "";
    } finally {
      setIsLoadingChats(false);
    }
  }

  async function loadAgents(params: {
    host: string;
    port: string;
    authToken: string;
    preferredAgentId: string;
    preferredChatKey: string;
  }): Promise<boolean> {
    const port = parsePortInput(params.port);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return false;
    }

    const consoleBaseUrl = buildConsoleBaseUrl({
      host: params.host,
      port,
    });

    setIsLoadingAgents(true);
    setStatus({ type: "loading", text: "加载 Agent 中..." });
    try {
      const response = await fetchAgents({
        consoleBaseUrl,
        authToken: params.authToken,
      });
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
        authToken: params.authToken,
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
      const errorText = readErrorText(error);
      if (isAuthErrorMessage(errorText)) {
        await clearAuthState().catch(() => undefined);
        setAgents([]);
        setChatOptions([]);
        setAuthRequired(true);
        setIsAuthenticated(false);
        setAuthToken("");
        setAuthUsername("");
        setStatus({
          type: "error",
          text: "Token 已失效，请重新填写 Bearer Token。",
        });
        return false;
      }
      setAgents([]);
      setChatOptions([]);
      setStatus({
        type: "error",
        text: `加载 Agent 失败：${errorText}`,
      });
      return false;
    } finally {
      setIsLoadingAgents(false);
    }
    return true;
  }

  async function refreshAuthAndAgents(params: {
    host: string;
    port: string;
    preferredAgentId: string;
    preferredChatKey: string;
  }): Promise<void> {
    const port = parsePortInput(params.port);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      setAuthInitializing(false);
      return;
    }
    const consoleBaseUrl = buildConsoleBaseUrl({
      host: params.host,
      port,
    });

    setAuthInitializing(true);
    try {
      const [authStatus, authState] = await Promise.all([
        fetchConsoleAuthStatus({ consoleBaseUrl }),
        loadAuthState(),
      ]);
      const token = String(authState.token || "").trim();
      const username = String(authState.username || "").trim();
      setAuthToken(token);
      setAuthTokenInput(token);
      setAuthUsername(username);

      if (authStatus.requireLogin && !token) {
        setAuthRequired(true);
        setIsAuthenticated(false);
        setAuthToken("");
        setAuthTokenInput("");
        setAgents([]);
        setChatOptions([]);
        setStatus({
          type: "idle",
          text: "Console 已开启统一鉴权，请先填写 Bearer Token。",
        });
        return;
      }

      setAuthRequired(false);
      setIsAuthenticated(Boolean(token));
      void (await loadAgents({
        host: params.host,
        port: String(port),
        authToken: token,
        preferredAgentId: params.preferredAgentId,
        preferredChatKey: params.preferredChatKey,
      }));
    } catch (error) {
      setStatus({
        type: "error",
        text: `初始化鉴权失败：${readErrorText(error)}`,
      });
    } finally {
      setAuthInitializing(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        const authState = await loadAuthState();
        if (!mounted) return;
        setSettings(loaded);
        setConsoleHost(loaded.consoleHost);
        setConsolePortInput(String(loaded.consolePort));
        setAuthToken(String(authState.token || "").trim());
        setAuthTokenInput(String(authState.token || "").trim());
        setAuthUsername(String(authState.username || "").trim());
        await refreshAuthAndAgents({
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
    const host = String(consoleHost || "").trim() || "127.0.0.1";
    const port = parsePortInput(consolePortInput);
    if (!port) {
      setStatus({ type: "error", text: "端口范围应为 1-65535" });
      return;
    }

    const nextToken = normalizeAuthToken(authTokenInput);
    if (nextToken) {
      await saveAuthState({
        token: nextToken,
        ...(authUsername ? { username: authUsername } : {}),
      });
      setAuthToken(nextToken);
      setAuthTokenInput(nextToken);
      setIsAuthenticated(true);
    } else {
      await clearAuthState().catch(() => undefined);
      setAuthToken("");
      setAuthTokenInput("");
      setAuthUsername("");
      setIsAuthenticated(false);
    }

    await refreshAuthAndAgents({
      host,
      port: String(port),
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
      authToken,
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
      const nextToken = normalizeAuthToken(authTokenInput);
      if (nextToken) {
        await saveAuthState({
          token: nextToken,
          ...(authUsername ? { username: authUsername } : {}),
        });
        setAuthToken(nextToken);
        setAuthTokenInput(nextToken);
        setIsAuthenticated(true);
      } else {
        await clearAuthState().catch(() => undefined);
        setAuthToken("");
        setAuthTokenInput("");
        setAuthUsername("");
        setIsAuthenticated(false);
      }
      setSettings(nextSettings);
      setStatus({ type: "success", text: "已保存，扩展弹窗会使用新的连接与默认目标" });
    } catch (error) {
      setStatus({ type: "error", text: `保存失败：${readErrorText(error)}` });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await clearAuthState().catch(() => undefined);
    setAuthRequired(false);
    setIsAuthenticated(false);
    setAuthToken("");
    setAuthTokenInput("");
    setAuthUsername("");
    await refreshAuthAndAgents({
      host: String(consoleHost || "").trim() || "127.0.0.1",
      port: consolePortInput,
      preferredAgentId: settings.agentId,
      preferredChatKey: settings.chatKey,
    });
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
          先连接 Console 并完成鉴权，再选择默认 Agent 与 Channel Chat。
        </p>
      </header>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid min-w-0 gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Connect Console
            </h2>
            {authInitializing ? (
              <span className="text-[11px] text-muted-foreground">
                检查中...
              </span>
            ) : null}
          </div>

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
                {isLoadingAgents ? "连接中..." : "连接并加载"}
              </button>
            </div>
          </div>

          {authInitializing ? null : (
            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-muted px-3 py-3">
                <div className="grid gap-1 text-[12px]">
                  <div className="font-medium text-foreground">
                    {authRequired
                      ? hasDraftToken
                        ? "将使用当前 Token"
                        : "Console 需要鉴权"
                      : hasDraftToken
                        ? "当前将使用 Token"
                        : "Console 当前公开访问"}
                  </div>
                  <div className="text-muted-foreground">
                    {authRequired
                      ? hasDraftToken
                        ? authUsername
                          ? `当前身份：${authUsername}`
                          : "已填写 Token，可直接请求私有接口。"
                        : "填写 Token 后即可请求私有接口。"
                      : hasDraftToken
                        ? authUsername
                          ? `当前身份：${authUsername}`
                          : "当前会优先使用 Token。"
                        : "未检测到鉴权要求，Token 可以留空。"}
                  </div>
                </div>
                {(isAuthenticated || hasSavedToken || hasDraftToken) ? (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-background px-4 text-[12px] font-medium text-foreground transition hover:bg-surface"
                    type="button"
                    onClick={() => void handleLogout()}
                  >
                    清空 Token
                  </button>
                ) : null}
              </div>

              <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Access Token
                <textarea
                  className="min-h-[76px] w-full resize-y rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] leading-[1.55] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                  value={authTokenInput}
                  onChange={(event) => setAuthTokenInput(event.target.value)}
                  placeholder="粘贴 Bearer Token；支持直接粘贴 Bearer xxx 或纯 token"
                />
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid min-w-0 gap-5">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Agent / Channel
            </h2>
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
            disabled={authInitializing || authRequired || isLoadingAgents || agentOptions.length === 0}
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
            disabled={
              authInitializing ||
              authRequired ||
              !settings.agentId ||
              isLoadingChats ||
              chatSelectOptions.length === 0
            }
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
          {isSaving ? "保存中..." : "保存默认设置"}
        </button>
      </footer>
    </main>
  );
}
