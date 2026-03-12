/**
 * Console UI React Dashboard 页面。
 *
 * 关键点（中文）
 * - 完整迁移旧版 `package/public/app.js` 的逻辑。
 * - Dashboard 是主功能，local_ui 对话是附属入口。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  UiAgentOption,
  UiAgentsResponse,
  UiChatActionResult,
  UiChatChannelStatus,
  UiChatStatusResponse,
  UiLocalMessage,
  UiLocalMessagesResponse,
  UiLogItem,
  UiLogsResponse,
  UiOverviewResponse,
  UiPromptResponse,
  UiServiceItem,
  UiServicesResponse,
  UiTaskItem,
  UiTasksResponse,
} from "./types/Dashboard";

const LOCAL_UI_CONTEXT_ID = "local_ui";
const AGENT_STORAGE_KEY = "sma_console_ui_selected_agent";

type ToastType = "info" | "success" | "error";

interface ToastState {
  message: string;
  type: ToastType;
}

function formatTime(ts?: number | string): string {
  if (ts === undefined || ts === null) return "-";
  const value = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(value) || Number.isNaN(value)) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function statusBadgeClass(raw?: string): "ok" | "warn" | "bad" {
  const value = String(raw || "").toLowerCase();
  if (["running", "ok", "active", "enabled", "success"].includes(value)) return "ok";
  if (["stopped", "disabled", "paused", "error", "failed", "offline"].includes(value)) return "bad";
  return "warn";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function App() {
  const [agents, setAgents] = useState<UiAgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const [overview, setOverview] = useState<UiOverviewResponse | null>(null);
  const [services, setServices] = useState<UiServiceItem[]>([]);
  const [chatChannels, setChatChannels] = useState<UiChatChannelStatus[]>([]);
  const [tasks, setTasks] = useState<UiTaskItem[]>([]);
  const [logs, setLogs] = useState<UiLogItem[]>([]);
  const [prompt, setPrompt] = useState<UiPromptResponse | null>(null);
  const [localMessages, setLocalMessages] = useState<UiLocalMessage[]>([]);

  const [topbarStatus, setTopbarStatus] = useState("连接中...");
  const [topbarError, setTopbarError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const selected = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const withSelectedAgent = useCallback(
    (path: string): string => {
      const rawPath = String(path || "");
      if (!rawPath.startsWith("/api/")) return rawPath;
      if (rawPath.startsWith("/api/ui/")) return rawPath;
      if (!selectedAgentId) return rawPath;
      const url = new URL(rawPath, window.location.origin);
      url.searchParams.set("agent", selectedAgentId);
      return `${url.pathname}${url.search}`;
    },
    [selectedAgentId],
  );

  const requestJson = useCallback(
    async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
      const response = await fetch(withSelectedAgent(path), {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
      });

      const raw = await response.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = null;
      }

      if (!response.ok) {
        const errorMessage =
          typeof body?.error === "string"
            ? body.error
            : typeof body?.message === "string"
              ? body.message
              : `${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      if (body && body.success === false) {
        const failMessage =
          typeof body.error === "string"
            ? body.error
            : typeof body.message === "string"
              ? body.message
              : "request failed";
        throw new Error(failMessage);
      }

      if (body === null) {
        throw new Error(`Invalid JSON response from ${path}`);
      }

      return body as T;
    },
    [withSelectedAgent],
  );

  const clearPanelDataForNoAgent = useCallback(() => {
    setOverview(null);
    setServices([]);
    setChatChannels([]);
    setTasks([]);
    setLogs([]);
    setPrompt(null);
    setLocalMessages([]);
  }, []);

  const refreshAgents = useCallback(async (): Promise<string> => {
    const cachedId = localStorage.getItem(AGENT_STORAGE_KEY) || "";
    const preferred = selectedAgentId || cachedId;
    const endpoint = preferred
      ? `/api/ui/agents?agent=${encodeURIComponent(preferred)}`
      : "/api/ui/agents";
    const data = await requestJson<UiAgentsResponse>(endpoint);

    const list = Array.isArray(data.agents) ? data.agents : [];
    const nextId = String(data.selectedAgentId || list[0]?.id || "");
    setAgents(list);
    setSelectedAgentId(nextId);

    if (nextId) {
      localStorage.setItem(AGENT_STORAGE_KEY, nextId);
    } else {
      localStorage.removeItem(AGENT_STORAGE_KEY);
    }

    return nextId;
  }, [requestJson, selectedAgentId]);

  const refreshOverview = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiOverviewResponse>("/api/tui/overview?contextLimit=40");
      setOverview(data);
    },
    [requestJson],
  );

  const refreshServices = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiServicesResponse>("/api/tui/services");
      setServices(Array.isArray(data.services) ? data.services : []);
    },
    [requestJson],
  );

  const refreshChatChannels = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        const data = await requestJson<UiChatStatusResponse>("/api/services/command", {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: "status",
            payload: {},
          }),
        });
        setChatChannels(Array.isArray(data?.data?.channels) ? data.data.channels : []);
      } catch (error) {
        const message = getErrorMessage(error);
        if (/404|not found|unknown action|unknown service/i.test(message)) {
          setChatChannels([]);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshTasks = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiTasksResponse>("/api/tui/tasks");
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    },
    [requestJson],
  );

  const refreshLogs = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiLogsResponse>("/api/tui/logs?limit=260");
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    },
    [requestJson],
  );

  const refreshPrompt = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        const data = await requestJson<UiPromptResponse>(
          `/api/tui/system-prompt?contextId=${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}`,
        );
        setPrompt(data);
      } catch (error) {
        const message = getErrorMessage(error);
        if (/404|not found/i.test(message)) {
          setPrompt(null);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshLocalChat = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiLocalMessagesResponse>(
        `/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/messages?limit=80`,
      );
      setLocalMessages(Array.isArray(data.messages) ? data.messages : []);
    },
    [requestJson],
  );

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const nextId = await refreshAgents();
      if (!nextId) {
        clearPanelDataForNoAgent();
        setTopbarError(false);
        setTopbarStatus("未检测到运行中的 agent");
        return;
      }

      await Promise.all([
        refreshOverview(nextId),
        refreshServices(nextId),
        refreshChatChannels(nextId),
        refreshTasks(nextId),
        refreshLogs(nextId),
        refreshPrompt(nextId),
        refreshLocalChat(nextId),
      ]);

      const selectedAgent = agents.find((item) => item.id === nextId);
      setTopbarError(false);
      setTopbarStatus(
        `在线 · ${selectedAgent?.name || "agent"} · ${selectedAgent?.host || "127.0.0.1"}:${selectedAgent?.port || "-"}`,
      );
    } catch (error) {
      const message = getErrorMessage(error);
      setTopbarError(true);
      setTopbarStatus(`连接失败: ${message}`);
      showToast(`刷新失败: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [
    agents,
    clearPanelDataForNoAgent,
    refreshAgents,
    refreshChatChannels,
    refreshLocalChat,
    refreshLogs,
    refreshOverview,
    refreshPrompt,
    refreshServices,
    refreshTasks,
    showToast,
  ]);

  const controlService = useCallback(
    async (serviceName: string, action: string) => {
      try {
        await requestJson("/api/services/control", {
          method: "POST",
          body: JSON.stringify({ serviceName, action }),
        });
        showToast(`service ${serviceName} ${action} 已执行`, "success");
        await refreshServices(selectedAgentId);
      } catch (error) {
        showToast(`service 操作失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshServices, requestJson, selectedAgentId, showToast],
  );

  const runChatChannelAction = useCallback(
    async (action: "test" | "reconnect", channel: string) => {
      try {
        const payload = channel ? { channel } : {};
        const data = await requestJson<UiChatStatusResponse>("/api/services/command", {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: action,
            payload,
          }),
        });

        if (action === "test") {
          const results = Array.isArray(data?.data?.results) ? data.data.results : [];
          const one: UiChatActionResult | undefined = channel
            ? results.find((item) => String(item.channel || "") === channel)
            : results[0];
          const message = String(one?.message || "test completed");
          showToast(`${channel || "chat"} test: ${message}`, one?.success ? "success" : "error");
        } else {
          showToast(`${channel || "chat"} ${action} 已执行`, "success");
        }

        await Promise.all([refreshChatChannels(selectedAgentId), refreshServices(selectedAgentId)]);
      } catch (error) {
        showToast(`chat ${action} 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshChatChannels, refreshServices, requestJson, selectedAgentId, showToast],
  );

  const runTask = useCallback(
    async (taskId: string) => {
      try {
        await requestJson("/api/tui/tasks/run", {
          method: "POST",
          body: JSON.stringify({ taskId, reason: "dashboard_manual_trigger" }),
        });
        showToast(`task ${taskId} 已触发`, "success");
        await Promise.all([refreshTasks(selectedAgentId), refreshLogs(selectedAgentId)]);
      } catch (error) {
        showToast(`task 执行失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshLogs, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const sendLocalMessage = useCallback(async () => {
    if (sending) return;
    const instructions = chatInput.trim();
    if (!instructions) return;
    if (!selectedAgentId) {
      showToast("当前无可用 agent", "error");
      return;
    }

    setSending(true);
    try {
      await requestJson(`/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/execute`, {
        method: "POST",
        body: JSON.stringify({ instructions }),
      });
      setChatInput("");
      await Promise.all([
        refreshLocalChat(selectedAgentId),
        refreshLogs(selectedAgentId),
        refreshOverview(selectedAgentId),
      ]);
      showToast("已发送到 local_ui", "success");
    } catch (error) {
      showToast(`发送失败: ${getErrorMessage(error)}`, "error");
    } finally {
      setSending(false);
    }
  }, [
    chatInput,
    refreshLocalChat,
    refreshLogs,
    refreshOverview,
    requestJson,
    selectedAgentId,
    sending,
    showToast,
  ]);

  useEffect(() => {
    void refreshDashboard();
    const timer = window.setInterval(() => {
      void refreshDashboard();
    }, 12000);
    return () => {
      window.clearInterval(timer);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [refreshDashboard]);

  useEffect(() => {
    if (!selectedAgentId) return;
    localStorage.setItem(AGENT_STORAGE_KEY, selectedAgentId);
  }, [selectedAgentId]);

  const contextItems = Array.isArray(overview?.contexts?.items) ? overview?.contexts?.items : [];
  const taskStatusCount = overview?.tasks?.statusCount;
  const promptSections = Array.isArray(prompt?.sections) ? prompt.sections : [];
  const chatTurns = localMessages.slice(-16);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" />
          <div>
            <h1>Console Dashboard</h1>
            <p>Agent Runtime State Board</p>
          </div>
        </div>
        <div className="topbar-controls">
          <label className="field-label" htmlFor="agent-select">
            Agent
          </label>
          <select
            id="agent-select"
            className="control-select"
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            disabled={agents.length === 0}
          >
            {agents.length === 0 ? (
              <option value="">无运行中的 agent</option>
            ) : (
              agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {`${agent.name || "unknown-agent"} (${agent.host || "127.0.0.1"}:${agent.port || 0})`}
                </option>
              ))
            )}
          </select>
          <button className="control-btn" disabled={loading} onClick={() => void refreshDashboard()}>
            {loading ? "刷新中..." : "刷新面板"}
          </button>
          <span className={`status-pill${topbarError ? " error" : ""}`}>{topbarStatus}</span>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel panel-main">
          <div className="panel-head">
            <h2>Runtime Dashboard</h2>
          </div>

          <div className="stack-block">
            <h3>Summary</h3>
            {!selectedAgentId ? (
              <div className="empty">未选择可用 agent</div>
            ) : (
              <div className="summary-cards">
                <article className="card">
                  <div className="label">Agent</div>
                  <div className="value">{selected?.name || "-"}</div>
                  <div className="sub">{`pid ${selected?.daemonPid || "-"} · ${selected?.host || "-"}:${selected?.port || "-"}`}</div>
                </article>
                <article className="card">
                  <div className="label">Services</div>
                  <div className="value">{services.length}</div>
                  <div className="sub">runtime services</div>
                </article>
                <article className="card">
                  <div className="label">Tasks</div>
                  <div className="value">{overview?.tasks?.total || 0}</div>
                  <div className="sub">{`enabled ${taskStatusCount?.enabled || 0} / paused ${taskStatusCount?.paused || 0} / disabled ${taskStatusCount?.disabled || 0}`}</div>
                </article>
                <article className="card">
                  <div className="label">Contexts</div>
                  <div className="value">{overview?.contexts?.total || 0}</div>
                  <div className="sub">
                    {`local_ui ${contextItems.some((item) => item.contextId === LOCAL_UI_CONTEXT_ID) ? "exists" : "missing"}`}
                  </div>
                </article>
              </div>
            )}
          </div>

          <div className="stack-block">
            <h3>Services Runtime</h3>
            <div className="table-wrap">
              {services.length === 0 ? (
                <div className="empty">暂无 service 数据</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((svc) => {
                      const name = String(svc.name || svc.service || "unknown");
                      const status = String(svc.state || svc.status || "unknown");
                      return (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>
                          </td>
                          <td>
                            <div className="actions">
                              <button className="control-btn ghost" onClick={() => void controlService(name, "start")}>
                                start
                              </button>
                              <button
                                className="control-btn ghost"
                                onClick={() => void controlService(name, "restart")}
                              >
                                restart
                              </button>
                              <button className="control-btn ghost" onClick={() => void controlService(name, "stop")}>
                                stop
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="stack-block">
            <div className="panel-head inner split">
              <h3>Chat Channels</h3>
              <div className="head-actions">
                <button className="control-btn ghost" onClick={() => void runChatChannelAction("reconnect", "")}>
                  全部重连
                </button>
                <button className="control-btn ghost" onClick={() => void refreshChatChannels(selectedAgentId)}>
                  刷新连接
                </button>
              </div>
            </div>
            <div className="table-wrap">
              {chatChannels.length === 0 ? (
                <div className="empty">暂无 chat 渠道状态</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Link</th>
                      <th>Runtime</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chatChannels.map((item) => {
                      const channel = String(item.channel || "unknown");
                      const linkState = String(item.linkState || "unknown");
                      const statusText = String(item.statusText || "unknown");
                      const actionDisabled = !(item.enabled === true && item.configured === true);
                      const runtimeLabel =
                        item.enabled === true
                          ? item.configured === true
                            ? item.running === true
                              ? statusText
                              : "stopped"
                            : "config_missing"
                          : "disabled";
                      return (
                        <tr key={channel}>
                          <td>{channel}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(linkState)}`}>{linkState}</span>
                          </td>
                          <td>{runtimeLabel}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="control-btn ghost"
                                disabled={actionDisabled}
                                onClick={() => void runChatChannelAction("test", channel)}
                              >
                                test
                              </button>
                              <button
                                className="control-btn ghost"
                                disabled={actionDisabled}
                                onClick={() => void runChatChannelAction("reconnect", channel)}
                              >
                                reconnect
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="stack-block">
            <h3>Tasks Runtime</h3>
            <div className="table-wrap">
              {tasks.length === 0 ? (
                <div className="empty">暂无 task 数据</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Status</th>
                      <th>Cron</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => {
                      const taskId = String(task.taskId || task.id || "-");
                      const status = String(task.status || "unknown");
                      return (
                        <tr key={taskId}>
                          <td>{taskId}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(status)}`}>{status}</span>
                          </td>
                          <td>{String(task.cron || "-")}</td>
                          <td>
                            <button className="control-btn ghost" onClick={() => void runTask(taskId)}>
                              run
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="stack-block">
            <h3>Recent Logs</h3>
            <pre className="logs-view">
              {logs.length === 0
                ? "暂无日志"
                : logs
                    .map((item) => {
                      const time = formatTime(item.timestamp);
                      const level = String(item.type || item.level || "info").toUpperCase();
                      const message = String(item.message || "");
                      return `[${time}] [${level}] ${message}`;
                    })
                    .join("\n")}
            </pre>
          </div>
        </section>

        <aside className="panel panel-side">
          <div className="panel-head split">
            <h2>Prompt 构成</h2>
            <button className="control-btn ghost" onClick={() => void refreshPrompt(selectedAgentId)}>
              刷新
            </button>
          </div>
          <div className="prompt-meta">
            {prompt && promptSections.length > 0
              ? `context: ${prompt.contextId || LOCAL_UI_CONTEXT_ID} · messages ${prompt.totalMessages || 0} · chars ${prompt.totalChars || 0}`
              : <span className="empty-inline">暂无 prompt 数据</span>}
          </div>
          <div className="prompt-sections">
            {promptSections.map((section, sectionIndex) => {
              const title = String(section.title || section.key || "section");
              const items = Array.isArray(section.items) ? section.items : [];
              return (
                <details className="prompt-card" key={`${title}-${sectionIndex}`} open={sectionIndex <= 1}>
                  <summary>{`${title} · ${items.length}`}</summary>
                  <div className="prompt-body">
                    {items.map((item, itemIndex) => (
                      <div key={itemIndex}>
                        <div className="field-label">{`#${String(item.index || "-")}`}</div>
                        <pre>{String(item.content || "")}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>

          <div className="panel-head minor split">
            <h3>Local UI 对话（local_ui）</h3>
            <button className="control-btn ghost" onClick={() => void refreshLocalChat(selectedAgentId)}>
              刷新
            </button>
          </div>
          <div className="local-chat-list">
            {chatTurns.length === 0 ? (
              <div className="empty">local_ui 暂无消息</div>
            ) : (
              chatTurns.map((msg, index) => {
                const role = String(msg.role || "assistant");
                const text = String(msg.text || "").trim() || "(empty)";
                return (
                  <article className="chat-item" key={`${role}-${msg.ts || index}`}>
                    <div className="meta">{`${role.toUpperCase()} · ${formatTime(msg.ts)}`}</div>
                    <div className="body">{text}</div>
                  </article>
                );
              })
            )}
          </div>
          <div className="composer">
            <textarea
              className="composer-input"
              rows={3}
              placeholder="只会发送到 local_ui（Ctrl/Cmd + Enter）"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void sendLocalMessage();
                }
              }}
            />
            <button className="control-btn accent" disabled={sending} onClick={() => void sendLocalMessage()}>
              {sending ? "发送中..." : "发送"}
            </button>
          </div>
        </aside>
      </main>

      <div className={`toast ${toast ? `show ${toast.type}` : ""}`}>{toast?.message || ""}</div>
    </main>
  );
}
