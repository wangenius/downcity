/**
 * ShipMyAgent Web TUI 前端。
 *
 * 关键点（中文）
 * - 所有数据走 `/api/tui/*`（同源访问，不写死 3000 端口）。
 * - 覆盖四类核心视图：context 历史、多 context、services 状态、task 执行过程。
 * - 页面只做展示与轻量操作，不引入前端状态管理框架。
 */

const state = {
  contexts: [],
  contextFilter: "",
  selectedContextId: "",
  messages: [],
  services: [],
  tasks: [],
  selectedTaskId: "",
  taskRuns: [],
  selectedRunTimestamp: "",
  runDetail: null,
  logs: [],
  sending: false,
};

const refs = {
  topbarStatus: document.getElementById("topbar-status"),
  refreshAllBtn: document.getElementById("refresh-all-btn"),
  contextsCount: document.getElementById("contexts-count"),
  contextSearch: document.getElementById("context-search"),
  contextList: document.getElementById("context-list"),
  messagesTitle: document.getElementById("messages-title"),
  messageList: document.getElementById("message-list"),
  messageInput: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
  refreshMessagesBtn: document.getElementById("refresh-messages-btn"),
  servicesTable: document.getElementById("services-table"),
  refreshServicesBtn: document.getElementById("refresh-services-btn"),
  tasksTable: document.getElementById("tasks-table"),
  refreshTasksBtn: document.getElementById("refresh-tasks-btn"),
  taskRunsTitle: document.getElementById("task-runs-title"),
  taskRunsTable: document.getElementById("task-runs-table"),
  refreshRunsBtn: document.getElementById("refresh-runs-btn"),
  taskRunDetail: document.getElementById("task-run-detail"),
  logsView: document.getElementById("logs-view"),
  refreshLogsBtn: document.getElementById("refresh-logs-btn"),
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

function shortText(text, maxChars = 120) {
  const value = String(text || "").trim();
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 3)) + "...";
}

