/**
 * Options 设置页。
 *
 * 关键点（中文）：
 * - 设置页围绕「Server Connection -> Token -> Agent / Session 默认路由」展开。
 * - 每个连接独立维护 Bearer Token，并共享一份全局 taskPrompt 默认值。
 * - Inline Composer 已移除，不再展示任何即时模式或 content script 相关配置。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConsoleUiAgentOption, SessionOption } from "../types/api";
import type { ExtensionSelectOption } from "../types/ExtensionSelect";
import type {
  ExtensionSettings,
  ExtensionServerConnection,
  ExtensionServerProtocol,
} from "../types/extension";
import { fetchConsoleAuthStatus, isAuthErrorMessage, normalizeAuthToken } from "../services/auth";
import {
  fetchAgents,
  fetchSessionOptions,
} from "../services/downcityApi";
import {
  resolveAgentId,
  resolveLinkedChannels,
  resolveSessionId,
} from "../services/chatRouting";
import {
  buildServerConnectionBaseUrl,
  formatServerConnectionLabel,
  resolveRoutePreference,
} from "../services/serverConnection";
import {
  clearConnectionToken,
  DEFAULT_SETTINGS,
  loadConnectionToken,
  loadSettings,
  saveConnectionToken,
  saveSettings,
} from "../services/storage";
import { getStatusClass, readErrorText, type OptionsStatus } from "./helpers";
import { ExtensionPopupSelect } from "../extension-popup/ExtensionPopupSelect";

function createConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeConnectionName(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function normalizeConnectionHost(input: string): string {
  const normalized = String(input || "").trim();
  return normalized || "127.0.0.1";
}

function normalizeConnectionProtocol(input: string): ExtensionServerProtocol {
  return String(input || "").trim().toLowerCase() === "https" ? "https" : "http";
}

function normalizeConnectionPort(input: string): number | null {
  const parsed = Number.parseInt(String(input || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return Math.trunc(parsed);
}

function normalizeConnectionBasePath(input: string): string {
  const normalized = String(input || "").trim();
  if (!normalized || normalized === "/") return "";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function toConnectionOptions(
  connections: ExtensionServerConnection[],
): ExtensionSelectOption[] {
  return connections.map((item) => ({
    value: item.id,
    label: item.name,
    description: `${item.protocol}://${item.host}:${item.port}${item.basePath || ""}`,
  }));
}

function toAgentOptions(agents: ConsoleUiAgentOption[]): ExtensionSelectOption[] {
  return agents.map((item) => ({
    value: item.id,
    label: item.name,
    description: item.running ? "在线" : "未运行",
  }));
}

function toSessionOptions(sessions: SessionOption[]): ExtensionSelectOption[] {
  return sessions.map((item) => ({
    value: item.sessionId,
    label: item.title,
    description: item.subtitle,
  }));
}

function toEmptyConnection(): ExtensionServerConnection {
  return {
    id: createConnectionId(),
    name: "New Server",
    protocol: "http",
    host: "127.0.0.1",
    port: 5315,
    basePath: "",
  };
}

function mergeRoutePreferenceSettings(params: {
  settings: ExtensionSettings;
  connectionId: string;
  agentId?: string;
  sessionId?: string;
  taskPrompt?: string;
}): ExtensionSettings {
  const connectionId = String(params.connectionId || "").trim();
  const currentPreference = resolveRoutePreference({
    settings: params.settings,
    connectionId,
  });

  return {
    ...params.settings,
    ...(params.taskPrompt !== undefined ? { taskPrompt: params.taskPrompt } : {}),
    selectedConnectionId: connectionId || params.settings.selectedConnectionId,
    routePreferences: {
      ...params.settings.routePreferences,
      [connectionId]: {
        agentId:
          params.agentId !== undefined ? String(params.agentId || "").trim() : currentPreference.agentId,
        sessionId:
          params.sessionId !== undefined
            ? String(params.sessionId || "").trim()
            : currentPreference.sessionId,
      },
    },
  };
}

export function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [connectionDraft, setConnectionDraft] = useState<ExtensionServerConnection>(
    DEFAULT_SETTINGS.connections[0] || toEmptyConnection(),
  );
  const [tokenInput, setTokenInput] = useState("");
  const [taskPromptInput, setTaskPromptInput] = useState(DEFAULT_SETTINGS.taskPrompt);
  const [agents, setAgents] = useState<ConsoleUiAgentOption[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [isLoadingConnectionState, setIsLoadingConnectionState] = useState(true);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [status, setStatus] = useState<OptionsStatus>({
    type: "idle",
    text: "修改后保存即可",
  });

  const selectedConnection = useMemo(
    () =>
      settings.connections.find((item) => item.id === selectedConnectionId) ||
      settings.connections[0] ||
      null,
    [selectedConnectionId, settings.connections],
  );
  const routePreference = useMemo(
    () =>
      resolveRoutePreference({
        settings,
        connectionId: selectedConnection?.id || "",
      }),
    [selectedConnection?.id, settings],
  );
  const connectionOptions = useMemo(
    () => toConnectionOptions(settings.connections),
    [settings.connections],
  );
  const agentOptions = useMemo(() => toAgentOptions(agents), [agents]);
  const sessionOptions = useMemo(() => toSessionOptions(sessions), [sessions]);

  const loadSessionsForAgent = useCallback(
    async (params: {
      connection: ExtensionServerConnection;
      agentId: string;
      preferredSessionId: string;
      authToken: string;
      agentList: ConsoleUiAgentOption[];
    }): Promise<string> => {
      const normalizedAgentId = String(params.agentId || "").trim();
      if (!normalizedAgentId) {
        setSessions([]);
        setSelectedSessionId("");
        return "";
      }

      setIsLoadingSessions(true);
      try {
        const serverBaseUrl = buildServerConnectionBaseUrl(params.connection);
        const rawSessions = await fetchSessionOptions(normalizedAgentId, {
          serverBaseUrl,
          authToken: params.authToken,
        });
        const linked = resolveLinkedChannels(
          params.agentList.find((item) => item.id === normalizedAgentId) || null,
        );
        const filtered =
          linked.size > 0
            ? rawSessions.filter((item) => linked.has(item.channel))
            : rawSessions;
        const nextSessionId = resolveSessionId(filtered, params.preferredSessionId);

        setSessions(filtered);
        setSelectedSessionId(nextSessionId);
        return nextSessionId;
      } catch (error) {
        const errorText = readErrorText(error);
        if (isAuthErrorMessage(errorText)) {
          setAuthRequired(true);
          setSessions([]);
          setSelectedSessionId("");
          setStatus({
            type: "error",
            text: "当前连接需要 Bearer Token，请先填写并保存 Token。",
          });
          return "";
        }
        setSessions([]);
        setSelectedSessionId("");
        setStatus({
          type: "error",
          text: `加载 Session 失败：${errorText}`,
        });
        return "";
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [],
  );

  const loadAgentsForConnection = useCallback(
    async (params: {
      connection: ExtensionServerConnection;
      preferredAgentId: string;
      preferredSessionId: string;
      authToken: string;
    }): Promise<void> => {
      setIsLoadingAgents(true);
      try {
        const payload = await fetchAgents({
          serverBaseUrl: buildServerConnectionBaseUrl(params.connection),
          authToken: params.authToken,
        });
        const list = Array.isArray(payload.agents) ? payload.agents : [];
        const nextAgentId = resolveAgentId({
          agents: list,
          preferredAgentId: params.preferredAgentId,
          selectedAgentId: payload.selectedAgentId,
        });

        setAgents(list);
        setSelectedAgentId(nextAgentId);

        if (list.length < 1) {
          setSessions([]);
          setSelectedSessionId("");
          setStatus({
            type: "error",
            text: "未发现可用 Agent，请先启动 `town agent start`。",
          });
          return;
        }

        await loadSessionsForAgent({
          connection: params.connection,
          agentId: nextAgentId,
          preferredSessionId: params.preferredSessionId,
          authToken: params.authToken,
          agentList: list,
        });

        setStatus({ type: "idle", text: "修改后保存即可" });
      } catch (error) {
        const errorText = readErrorText(error);
        if (isAuthErrorMessage(errorText)) {
          setAuthRequired(true);
          setAgents([]);
          setSessions([]);
          setSelectedAgentId("");
          setSelectedSessionId("");
          setStatus({
            type: "error",
            text: "当前连接需要 Bearer Token，请先填写并保存 Token。",
          });
          return;
        }
        setAgents([]);
        setSessions([]);
        setSelectedAgentId("");
        setSelectedSessionId("");
        setStatus({
          type: "error",
          text: `加载 Agent 失败：${errorText}`,
        });
      } finally {
        setIsLoadingAgents(false);
      }
    },
    [loadSessionsForAgent],
  );

  const inspectConnection = useCallback(
    async (connection: ExtensionServerConnection, nextSettings: ExtensionSettings): Promise<void> => {
      setIsLoadingConnectionState(true);
      try {
        const token = await loadConnectionToken(connection.id);
        setTokenInput(token);
        setConnectionDraft(connection);

        const authStatus = await fetchConsoleAuthStatus({
          consoleBaseUrl: buildServerConnectionBaseUrl(connection),
        });
        const requiresToken = authStatus.requireToken === true;
        setAuthRequired(requiresToken && !token);

        const preference = resolveRoutePreference({
          settings: nextSettings,
          connectionId: connection.id,
        });
        setSelectedAgentId(preference.agentId);
        setSelectedSessionId(preference.sessionId);

        if (requiresToken && !token) {
          setAgents([]);
          setSessions([]);
          setStatus({
            type: "error",
            text: "当前连接需要 Bearer Token，请先填写并保存 Token。",
          });
          return;
        }

        await loadAgentsForConnection({
          connection,
          preferredAgentId: preference.agentId,
          preferredSessionId: preference.sessionId,
          authToken: token,
        });
      } catch (error) {
        setStatus({
          type: "error",
          text: `连接检查失败：${readErrorText(error)}`,
        });
      } finally {
        setIsLoadingConnectionState(false);
      }
    },
    [loadAgentsForConnection],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const loaded = await loadSettings();
        if (!isMounted) return;

        const nextConnectionId =
          loaded.selectedConnectionId || loaded.connections[0]?.id || "";
        const selected =
          loaded.connections.find((item) => item.id === nextConnectionId) ||
          loaded.connections[0] ||
          toEmptyConnection();

        setSettings(loaded);
        setSelectedConnectionId(selected.id);
        setTaskPromptInput(loaded.taskPrompt);
        await inspectConnection(selected, loaded);
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
  }, [inspectConnection]);

  const handleSelectConnection = useCallback(
    async (connectionId: string) => {
      const nextConnection =
        settings.connections.find((item) => item.id === connectionId) || null;
      if (!nextConnection) return;
      const nextSettings = {
        ...settings,
        selectedConnectionId: nextConnection.id,
      };
      setSettings(nextSettings);
      setSelectedConnectionId(nextConnection.id);
      await inspectConnection(nextConnection, nextSettings);
    },
    [inspectConnection, settings],
  );

  const handleCreateConnection = useCallback(() => {
    const nextConnection = toEmptyConnection();
    const nextSettings = {
      ...settings,
      connections: [...settings.connections, nextConnection],
      selectedConnectionId: nextConnection.id,
      routePreferences: {
        ...settings.routePreferences,
        [nextConnection.id]: {
          agentId: "",
          sessionId: "",
        },
      },
    };
    setSettings(nextSettings);
    setSelectedConnectionId(nextConnection.id);
    setConnectionDraft(nextConnection);
    setTokenInput("");
    setAgents([]);
    setSessions([]);
    setSelectedAgentId("");
    setSelectedSessionId("");
    setAuthRequired(false);
    setStatus({ type: "idle", text: "新连接已创建，填写后保存即可" });
  }, [settings]);

  const handleDeleteConnection = useCallback(() => {
    if (!selectedConnection || settings.connections.length <= 1) {
      setStatus({
        type: "error",
        text: "至少保留一个连接，不能删除最后一个连接。",
      });
      return;
    }

    const nextConnections = settings.connections.filter(
      (item) => item.id !== selectedConnection.id,
    );
    const nextSelectedConnection = nextConnections[0] || null;
    const nextRoutePreferences = { ...settings.routePreferences };
    delete nextRoutePreferences[selectedConnection.id];

    const nextSettings: ExtensionSettings = {
      ...settings,
      connections: nextConnections,
      selectedConnectionId: nextSelectedConnection?.id || "",
      routePreferences: nextRoutePreferences,
    };

    setSettings(nextSettings);
    setSelectedConnectionId(nextSelectedConnection?.id || "");
    setConnectionDraft(nextSelectedConnection || toEmptyConnection());
    setStatus({ type: "idle", text: "当前连接将会在保存后删除" });
  }, [selectedConnection, settings]);

  const handleRefreshConnection = useCallback(async () => {
    if (!selectedConnection) return;
    await inspectConnection(selectedConnection, settings);
  }, [inspectConnection, selectedConnection, settings]);

  const handleSelectAgent = useCallback(
    async (agentId: string) => {
      if (!selectedConnection) return;
      const token = await loadConnectionToken(selectedConnection.id);
      setSelectedAgentId(agentId);
      const nextSessionId = await loadSessionsForAgent({
        connection: selectedConnection,
        agentId,
        preferredSessionId: "",
        authToken: token,
        agentList: agents,
      });
      const nextSettings = mergeRoutePreferenceSettings({
        settings,
        connectionId: selectedConnection.id,
        agentId,
        sessionId: nextSessionId,
        taskPrompt: taskPromptInput,
      });
      setSettings(nextSettings);
    },
    [agents, loadSessionsForAgent, selectedConnection, settings, taskPromptInput],
  );

  const handleSaveAllSettings = useCallback(async () => {
    const currentConnectionId =
      String(selectedConnectionId || "").trim() || settings.connections[0]?.id || "";
    const normalizedName = normalizeConnectionName(connectionDraft.name);
    const normalizedProtocol = normalizeConnectionProtocol(connectionDraft.protocol);
    const normalizedHost = normalizeConnectionHost(connectionDraft.host);
    const normalizedPort = normalizeConnectionPort(String(connectionDraft.port));
    const normalizedBasePath = normalizeConnectionBasePath(connectionDraft.basePath);

    if (!normalizedName) {
      setStatus({ type: "error", text: "连接名称不能为空。" });
      return;
    }
    if (!normalizedPort) {
      setStatus({ type: "error", text: "端口范围应为 1-65535。" });
      return;
    }

    const normalizedConnection: ExtensionServerConnection = {
      ...connectionDraft,
      id: currentConnectionId || connectionDraft.id || createConnectionId(),
      name: normalizedName,
      protocol: normalizedProtocol,
      host: normalizedHost,
      port: normalizedPort,
      basePath: normalizedBasePath,
    };

    const nextConnections = settings.connections.map((item) =>
      item.id === normalizedConnection.id ? normalizedConnection : item,
    );
    const connectionExists = nextConnections.some(
      (item) => item.id === normalizedConnection.id,
    );
    const finalConnections = connectionExists
      ? nextConnections
      : [...nextConnections, normalizedConnection];

    const nextSettings = mergeRoutePreferenceSettings({
      settings: {
        ...settings,
        connections: finalConnections,
        selectedConnectionId: normalizedConnection.id,
      },
      connectionId: normalizedConnection.id,
      agentId: selectedAgentId,
      sessionId: selectedSessionId,
      taskPrompt: String(taskPromptInput || "").trim() || DEFAULT_SETTINGS.taskPrompt,
    });

    setIsSaving(true);
    setStatus({ type: "loading", text: "保存中..." });

    try {
      const normalizedToken = normalizeAuthToken(tokenInput);
      await saveSettings(nextSettings);
      if (normalizedToken) {
        await saveConnectionToken(normalizedConnection.id, normalizedToken);
      } else {
        await clearConnectionToken(normalizedConnection.id);
      }

      setSettings(nextSettings);
      setSelectedConnectionId(normalizedConnection.id);
      setConnectionDraft(normalizedConnection);
      await inspectConnection(normalizedConnection, nextSettings);
      setStatus({
        type: "success",
        text: "已保存，Popup 会使用新的连接和默认路由。",
      });
    } catch (error) {
      setStatus({
        type: "error",
        text: `保存失败：${readErrorText(error)}`,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    connectionDraft,
    inspectConnection,
    selectedAgentId,
    selectedConnectionId,
    selectedSessionId,
    settings,
    taskPromptInput,
    tokenInput,
  ]);

  return (
    <main className="mx-auto my-6 flex w-[min(760px,calc(100vw-32px))] min-w-0 flex-col gap-4 overflow-x-hidden">
      <header className="rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className="text-[0.62rem] uppercase tracking-[0.22em] text-muted-foreground">
          Extension
        </div>
        <h1 className="mt-1 text-xl font-medium tracking-[-0.02em] text-foreground">
          Chrome Extension Settings
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          管理多个 Server Connection，并为每个连接设置独立的 Token、默认 Agent 与默认 Session。
        </p>
      </header>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Server Connections
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-[12px] font-medium text-foreground transition hover:bg-background"
                type="button"
                onClick={handleCreateConnection}
              >
                新建连接
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-[12px] font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleDeleteConnection}
                disabled={settings.connections.length <= 1}
              >
                删除当前连接
              </button>
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-[12px] font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => {
                  void handleRefreshConnection();
                }}
                disabled={isLoadingConnectionState}
              >
                {isLoadingConnectionState ? "检查中..." : "重新检查"}
              </button>
            </div>
          </div>

          <ExtensionPopupSelect
            label="Current Connection"
            value={selectedConnectionId}
            placeholder="请选择连接"
            options={connectionOptions}
            onChange={(value) => {
              void handleSelectConnection(value);
            }}
            disabled={settings.connections.length === 0}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Connection Name
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={connectionDraft.name}
                onChange={(event) =>
                  setConnectionDraft((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                placeholder="Local Server"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Protocol
              <select
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={connectionDraft.protocol}
                onChange={(event) =>
                  setConnectionDraft((prev) => ({
                    ...prev,
                    protocol: normalizeConnectionProtocol(event.target.value),
                  }))
                }
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Host
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={connectionDraft.host}
                onChange={(event) =>
                  setConnectionDraft((prev) => ({
                    ...prev,
                    host: event.target.value,
                  }))
                }
                placeholder="127.0.0.1"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Port
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={String(connectionDraft.port || "")}
                onChange={(event) =>
                  setConnectionDraft((prev) => ({
                    ...prev,
                    port: Number.parseInt(event.target.value || "0", 10) || 0,
                  }))
                }
                placeholder="5315"
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Base Path
              <input
                className="w-full rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
                value={connectionDraft.basePath}
                onChange={(event) =>
                  setConnectionDraft((prev) => ({
                    ...prev,
                    basePath: event.target.value,
                  }))
                }
                placeholder="/downcity"
              />
            </label>

            <div className="rounded-[12px] border border-border bg-muted px-3 py-3 text-[12px] text-muted-foreground">
              {selectedConnection
                ? formatServerConnectionLabel(selectedConnection)
                : "当前没有可用连接"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Authentication
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              当前 Token 只作用于选中的 Server Connection。
            </p>
          </div>

          <label className="flex min-w-0 flex-col gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Bearer Token
            <textarea
              className="min-h-[92px] w-full resize-y rounded-[12px] border border-border bg-muted px-3 py-2.5 text-[12px] leading-[1.55] text-foreground outline-none transition focus:border-border-strong focus:bg-surface"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="粘贴 Bearer Token；支持直接粘贴 Bearer xxx 或纯 token"
            />
            <span className="rounded-[12px] bg-muted px-3 py-2 text-[11px] normal-case tracking-normal text-muted-foreground">
              如何获取：在当前机器终端执行 `town token create my-token`，或直接运行 `town token`。
            </span>
          </label>

          <div className="rounded-[12px] border border-border bg-muted px-3 py-3 text-[12px] text-muted-foreground">
            {authRequired
              ? "当前连接要求鉴权，保存 Token 后才能加载私有 Agent / Session。"
              : "当前连接未检测到强制鉴权；如服务开启了 Token，也可以在这里填写。"}
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid gap-5">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Default Routing
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              为当前连接选择 Popup 默认投递的 Agent 与 Session。
            </p>
          </div>

          <ExtensionPopupSelect
            label="Default Agent"
            value={selectedAgentId}
            placeholder={
              isLoadingAgents
                ? "加载 Agent 中..."
                : agentOptions.length > 0
                  ? "请选择默认 Agent"
                  : "暂无可用 Agent"
            }
            options={agentOptions}
            onChange={(value) => {
              void handleSelectAgent(value);
            }}
            disabled={isLoadingConnectionState || isLoadingAgents || agentOptions.length === 0}
          />

          <ExtensionPopupSelect
            label="Default Session"
            value={selectedSessionId}
            placeholder={
              !selectedAgentId
                ? "请先选择 Agent"
                : isLoadingSessions
                  ? "加载 Session 中..."
                  : sessionOptions.length > 0
                    ? "请选择默认 Session"
                    : "暂无可用 Session"
            }
            options={sessionOptions}
            onChange={(value) => setSelectedSessionId(value)}
            disabled={
              isLoadingConnectionState ||
              !selectedAgentId ||
              isLoadingSessions ||
              sessionOptions.length === 0
            }
          />

          {!selectedSessionId && sessionOptions.length > 1 ? (
            <div className="rounded-[12px] border border-border bg-muted px-3 py-2 text-[12px] text-muted-foreground">
              当前 Agent 下有多个 Session，建议明确选择默认目标，避免发送到错误会话。
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[18px] border border-border bg-surface p-5">
        <div className="grid gap-4">
          <div>
            <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
              Default Ask
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Popup 会把这里的内容作为默认 Ask，用户仍可在发送前修改。
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

      <footer className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-surface px-5 py-4">
        <div className={`text-sm ${getStatusClass(status.type)}`}>{status.text}</div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-primary bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#232326] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => {
            void handleSaveAllSettings();
          }}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
