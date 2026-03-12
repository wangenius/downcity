/**
 * Console Dashboard 前端。
 *
 * 关键点（中文）
 * - 这是状态面板，不是聊天主界面。
 * - 仅保留一个附属对话入口：固定 local_ui context。
 */

const LOCAL_UI_CONTEXT_ID = "local_ui";
const AGENT_STORAGE_KEY = "sma_console_ui_selected_agent";

const state = {
  agents: [],
  selectedAgentId: "",
  overview: null,
  services: [],
  chatChannels: [],
  tasks: [],
  contexts: [],
  logs: [],
  prompt: null,
  localMessages: [],
  sending: false,
};

const refs = {
  agentSelect: document.getElementById("agent-select"),
  refreshAllBtn: document.getElementById("refresh-all-btn"),
  topbarStatus: document.getElementById("topbar-status"),

  summaryCards: document.getElementById("summary-cards"),
  servicesQuick: document.getElementById("services-quick"),
  contextsTable: document.getElementById("contexts-table"),

  servicesTable: document.getElementById("services-table"),
  chatLinksTable: document.getElementById("chat-links-table"),
  tasksTable: document.getElementById("tasks-table"),
  logsView: document.getElementById("logs-view"),

  refreshServicesBtn: document.getElementById("refresh-services-btn"),
  refreshTasksBtn: document.getElementById("refresh-tasks-btn"),
  refreshChatLinksBtn: document.getElementById("refresh-chat-links-btn"),
  reconnectAllChatBtn: document.getElementById("reconnect-all-chat-btn"),
  refreshLogsBtn: document.getElementById("refresh-logs-btn"),

  promptMeta: document.getElementById("prompt-meta"),
  promptSections: document.getElementById("prompt-sections"),
  refreshPromptBtn: document.getElementById("refresh-prompt-btn"),

  localChatList: document.getElementById("local-chat-list"),
  localChatInput: document.getElementById("local-chat-input"),
  localChatSendBtn: document.getElementById("local-chat-send-btn"),
  refreshChatBtn: document.getElementById("refresh-chat-btn"),

  toast: document.getElementById("toast"),
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts) return "-";
  const value = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(value) || Number.isNaN(value)) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function shortText(text, max = 120) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
}

function showToast(message, type = "info") {
  refs.toast.className = `toast ${type} show`;
  refs.toast.innerHTML = escapeHtml(message);
  setTimeout(() => {
    refs.toast.className = "toast";
  }, 2200);
}

function setTopbarStatus(text, isError = false) {
  refs.topbarStatus.textContent = text;
  refs.topbarStatus.className = isError ? "status-pill error" : "status-pill";
}