function showToast(message, type = "info") {
  refs.toast.className = `toast ${type} show`;
  refs.toast.innerHTML = escapeHtml(message);
  setTimeout(() => {
    refs.toast.className = "toast";
  }, 2200);
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
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

function setTopbarStatus(text, isError = false) {
  refs.topbarStatus.textContent = text;
  refs.topbarStatus.className = isError ? "topbar-status error" : "topbar-status";
}

function renderContexts() {
  const query = state.contextFilter.toLowerCase();
  const filtered = state.contexts.filter((ctx) =>
    String(ctx.contextId || "").toLowerCase().includes(query),
  );

  refs.contextsCount.textContent = String(filtered.length);

  if (filtered.length === 0) {
    refs.contextList.innerHTML = '<div class="empty">暂无 context</div>';
    return;
  }

  refs.contextList.innerHTML = filtered
    .map((ctx) => {
      const active = ctx.contextId === state.selectedContextId ? "active" : "";
      return `
        <button class="context-item ${active}" data-context-id="${escapeHtml(ctx.contextId)}">
          <div class="context-id">${escapeHtml(ctx.contextId)}</div>
          <div class="context-meta">
            <span>${escapeHtml(ctx.lastRole || "-")}</span>
            <span>${escapeHtml(formatTime(ctx.updatedAt))}</span>
          </div>
          <div class="context-preview">${escapeHtml(shortText(ctx.lastText || "", 90))}</div>
          <div class="context-count">${escapeHtml(String(ctx.messageCount || 0))} msgs</div>
        </button>
      `;
    })
    .join("");
}

function renderMessages() {
  if (!state.selectedContextId) {
    refs.messagesTitle.textContent = "消息历史";
    refs.messageList.innerHTML = '<div class="empty">请选择一个 context</div>';
    return;
  }

  refs.messagesTitle.textContent = `消息历史 · ${state.selectedContextId}`;

  if (!state.messages.length) {
    refs.messageList.innerHTML = '<div class="empty">该 context 暂无消息</div>';
    return;
  }

  refs.messageList.innerHTML = state.messages
    .map((msg) => {
      const role = String(msg.role || "assistant");
      const roleMap = {
        user: "USER",
        "tool-call": "TOOL CALL",
        "tool-result": "TOOL RESULT",
        assistant: "ASSISTANT",
      };
      const roleClass = ["user", "assistant", "tool-call", "tool-result"].includes(role)
        ? role
        : "assistant";
      const roleText = roleMap[role] || "ASSISTANT";
      const text = String(msg.text || "").trim() || "(empty)";
      const toolName = String(msg.toolName || "").trim();
      const roleLabel = toolName ? `${roleText} · ${toolName}` : roleText;
      return `
        <article class="message ${roleClass}">
          <div class="message-head">
            <span class="role">${escapeHtml(roleLabel)}</span>
            <span class="time">${escapeHtml(formatTime(msg.ts))}</span>
            <span class="meta">${escapeHtml(msg.kind || "normal")}/${escapeHtml(msg.source || "-")}</span>
          </div>
          <pre class="message-body">${escapeHtml(text)}</pre>
        </article>
      `;
    })
    .join("");

  refs.messageList.scrollTop = refs.messageList.scrollHeight;
}

function renderServices() {
  if (!state.services.length) {
    refs.servicesTable.innerHTML = '<div class="empty">暂无 service 运行状态</div>';
    return;
  }

  refs.servicesTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>service</th>
          <th>state</th>
          <th>updated</th>
          <th>action</th>
        </tr>
      </thead>
      <tbody>
        ${state.services
          .map(
            (svc) => `
          <tr>
            <td>${escapeHtml(svc.name || "-")}</td>
            <td><span class="badge ${escapeHtml(String(svc.state || ""))}">${escapeHtml(svc.state || "-")}</span></td>
            <td>${escapeHtml(formatTime(svc.updatedAt))}</td>
            <td>
              <div class="inline-actions">
                <button class="btn mini" data-svc-action="start" data-service-name="${escapeHtml(svc.name)}">start</button>
                <button class="btn mini" data-svc-action="stop" data-service-name="${escapeHtml(svc.name)}">stop</button>
                <button class="btn mini" data-svc-action="restart" data-service-name="${escapeHtml(svc.name)}">restart</button>
              </div>
            </td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTasks() {
  if (!state.tasks.length) {
    refs.tasksTable.innerHTML = '<div class="empty">暂无任务</div>';
    return;
  }

  refs.tasksTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>taskId</th>
          <th>status</th>
          <th>cron</th>
          <th>contextId</th>
          <th>action</th>
        </tr>
      </thead>
      <tbody>
        ${state.tasks
          .map((task) => {
            const selected = state.selectedTaskId === task.taskId ? "selected" : "";
            return `
              <tr class="${selected}">
                <td>${escapeHtml(task.taskId || "-")}</td>
                <td><span class="badge ${escapeHtml(task.status || "")}">${escapeHtml(task.status || "-")}</span></td>
                <td>${escapeHtml(task.cron || "-")}</td>
                <td title="${escapeHtml(task.contextId || "")}">${escapeHtml(shortText(task.contextId || "-", 28))}</td>
                <td>
                  <div class="inline-actions">
                    <button class="btn mini" data-task-action="select" data-task-id="${escapeHtml(task.taskId)}">runs</button>
                    <button class="btn mini" data-task-action="run" data-task-id="${escapeHtml(task.taskId)}">run</button>
                  </div>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderTaskRuns() {
  if (!state.selectedTaskId) {
    refs.taskRunsTitle.textContent = "Task Runs";
    refs.taskRunsTable.innerHTML = '<div class="empty">先在上方选择任务</div>';
    return;
  }

  refs.taskRunsTitle.textContent = `Task Runs · ${state.selectedTaskId}`;

  if (!state.taskRuns.length) {
    refs.taskRunsTable.innerHTML = '<div class="empty">暂无执行记录</div>';
    return;
  }

  refs.taskRunsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>timestamp</th>
          <th>status</th>
          <th>execution</th>
          <th>dialogue</th>
          <th>action</th>
        </tr>
      </thead>
      <tbody>
        ${state.taskRuns
          .map((run) => {
            const selected = state.selectedRunTimestamp === run.timestamp ? "selected" : "";
            return `
              <tr class="${selected}">
                <td>${escapeHtml(run.timestamp)}</td>
                <td><span class="badge ${escapeHtml(run.status || "")}">${escapeHtml(run.status || "-")}</span></td>
                <td>${escapeHtml(run.executionStatus || "-")}/${escapeHtml(run.resultStatus || "-")}</td>
                <td>${escapeHtml(String(run.dialogueRounds ?? "-"))}</td>
                <td>
                  <button class="btn mini" data-run-action="view" data-run-ts="${escapeHtml(run.timestamp)}">view</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRunDetail() {
  const detail = state.runDetail;
  if (!detail) {
    refs.taskRunDetail.innerHTML = "选择一个 run 查看执行过程";
    return;
  }

  const meta = detail.meta || {};
  const rounds = Array.isArray(detail?.dialogue?.rounds) ? detail.dialogue.rounds : [];
  const roundHtml = rounds.length
    ? rounds
        .map(
          (round) => `
          <div class="round-card">
            <div class="round-title">Round ${escapeHtml(String(round.round ?? "-"))}</div>
            <div class="round-field"><strong>ruleErrors:</strong> ${escapeHtml(JSON.stringify(round.ruleErrors || []))}</div>
            <div class="round-field"><strong>satisfied:</strong> ${escapeHtml(String(round?.userSimulator?.satisfied ?? false))}</div>
            <div class="round-field"><strong>reason:</strong> ${escapeHtml(String(round?.userSimulator?.reason || ""))}</div>
            <pre>${escapeHtml(shortText(String(round?.executorOutput || ""), 1600))}</pre>
          </div>
        `,
        )
        .join("")
    : '<div class="empty">该 run 暂无 round 过程记录</div>';

  refs.taskRunDetail.innerHTML = `
    <div class="run-meta-grid">
      <div><strong>taskId</strong><span>${escapeHtml(String(detail.taskId || "-"))}</span></div>
      <div><strong>timestamp</strong><span>${escapeHtml(String(detail.timestamp || "-"))}</span></div>
      <div><strong>status</strong><span>${escapeHtml(String(meta.status || "-"))}</span></div>
      <div><strong>execution</strong><span>${escapeHtml(String(meta.executionStatus || "-"))}</span></div>
      <div><strong>result</strong><span>${escapeHtml(String(meta.resultStatus || "-"))}</span></div>
      <div><strong>durationMs</strong><span>${escapeHtml(String((meta.endedAt && meta.startedAt) ? meta.endedAt - meta.startedAt : "-"))}</span></div>
      <div><strong>startedAt</strong><span>${escapeHtml(formatTime(meta.startedAt))}</span></div>
      <div><strong>endedAt</strong><span>${escapeHtml(formatTime(meta.endedAt))}</span></div>
    </div>

    <h5>Dialogue Process</h5>
    <div class="round-list">${roundHtml}</div>

    <h5>Artifacts Preview</h5>
    <details open>
      <summary>result.md</summary>
      <pre>${escapeHtml(String(detail?.artifacts?.result || "(empty)"))}</pre>
    </details>
    <details>
      <summary>dialogue.md</summary>
      <pre>${escapeHtml(String(detail?.artifacts?.dialogue || "(empty)"))}</pre>
    </details>
    <details>
      <summary>output.md</summary>
      <pre>${escapeHtml(String(detail?.artifacts?.output || "(empty)"))}</pre>
    </details>
    <details>
      <summary>error.md</summary>
      <pre>${escapeHtml(String(detail?.artifacts?.error || "(empty)"))}</pre>
    </details>
  `;
}

function renderLogs() {
  if (!state.logs.length) {
    refs.logsView.textContent = "暂无日志";
    return;
  }

  refs.logsView.textContent = state.logs
    .map((log) => {
      const time = formatTime(log.timestamp);
      const level = String(log.type || log.level || "info").toUpperCase();
      const msg = String(log.message || "");
      return `[${time}] [${level}] ${msg}`;
    })
    .join("\n");
}

async function refreshContexts({ keepSelection = true } = {}) {
  const data = await requestJson("/api/tui/contexts?limit=300");
  state.contexts = Array.isArray(data.contexts) ? data.contexts : [];

  const selectedExists = state.contexts.some((ctx) => ctx.contextId === state.selectedContextId);
  if (!keepSelection || !selectedExists) {
    state.selectedContextId = state.contexts[0]?.contextId || "";
  }

  renderContexts();
}

async function refreshMessages() {
  if (!state.selectedContextId) {
    state.messages = [];
    renderMessages();
    return;
  }

  const encoded = encodeURIComponent(state.selectedContextId);
  const data = await requestJson(`/api/tui/contexts/${encoded}/messages?limit=200`);
  state.messages = Array.isArray(data.messages) ? data.messages : [];
  renderMessages();
}

async function refreshServices() {
  const data = await requestJson("/api/tui/services");
  state.services = Array.isArray(data.services) ? data.services : [];
  renderServices();
}

async function refreshTasks() {
  const data = await requestJson("/api/tui/tasks");
  state.tasks = Array.isArray(data.tasks) ? data.tasks : [];

  const selectedExists = state.tasks.some((task) => task.taskId === state.selectedTaskId);
  if (!selectedExists) {
    state.selectedTaskId = "";
    state.selectedRunTimestamp = "";
    state.taskRuns = [];
    state.runDetail = null;
  }

  renderTasks();
  renderTaskRuns();
  renderRunDetail();
}

async function refreshTaskRuns() {
  if (!state.selectedTaskId) {
    state.taskRuns = [];
    renderTaskRuns();
    return;
  }
  const data = await requestJson(`/api/tui/tasks/${encodeURIComponent(state.selectedTaskId)}/runs?limit=60`);
  state.taskRuns = Array.isArray(data.runs) ? data.runs : [];

  const selectedExists = state.taskRuns.some((run) => run.timestamp === state.selectedRunTimestamp);
  if (!selectedExists) {
    state.selectedRunTimestamp = state.taskRuns[0]?.timestamp || "";
  }

  renderTaskRuns();
}

async function refreshRunDetail() {
  if (!state.selectedTaskId || !state.selectedRunTimestamp) {
    state.runDetail = null;
    renderRunDetail();
    return;
  }

  const data = await requestJson(
    `/api/tui/tasks/${encodeURIComponent(state.selectedTaskId)}/runs/${encodeURIComponent(state.selectedRunTimestamp)}`,
  );
  state.runDetail = data;
  renderRunDetail();
}

async function refreshLogs() {
  const data = await requestJson("/api/tui/logs?limit=220");
  state.logs = Array.isArray(data.logs) ? data.logs : [];
  renderLogs();
}

async function refreshOverview() {
  const data = await requestJson("/api/tui/overview?contextLimit=20");
  const totalContexts = Number(data?.contexts?.total || 0);
  const totalTasks = Number(data?.tasks?.total || 0);
  const totalServices = Array.isArray(data?.services) ? data.services.length : 0;
  setTopbarStatus(`在线 · contexts ${totalContexts} · services ${totalServices} · tasks ${totalTasks}`);
}

async function refreshAll() {
  try {
    await refreshOverview();
    await refreshContexts();
    await Promise.all([refreshServices(), refreshTasks(), refreshLogs()]);
    await refreshMessages();
    await refreshTaskRuns();
    await refreshRunDetail();
  } catch (error) {
    setTopbarStatus(`连接失败: ${String(error.message || error)}`, true);
    showToast(`刷新失败: ${String(error.message || error)}`, "error");
  }
}

async function sendToCurrentContext() {
  if (state.sending) return;
  const contextId = state.selectedContextId;
  const instructions = String(refs.messageInput.value || "").trim();
  if (!contextId) {
    showToast("请先选择 context", "error");
    return;
  }
  if (!instructions) return;

  state.sending = true;
  refs.sendBtn.disabled = true;
  refs.sendBtn.textContent = "发送中...";

  try {
    await requestJson(`/api/tui/contexts/${encodeURIComponent(contextId)}/execute`, {
      method: "POST",
      body: JSON.stringify({ instructions }),
    });
    refs.messageInput.value = "";
    await refreshContexts();
    await refreshMessages();
    await refreshLogs();
    showToast("已发送", "success");
  } catch (error) {
    showToast(`发送失败: ${String(error.message || error)}`, "error");
  } finally {
    state.sending = false;
    refs.sendBtn.disabled = false;
    refs.sendBtn.textContent = "发送到当前 context";
  }
}

async function controlService(serviceName, action) {
  try {
    await requestJson("/api/services/control", {
      method: "POST",
      body: JSON.stringify({ serviceName, action }),
    });
    await refreshServices();
    showToast(`service ${serviceName} ${action} 已执行`, "success");
  } catch (error) {
    showToast(`service 操作失败: ${String(error.message || error)}`, "error");
  }
}

async function runTask(taskId) {
  try {
    showToast(`开始执行 task: ${taskId}`);
    await requestJson("/api/tui/tasks/run", {
      method: "POST",
      body: JSON.stringify({ taskId, reason: "triggered_by_web_tui" }),
    });
    await refreshTasks();
    state.selectedTaskId = taskId;
    await refreshTaskRuns();
    await refreshRunDetail();
    await refreshLogs();
    showToast(`task ${taskId} 执行完成`, "success");
  } catch (error) {
    showToast(`task 执行失败: ${String(error.message || error)}`, "error");
  }
}

function bindEvents() {
  refs.refreshAllBtn.addEventListener("click", () => {
    void refreshAll();
  });

  refs.contextSearch.addEventListener("input", (event) => {
    state.contextFilter = String(event.target.value || "").trim();
    renderContexts();
  });

  refs.contextList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-context-id]");
    if (!target) return;
    const contextId = target.getAttribute("data-context-id") || "";
    if (!contextId) return;
    state.selectedContextId = contextId;
    renderContexts();
    void refreshMessages();
  });

  refs.refreshMessagesBtn.addEventListener("click", () => {
    void refreshMessages();
  });

  refs.sendBtn.addEventListener("click", () => {
    void sendToCurrentContext();
  });

  refs.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendToCurrentContext();
    }
  });

  refs.refreshServicesBtn.addEventListener("click", () => {
    void refreshServices();
  });

  refs.servicesTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-svc-action]");
    if (!target) return;
    const action = target.getAttribute("data-svc-action") || "";
    const serviceName = target.getAttribute("data-service-name") || "";
    if (!action || !serviceName) return;
    void controlService(serviceName, action);
  });

  refs.refreshTasksBtn.addEventListener("click", () => {
    void refreshTasks();
  });

  refs.tasksTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-task-action]");
    if (!target) return;
    const action = target.getAttribute("data-task-action");
    const taskId = target.getAttribute("data-task-id") || "";
    if (!taskId) return;

    if (action === "run") {
      void runTask(taskId);
      return;
    }

    if (action === "select") {
      state.selectedTaskId = taskId;
      state.selectedRunTimestamp = "";
      state.runDetail = null;
      renderTasks();
      void refreshTaskRuns().then(() => refreshRunDetail());
    }
  });

  refs.refreshRunsBtn.addEventListener("click", () => {
    void refreshTaskRuns().then(() => refreshRunDetail());
  });

  refs.taskRunsTable.addEventListener("click", (event) => {
    const target = event.target.closest("[data-run-action]");
    if (!target) return;
    const action = target.getAttribute("data-run-action");
    const timestamp = target.getAttribute("data-run-ts") || "";
    if (action !== "view" || !timestamp) return;
    state.selectedRunTimestamp = timestamp;
    renderTaskRuns();
    void refreshRunDetail();
  });

  refs.refreshLogsBtn.addEventListener("click", () => {
    void refreshLogs();
  });
}

function startPolling() {
  setInterval(() => {
    void refreshOverview();
  }, 8000);

  setInterval(() => {
    void refreshContexts().then(() => refreshMessages());
  }, 6000);

  setInterval(() => {
    void refreshServices();
    void refreshTasks();
    void refreshLogs();
  }, 10000);

  setInterval(() => {
    if (!state.selectedTaskId) return;
    void refreshTaskRuns().then(() => refreshRunDetail());
  }, 9000);
}

async function bootstrap() {
  bindEvents();
  await refreshAll();
  startPolling();
}

void bootstrap();
