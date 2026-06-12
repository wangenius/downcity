/**
 * Options 设置页。
 *
 * 关键点（中文）：
 * - 面向用户只暴露 Downcity Town、Agent、Default Ask 三个概念。
 * - URL 解析后仍写入现有 ExtensionSettings，避免影响 Popup / Side Panel 的读取协议。
 * - 默认使用 Agent Session；IM 转发不再放在设置页主路径里。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsoleUiAgentOption } from "../types/api";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";
import type {
  ExtensionSettings,
  ExtensionServerConnection,
  ExtensionServerProtocol,
} from "../types/extension";
import { resolveAgentSessionId } from "../services/agentSession";
import { fetchConsoleAuthStatus, isAuthErrorMessage, normalizeAuthToken } from "../services/auth";
import { fetchAgents } from "../services/downcityApi";
import { resolveAgentId } from "../services/chatRouting";
import { buildServerConnectionBaseUrl, resolveRoutePreference } from "../services/serverConnection";
import { mergeRoutePreferenceSettings } from "../services/routePreference";
import {
  clearConnectionToken,
  DEFAULT_SETTINGS,
  loadConnectionToken,
  loadSettings,
  saveConnectionToken,
  saveSettings,
} from "../services/storage";
import { ExtensionPopupSelect } from "../extension-popup/ExtensionPopupSelect";
import { getStatusClass, readErrorText, type OptionsStatus } from "./helpers";

const DEFAULT_TOWN_URL = "http://127.0.0.1:5314";

function createConnectionId(): string {
  return `town_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeTownUrl(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return DEFAULT_TOWN_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const parsed = new URL(withProtocol);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function connectionFromTownUrl(params: {
  townUrl: string;
  previous?: ExtensionServerConnection | null;
}): ExtensionServerConnection {
  const normalized = normalizeTownUrl(params.townUrl);
  const parsed = new URL(normalized);
  const protocol: ExtensionServerProtocol = parsed.protocol === "https:" ? "https" : "http";
  const fallbackPort = protocol === "https" ? 443 : 80;
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : fallbackPort;
  const basePath =
    parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";

  return {
    id: params.previous?.id || createConnectionId(),
    name: "Downcity Town",
    protocol,
    host: parsed.hostname || "127.0.0.1",
    port,
    basePath,
  };
}

function townUrlFromConnection(connection: ExtensionServerConnection | null | undefined): string {
  if (!connection) return DEFAULT_TOWN_URL;
  return buildServerConnectionBaseUrl(connection);
}

function toAgentOptions(agents: ConsoleUiAgentOption[]): ExtensionSelectOption[] {
  return agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
    description: agent.running ? "在线" : "未运行",
  }));
}

function isRpcPortUrl(townUrl: string): boolean {
  try {
    return new URL(normalizeTownUrl(townUrl)).port === "15314";
  } catch {
    return false;
  }
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [townUrlInput, setTownUrlInput] = useState(DEFAULT_TOWN_URL);
  const [tokenInput, setTokenInput] = useState("");
  const [taskPromptInput, setTaskPromptInput] = useState(DEFAULT_SETTINGS.taskPrompt);
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<OptionsStatus>({
    type: "idle",
    text: "填写 Town URL 后保存并检查。",
  });

  const selectedConnection = useMemo(
    () =>
      settings.connections.find((item) => item.id === settings.selectedConnectionId) ||
      settings.connections[0] ||
      null,
    [settings],
  );
  const agentOptions = useMemo(() => toAgentOptions(agents), [agents]);

  const buildNextSettings = useCallback(
    (params: {
      sourceSettings?: ExtensionSettings;
      connection: ExtensionServerConnection;
      agentId: string;
      taskPrompt: string;
    }): ExtensionSettings => {
      const sourceSettings = params.sourceSettings || settings;
      const agentSessionId = params.agentId
        ? resolveAgentSessionId({
            connectionId: params.connection.id,
            agentId: params.agentId,
          })
        : "";
      return mergeRoutePreferenceSettings({
        settings: {
          ...sourceSettings,
          connections: [params.connection],
          selectedConnectionId: params.connection.id,
        },
        connectionId: params.connection.id,
        targetMode: "agent_session",
        agentId: params.agentId,
        sessionId: "",
        agentSessionId,
        taskPrompt: String(params.taskPrompt || "").trim() || DEFAULT_SETTINGS.taskPrompt,
      });
    },
    [settings],
  );

  const checkTown = useCallback(
    async (params?: {
      townUrl?: string;
      token?: string;
      preferredAgentId?: string;
      taskPrompt?: string;
      sourceSettings?: ExtensionSettings;
      previousConnection?: ExtensionServerConnection | null;
      persist?: boolean;
    }): Promise<{
      connection: ExtensionServerConnection;
      agentId: string;
      nextSettings: ExtensionSettings;
    } | null> => {
      const townUrl = params?.townUrl ?? townUrlInput;
      if (isRpcPortUrl(townUrl)) {
        setStatus({
          type: "error",
          text: "15314 是 Agent RPC 端口。Town URL 请使用 http://127.0.0.1:5314。",
        });
        return null;
      }

      setIsChecking(true);
      try {
        const connection = connectionFromTownUrl({
          townUrl,
          previous: params?.previousConnection ?? selectedConnection,
        });
        const baseUrl = buildServerConnectionBaseUrl(connection);
        const token = normalizeAuthToken(params?.token ?? tokenInput);

        const authStatus = await fetchConsoleAuthStatus({ consoleBaseUrl: baseUrl });
        const needsToken = authStatus.requireToken === true;
        setAuthRequired(needsToken);
        setShowToken(needsToken || Boolean(token));
        if (needsToken && !token) {
          setAgents([]);
          setSelectedAgentId("");
          setStatus({
            type: "error",
            text: "这个 Town 需要 Token。填写后再保存并检查。",
          });
          return null;
        }

        const payload = await fetchAgents({
          serverBaseUrl: baseUrl,
          authToken: token,
        });
        const list = Array.isArray(payload.agents) ? payload.agents : [];
        const agentId = resolveAgentId({
          agents: list,
          preferredAgentId: params?.preferredAgentId || selectedAgentId,
          selectedAgentId: payload.selectedAgentId,
        });
        const nextSettings = buildNextSettings({
          sourceSettings: params?.sourceSettings,
          connection,
          agentId,
          taskPrompt: params?.taskPrompt ?? taskPromptInput,
        });

        setTownUrlInput(baseUrl);
        setAgents(list);
        setSelectedAgentId(agentId);
        setSettings(nextSettings);

        if (params?.persist) {
          await saveSettings(nextSettings);
          if (token) {
            await saveConnectionToken(connection.id, token);
          } else {
            await clearConnectionToken(connection.id);
          }
        }

        setStatus({
          type: list.length > 0 ? "success" : "error",
          text:
            list.length > 0
              ? "已连接到 Downcity Town。"
              : "已连接到 Town，但没有发现可用 Agent。",
        });
        return { connection, agentId, nextSettings };
      } catch (error) {
        const errorText = readErrorText(error);
        if (isAuthErrorMessage(errorText)) {
          setAuthRequired(true);
          setShowToken(true);
        }
        setAgents([]);
        setSelectedAgentId("");
        setStatus({ type: "error", text: `连接检查失败：${errorText}` });
        return null;
      } finally {
        setIsChecking(false);
      }
    },
    [
      buildNextSettings,
      selectedAgentId,
      selectedConnection,
      taskPromptInput,
      tokenInput,
      townUrlInput,
    ],
  );

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const loaded = await loadSettings();
        if (!isMounted) return;

        const connection =
          loaded.connections.find((item) => item.id === loaded.selectedConnectionId) ||
          loaded.connections[0] ||
          connectionFromTownUrl({ townUrl: DEFAULT_TOWN_URL });
        const preference = resolveRoutePreference({
          settings: loaded,
          connectionId: connection.id,
        });
        const token = await loadConnectionToken(connection.id);

        setSettings(loaded);
        setTownUrlInput(townUrlFromConnection(connection));
        setTokenInput(token);
        setTaskPromptInput(loaded.taskPrompt);
        setSelectedAgentId(preference.agentId);
        setShowToken(Boolean(token));

        await checkTown({
          townUrl: townUrlFromConnection(connection),
          token,
          preferredAgentId: preference.agentId,
          taskPrompt: loaded.taskPrompt,
          sourceSettings: loaded,
          previousConnection: connection,
        });
      } catch (error) {
        if (!isMounted) return;
        setStatus({ type: "error", text: `初始化失败：${readErrorText(error)}` });
        setIsChecking(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      setSelectedAgentId(agentId);
      if (!selectedConnection) return;
      const nextSettings = buildNextSettings({
        connection: selectedConnection,
        agentId,
        taskPrompt: taskPromptInput,
      });
      setSettings(nextSettings);
    },
    [buildNextSettings, selectedConnection, taskPromptInput],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await checkTown({
        townUrl: townUrlInput,
        token: tokenInput,
        preferredAgentId: selectedAgentId,
        persist: true,
      });
    } finally {
      setIsSaving(false);
    }
  }, [checkTown, selectedAgentId, tokenInput, townUrlInput]);

  return (
    <main className="mx-auto my-6 flex w-[min(720px,calc(100vw-32px))] min-w-0 flex-col gap-4 overflow-x-hidden">
      <header className="border-b border-border px-1 pb-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Downcity
        </div>
        <h1 className="mt-1 text-2xl font-medium text-foreground">
          Town Extension
        </h1>
      </header>

      <section className="rounded-[14px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Downcity Town</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              连接本机或远程 Town。默认本机地址是 `http://127.0.0.1:5314`。
            </p>
          </div>

          <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Town URL
            <input
              className="h-12 w-full rounded-[12px] border border-border bg-muted px-3 text-[13px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
              value={townUrlInput}
              onChange={(event) => setTownUrlInput(event.target.value)}
              placeholder={DEFAULT_TOWN_URL}
            />
          </label>

          {showToken ? (
            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Town Token
              <textarea
                className="min-h-[86px] w-full resize-y rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] leading-[1.55] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="粘贴 town token"
              />
            </label>
          ) : null}

          {!showToken ? (
            <button
              type="button"
              className="w-fit text-[12px] font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => setShowToken(true)}
            >
              需要 Token？
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Agent</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              侧栏和 Popup 默认使用这个 Agent。
            </p>
          </div>

          <ExtensionPopupSelect
            label="Default Agent"
            value={selectedAgentId}
            placeholder={
              isChecking
                ? "检查 Town 中..."
                : agentOptions.length > 0
                  ? "选择 Agent"
                  : "暂无可用 Agent"
            }
            options={agentOptions}
            onChange={handleSelectAgent}
            disabled={isChecking || agentOptions.length === 0}
          />
        </div>
      </section>

      <section className="rounded-[14px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Default Ask</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Popup 发送网页时会默认带上这句话。
            </p>
          </div>

          <textarea
            className="min-h-[96px] w-full resize-y rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[13px] leading-6 text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
            value={taskPromptInput}
            onChange={(event) => setTaskPromptInput(event.target.value)}
            placeholder="请阅读这个页面并给我一个可执行摘要。"
          />
        </div>
      </section>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-1 py-4">
        <div className={`text-sm ${getStatusClass(status.type)}`}>{status.text}</div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving || isChecking}
        >
          {isSaving || isChecking ? "检查中..." : "保存并检查"}
        </button>
      </footer>
    </main>
  );
}