function withSelectedAgent(path) {
  const rawPath = String(path || "");
  if (!rawPath.startsWith("/api/")) return rawPath;
  if (rawPath.startsWith("/api/ui/")) return rawPath;
  if (!state.selectedAgentId) return rawPath;
  const url = new URL(rawPath, window.location.origin);
  url.searchParams.set("agent", state.selectedAgentId);
  return `${url.pathname}${url.search}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(withSelectedAgent(path), {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error || body?.message || `${response.status} ${response.statusText}`;
    throw new Error(String(message));
  }

  if (body && typeof body === "object" && body.success === false) {
    throw new Error(String(body.error || body.message || "request failed"));
  }

  return body;
}

function statusBadgeClass(raw) {
  const value = String(raw || "").toLowerCase();
  if (["running", "ok", "active", "enabled", "success"].includes(value)) return "ok";
  if (["stopped", "disabled", "paused", "error", "failed", "offline"].includes(value)) return "bad";
  return "warn";
}

function renderAgents() {
  const agents = Array.isArray(state.agents) ? state.agents : [];
  if (agents.length === 0) {
    refs.agentSelect.innerHTML = '<option value="">无运行中的 agent</option>';
    refs.agentSelect.disabled = true;
    return;
  }

  refs.agentSelect.disabled = false;
  refs.agentSelect.innerHTML = agents
    .map((agent) => {
      const id = String(agent.id || "");
      const name = String(agent.name || id || "unknown-agent");
      const host = String(agent.host || "127.0.0.1");
      const port = Number(agent.port || 0);
      const label = `${name} (${host}:${port})`;
      const selected = id === state.selectedAgentId ? "selected" : "";
      return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderSummaryCards() {
  if (!state.selectedAgentId || !state.overview) {
    refs.summaryCards.innerHTML = '<div class="empty">未选择可用 agent</div>';
    return;
  }

  const selected = state.agents.find((agent) => agent.id === state.selectedAgentId) || {};
  const tasks = state.overview?.tasks || {};
  const statusCount = tasks.statusCount || {};
  const contextsTotal = Number(state.overview?.contexts?.total || 0);
  const servicesTotal = Array.isArray(state.services) ? state.services.length : 0;

  refs.summaryCards.innerHTML = [
    {
      label: "Agent",
      value: String(selected.name || "-") ,
      sub: `pid ${selected.daemonPid || "-"} · ${selected.host || "-"}:${selected.port || "-"}`,
    },
    {
      label: "Services",
      value: String(servicesTotal),
      sub: "runtime services",
    },
    {
      label: "Tasks",
      value: String(tasks.total || 0),
      sub: `enabled ${statusCount.enabled || 0} / paused ${statusCount.paused || 0} / disabled ${statusCount.disabled || 0}`,
    },
    {
      label: "Contexts",
      value: String(contextsTotal),
      sub: `local_ui ${state.contexts.some((x) => x.contextId === LOCAL_UI_CONTEXT_ID) ? "exists" : "missing"}`,
    },
  ]
    .map((card) => `
      <article class="card">
        <div class="label">${escapeHtml(card.label)}</div>
        <div class="value">${escapeHtml(card.value)}</div>
        <div class="sub">${escapeHtml(card.sub)}</div>
      </article>
    `)
    .join("");
}

function renderServicesQuick() {
  if (!Array.isArray(state.services) || state.services.length === 0) {
    refs.servicesQuick.innerHTML = '<div class="empty">暂无 service 运行数据</div>';
    return;
  }

  refs.servicesQuick.innerHTML = state.services
    .map((item) => {
      const name = String(item.name || item.service || "unknown");
      const status = String(item.state || item.status || "unknown");
      const badge = statusBadgeClass(status);
      return `
        <div class="quick-item">
          <span>${escapeHtml(name)}</span>
          <span class="badge ${badge}">${escapeHtml(status)}</span>
        </div>
      `;
    })
    .join("");
}

function renderContextsTable() {
  const rows = Array.isArray(state.contexts) ? state.contexts : [];
  if (rows.length === 0) {
    refs.contextsTable.innerHTML = '<div class="empty">暂无 context</div>';
    return;
  }

  const topRows = [...rows]
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    .slice(0, 12);

  refs.contextsTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Context</th>
          <th>Role</th>
          <th>Msgs</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        ${topRows
          .map((ctx) => {
            const id = String(ctx.contextId || "-");
            const role = String(ctx.lastRole || "-");
            const count = Number(ctx.messageCount || 0);
            const updated = formatTime(ctx.updatedAt);
            const marker = id === LOCAL_UI_CONTEXT_ID ? "local_ui" : shortText(id, 30);
            return `
              <tr>
                <td>${escapeHtml(marker)}</td>
                <td>${escapeHtml(role)}</td>
                <td>${escapeHtml(String(count))}</td>
                <td>${escapeHtml(updated)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderServicesTable() {
  const rows = Array.isArray(state.services) ? state.services : [];
  if (rows.length === 0) {
    refs.servicesTable.innerHTML = '<div class="empty">暂无 service 数据</div>';
    return;
  }

  refs.servicesTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Service</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((svc) => {
            const name = String(svc.name || svc.service || "unknown");
            const status = String(svc.state || svc.status || "unknown");
            const badge = statusBadgeClass(status);
            return `
              <tr>
                <td>${escapeHtml(name)}</td>
                <td><span class="badge ${badge}">${escapeHtml(status)}</span></td>
                <td>
                  <button class="control-btn ghost" data-service-action="start" data-service-name="${escapeHtml(name)}">start</button>
                  <button class="control-btn ghost" data-service-action="restart" data-service-name="${escapeHtml(name)}">restart</button>
                  <button class="control-btn ghost" data-service-action="stop" data-service-name="${escapeHtml(name)}">stop</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderChatLinksTable() {
  const rows = Array.isArray(state.chatChannels) ? state.chatChannels : [];
  if (rows.length === 0) {
    refs.chatLinksTable.innerHTML = '<div class="empty">暂无 chat 渠道状态</div>';
    return;
  }

  refs.chatLinksTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Channel</th>
          <th>Link</th>
          <th>Runtime</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((item) => {
            const channel = String(item.channel || "unknown");
            const linkState = String(item.linkState || "unknown");
            const statusText = String(item.statusText || "unknown");
            const running = item.running === true;
            const enabled = item.enabled === true;
            const configured = item.configured === true;
            const actionDisabled = !enabled || !configured;
            const disabledAttr = actionDisabled ? "disabled" : "";
            const badge = statusBadgeClass(linkState);
            const runtimeLabel = enabled
              ? configured
                ? running
                  ? statusText
                  : "stopped"
                : "config_missing"
              : "disabled";
            return `
              <tr>
                <td>${escapeHtml(channel)}</td>
                <td><span class="badge ${badge}">${escapeHtml(linkState)}</span></td>
                <td>${escapeHtml(runtimeLabel)}</td>
                <td>
                  <button class="control-btn ghost" data-chat-action="test" data-chat-channel="${escapeHtml(channel)}" ${disabledAttr}>test</button>
                  <button class="control-btn ghost" data-chat-action="reconnect" data-chat-channel="${escapeHtml(channel)}" ${disabledAttr}>reconnect</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTasksTable() {
  const rows = Array.isArray(state.tasks) ? state.tasks : [];
  if (rows.length === 0) {
    refs.tasksTable.innerHTML = '<div class="empty">暂无 task 数据</div>';
    return;
  }

  refs.tasksTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Status</th>
          <th>Cron</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((task) => {
            const id = String(task.taskId || task.id || "-");
            const status = String(task.status || "unknown");
            const cron = String(task.cron || "-");
            const badge = statusBadgeClass(status);
            return `
              <tr>
                <td>${escapeHtml(id)}</td>
                <td><span class="badge ${badge}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(cron)}</td>
                <td>
                  <button class="control-btn ghost" data-task-action="run" data-task-id="${escapeHtml(id)}">run</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderLogs() {
  const rows = Array.isArray(state.logs) ? state.logs : [];
  if (rows.length === 0) {
    refs.logsView.textContent = "暂无日志";
    return;
  }
  refs.logsView.textContent = rows
    .map((item) => {
      const time = formatTime(item.timestamp);
      const level = String(item.type || item.level || "info").toUpperCase();
      const message = String(item.message || "");
      return `[${time}] [${level}] ${message}`;
    })
    .join("\n");
}

function renderPromptComposition() {
  const data = state.prompt;
  if (!data || !Array.isArray(data.sections)) {
    refs.promptMeta.innerHTML = '<span class="empty">暂无 prompt 数据</span>';
    refs.promptSections.innerHTML = "";
    return;
  }

  refs.promptMeta.textContent = `context: ${data.contextId || LOCAL_UI_CONTEXT_ID} · messages ${data.totalMessages || 0} · chars ${data.totalChars || 0}`;

  refs.promptSections.innerHTML = data.sections
    .map((section, sectionIndex) => {
      const title = String(section.title || section.key || "section");
      const items = Array.isArray(section.items) ? section.items : [];
      const open = sectionIndex <= 1 ? "open" : "";
      return `
        <details class="prompt-card" ${open}>
          <summary>${escapeHtml(title)} · ${items.length}</summary>
          <div class="prompt-body">
            ${items
              .map((item) => {
                const index = Number(item.index || 0);
                const content = String(item.content || "");
                return `
                  <div>
                    <div class="field-label">#${escapeHtml(String(index || "-"))}</div>
                    <pre>${escapeHtml(content)}</pre>
                  </div>
                `;
              })
              .join("")}
          </div>
        </details>
      `;
    })
    .join("");
}

function renderLocalChat() {
  const rows = Array.isArray(state.localMessages) ? state.localMessages : [];
  if (rows.length === 0) {
    refs.localChatList.innerHTML = '<div class="empty">local_ui 暂无消息</div>';
    return;
  }

  const turns = rows.slice(-16);
  refs.localChatList.innerHTML = turns
    .map((msg) => {
      const role = String(msg.role || "assistant");
      const text = String(msg.text || "").trim() || "(empty)";
      const ts = formatTime(msg.ts);
      return `
        <article class="chat-item">
          <div class="meta">${escapeHtml(role.toUpperCase())} · ${escapeHtml(ts)}</div>
          <div class="body">${escapeHtml(text)}</div>
        </article>
      `;
    })
    .join("");
}

function clearPanelDataForNoAgent() {
  state.overview = null;
  state.services = [];
  state.chatChannels = [];
  state.tasks = [];
  state.contexts = [];
  state.logs = [];
  state.prompt = null;
  state.localMessages = [];
  renderSummaryCards();
  renderServicesQuick();
  renderContextsTable();
  renderServicesTable();
  renderChatLinksTable();
  renderTasksTable();
  renderLogs();
  renderPromptComposition();
  renderLocalChat();
}

async function refreshAgents() {
  const cachedId = localStorage.getItem(AGENT_STORAGE_KEY) || "";
  const preferred = state.selectedAgentId || cachedId;
  const endpoint = preferred
    ? `/api/ui/agents?agent=${encodeURIComponent(preferred)}`
    : "/api/ui/agents";
  const data = await requestJson(endpoint);
  state.agents = Array.isArray(data.agents) ? data.agents : [];
  state.selectedAgentId = String(data.selectedAgentId || "");
  if (state.selectedAgentId) {
    localStorage.setItem(AGENT_STORAGE_KEY, state.selectedAgentId);
  }
  renderAgents();
}

async function refreshOverview() {
  if (!state.selectedAgentId) return;
  state.overview = await requestJson("/api/tui/overview?contextLimit=40");
}

async function refreshServices() {
  if (!state.selectedAgentId) return;
  const data = await requestJson("/api/tui/services");
  state.services = Array.isArray(data.services) ? data.services : [];
}

async function refreshChatChannels() {
  if (!state.selectedAgentId) return;
  try {
    const data = await requestJson("/api/services/command", {
      method: "POST",
      body: JSON.stringify({
        serviceName: "chat",
        command: "status",
        payload: {},
      }),
    });
    const channels = data?.data?.channels;
    state.chatChannels = Array.isArray(channels) ? channels : [];
  } catch (error) {
    // 关键点（中文）：旧版 runtime 可能不支持 chat.status，降级为空列表避免整页失败。
    const message = String(error?.message || error || "");
    if (/404|not found|unknown action|unknown service/i.test(message)) {
      state.chatChannels = [];
      return;
    }
    throw error;
  }
}

async function refreshTasks() {
  if (!state.selectedAgentId) return;
  const data = await requestJson("/api/tui/tasks");
  state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
}

async function refreshContexts() {
  if (!state.selectedAgentId) return;
  const data = await requestJson("/api/tui/contexts?limit=120");
  state.contexts = Array.isArray(data.contexts) ? data.contexts : [];
}

async function refreshLogs() {
  if (!state.selectedAgentId) return;
  const data = await requestJson("/api/tui/logs?limit=260");
  state.logs = Array.isArray(data.logs) ? data.logs : [];
}

async function refreshPrompt() {
  if (!state.selectedAgentId) return;
  try {
    state.prompt = await requestJson(`/api/tui/system-prompt?contextId=${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}`);
  } catch (error) {
    // 关键点（中文）：agent runtime 若未注册该接口（404），UI 保持可用并隐藏 prompt 面板数据。
    const message = String(error?.message || error || "");
    if (/404|not found/i.test(message)) {
      state.prompt = null;
      return;
    }
    throw error;
  }
}

async function refreshLocalChat() {
  if (!state.selectedAgentId) return;
  const data = await requestJson(`/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/messages?limit=80`);
  state.localMessages = Array.isArray(data.messages) ? data.messages : [];
}

async function refreshDashboard() {
  try {
    await refreshAgents();
    if (!state.selectedAgentId) {
      clearPanelDataForNoAgent();
      setTopbarStatus("未检测到运行中的 agent");
      return;
    }

    await Promise.all([
      refreshOverview(),
      refreshServices(),
      refreshChatChannels(),
      refreshTasks(),
      refreshContexts(),
      refreshLogs(),
      refreshPrompt(),
      refreshLocalChat(),
    ]);

    renderSummaryCards();
    renderServicesQuick();
    renderContextsTable();
    renderServicesTable();
    renderChatLinksTable();
    renderTasksTable();
    renderLogs();
    renderPromptComposition();
    renderLocalChat();

    const selected = state.agents.find((x) => x.id === state.selectedAgentId) || {};
    setTopbarStatus(`在线 · ${selected.name || "agent"} · ${selected.host || "127.0.0.1"}:${selected.port || "-"}`);
  } catch (error) {
    setTopbarStatus(`连接失败: ${String(error.message || error)}`, true);
    showToast(`刷新失败: ${String(error.message || error)}`, "error");
  }
}

async function controlService(name, action) {
  try {
    await requestJson("/api/services/control", {
      method: "POST",
      body: JSON.stringify({ serviceName: name, action }),
    });
    showToast(`service ${name} ${action} 已执行`, "success");
    await refreshServices();
    renderServicesQuick();
    renderServicesTable();
  } catch (error) {
    showToast(`service 操作失败: ${String(error.message || error)}`, "error");
  }
}

async function runChatChannelAction(action, channel) {
  try {
    const payload = channel ? { channel } : {};
    const data = await requestJson("/api/services/command", {
      method: "POST",
      body: JSON.stringify({
        serviceName: "chat",
        command: action,
        payload,
      }),
    });

    if (action === "test") {
      const results = Array.isArray(data?.data?.results) ? data.data.results : [];
      const one = channel
        ? results.find((item) => String(item.channel || "") === channel)
        : results[0];
      const message = String(one?.message || "test completed");
      showToast(`${channel || "chat"} test: ${message}`, one?.success ? "success" : "error");
    } else {
      showToast(`${channel || "chat"} ${action} 已执行`, "success");
    }

    await refreshChatChannels();
    renderChatLinksTable();
    await refreshServices();
    renderServicesQuick();
    renderServicesTable();
  } catch (error) {
    showToast(`chat ${action} 失败: ${String(error.message || error)}`, "error");
  }
}

async function runTask(taskId) {
  try {
    await requestJson("/api/tui/tasks/run", {
      method: "POST",
      body: JSON.stringify({ taskId, reason: "dashboard_manual_trigger" }),
    });
    showToast(`task ${taskId} 已触发`, "success");
    await Promise.all([refreshTasks(), refreshLogs()]);
    renderTasksTable();
    renderLogs();
  } catch (error) {
    showToast(`task 执行失败: ${String(error.message || error)}`, "error");
  }
}

async function sendLocalMessage() {
  if (state.sending) return;
  const instructions = String(refs.localChatInput.value || "").trim();
  if (!instructions) return;
  if (!state.selectedAgentId) {
    showToast("当前无可用 agent", "error");
    return;
  }

  state.sending = true;
  refs.localChatSendBtn.disabled = true;
  refs.localChatSendBtn.textContent = "发送中...";

  try {
    await requestJson(`/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/execute`, {
      method: "POST",
      body: JSON.stringify({ instructions }),
    });
    refs.localChatInput.value = "";
    await Promise.all([refreshLocalChat(), refreshLogs(), refreshContexts()]);
    renderLocalChat();
    renderLogs();
    renderContextsTable();
    showToast("已发送到 local_ui", "success");
  } catch (error) {
    showToast(`发送失败: ${String(error.message || error)}`, "error");
  } finally {
    state.sending = false;
    refs.localChatSendBtn.disabled = false;
    refs.localChatSendBtn.textContent = "发送";
  }
}

function bindEvents() {
  refs.refreshAllBtn.addEventListener("click", () => {
    void refreshDashboard();
  });

  refs.agentSelect.addEventListener("change", (event) => {
    state.selectedAgentId = String(event.target.value || "");
    if (state.selectedAgentId) {
      localStorage.setItem(AGENT_STORAGE_KEY, state.selectedAgentId);
    }
    void refreshDashboard();
  });

  refs.refreshServicesBtn.addEventListener("click", () => {
    void refreshServices().then(() => {
      renderServicesQuick();
      renderServicesTable();
    });
  });

  refs.refreshTasksBtn.addEventListener("click", () => {
    void refreshTasks().then(renderTasksTable);
  });

  refs.refreshChatLinksBtn.addEventListener("click", () => {
    void refreshChatChannels().then(renderChatLinksTable);
  });

  refs.reconnectAllChatBtn.addEventListener("click", () => {
    void runChatChannelAction("reconnect", "");
  });

  refs.refreshLogsBtn.addEventListener("click", () => {
    void refreshLogs().then(renderLogs);
  });

  refs.refreshPromptBtn.addEventListener("click", () => {
    void refreshPrompt().then(renderPromptComposition);
  });

  refs.refreshChatBtn.addEventListener("click", () => {
    void refreshLocalChat().then(renderLocalChat);
  });

  refs.localChatSendBtn.addEventListener("click", () => {
    void sendLocalMessage();
  });

  refs.localChatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void sendLocalMessage();
    }
  });

  refs.servicesTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-service-action]");
    if (!target) return;
    const action = String(target.getAttribute("data-service-action") || "");
    const name = String(target.getAttribute("data-service-name") || "");
    if (!action || !name) return;
    void controlService(name, action);
  });

  refs.tasksTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-task-action]");
    if (!target) return;
    const action = String(target.getAttribute("data-task-action") || "");
    const taskId = String(target.getAttribute("data-task-id") || "");
    if (action === "run" && taskId) {
      void runTask(taskId);
    }
  });

  refs.chatLinksTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-chat-action]");
    if (!target) return;
    const action = String(target.getAttribute("data-chat-action") || "");
    const channel = String(target.getAttribute("data-chat-channel") || "");
    if (!action || !channel) return;
    if (action === "test" || action === "reconnect") {
      void runChatChannelAction(action, channel);
    }
  });
}

function startPolling() {
  setInterval(() => {
    void refreshDashboard();
  }, 12000);
}

async function bootstrap() {
  bindEvents();
  await refreshDashboard();
  startPolling();
}

void bootstrap();
