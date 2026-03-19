/**
 * 页面内快速发送脚本（Content Script）。
 *
 * 关键点（中文）：
 * - 选中文本后，在选区右下角展示消息按钮。
 * - 点击消息按钮后，在选区左下角展开输入框（非底部固定面板）。
 * - 支持 `Cmd/Ctrl + U` 唤起同一输入框。
 * - 输入框采用简洁聊天样式：左侧 Agent tag，右侧发送按钮。
 * - 支持 slash 历史问题菜单（来源于用户 ask 历史），`Cmd/Ctrl + Enter` 发送。
 * - 若无选区则自动退化为“页面全文发送”模式。
 */

(function bootstrapDowncityInlineComposer() {
  if (typeof window === "undefined" || window.top !== window) {
    return;
  }
  if (document.getElementById("downcity-inline-share-root")) {
    return;
  }

  const STORAGE_KEY = "downcity.extension.settings.v1";
  const SEND_HISTORY_STORAGE_KEY = "downcity.extension.send.history.v1";
  const SEND_HISTORY_MAX_COUNT = 120;

  const DEFAULT_CONSOLE_HOST = "127.0.0.1";
  const DEFAULT_CONSOLE_PORT = 5315;

  const MAX_SELECTION_TEXT_CHARS = 12_000;
  const MAX_PAGE_TEXT_CHARS = 80_000;
  const MAX_PROMPT_CHARS = 5_000;
  const MAX_SLASH_ITEMS = 6;

  const COMPOSER_MIN_WIDTH = 320;
  const COMPOSER_MAX_WIDTH = 460;
  const VIEWPORT_MARGIN = 10;
  const TRIGGER_ICON_URL = chrome.runtime.getURL("image.png");


  const DEFAULT_SETTINGS = {
    consoleHost: DEFAULT_CONSOLE_HOST,
    consolePort: DEFAULT_CONSOLE_PORT,
    agentId: "",
    chatKey: "",
  };

  const state = {
    isOpen: false,
    isSending: false,

    selectionText: "",
    selectionRect: null,
    selectionRects: [],
    hoverSelectionText: "",
    hoverSelectionRect: null,

    lastSettings: { ...DEFAULT_SETTINGS },
    askHistoryCommands: [],

    slashVisible: false,
    slashSuggestions: [],
    slashActiveIndex: 0,

    routeBaseUrl: "",
    agentTagText: "Agent",
    toastTimerId: null,
  };

  function normalizeText(input, maxChars) {
    const text = String(input || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
    return text.slice(0, Math.trunc(maxChars));
  }

  function clipText(input, maxChars) {
    const text = String(input || "");
    if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
    return text.length > maxChars ? text.slice(0, Math.trunc(maxChars)) : text;
  }

  function readErrorText(error) {
    if (error instanceof Error) return error.message;
    return String(error || "未知错误");
  }

  function toSafeFileNamePart(input) {
    const value = String(input || "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 36);
    return value || "selection";
  }

  function storageGet(area, keys) {
    return new Promise((resolve, reject) => {
      chrome.storage[area].get(keys, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(area, value) {
    return new Promise((resolve, reject) => {
      chrome.storage[area].set(value, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });
  }

  function getSelectionRangeRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  function getSelectionRangeRects() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
      return [];
    }
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects())
      .filter((rect) => rect && rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }));
    return rects;
  }

  function getCurrentSelectionText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) {
      return "";
    }
    return normalizeText(selection.toString(), MAX_SELECTION_TEXT_CHARS);
  }

  function getCurrentPageText() {
    const bodyText = normalizeText(
      document.body && typeof document.body.innerText === "string" ? document.body.innerText : "",
      MAX_PAGE_TEXT_CHARS,
    );
    if (!bodyText) return "";

    // 关键点（中文）：优先抽取 article/main，尽量贴近“正文”而非整页噪音。
    const articleNode = document.querySelector("article");
    const articleText = normalizeText(
      articleNode && typeof articleNode.innerText === "string"
        ? articleNode.innerText
        : "",
      MAX_PAGE_TEXT_CHARS,
    );
    if (articleText && articleText.length >= Math.min(600, bodyText.length)) {
      return articleText;
    }

    const mainNode = document.querySelector("main");
    const mainText = normalizeText(
      mainNode && typeof mainNode.innerText === "string"
        ? mainNode.innerText
        : "",
      MAX_PAGE_TEXT_CHARS,
    );
    if (mainText && mainText.length >= Math.min(600, bodyText.length)) {
      return mainText;
    }

    return bodyText;
  }

  function isEditableTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    const tag = String(target.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input") return true;
    if (target.isContentEditable) return true;
    return Boolean(target.closest('[contenteditable="true"]'));
  }

  function buildAskHistoryCommands(records) {
    const source = Array.isArray(records) ? records : [];
    const out = [];
    const seen = new Set();

    for (let index = 0; index < source.length; index += 1) {
      const item = source[index];
      if (!item || typeof item !== "object") continue;
      const prompt = normalizeText(item.taskPrompt, MAX_PROMPT_CHARS);
      if (!prompt) continue;
      const dedupKey = prompt.toLowerCase();
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      const rank = out.length + 1;
      const preview = normalizeText(prompt, 22) || `历史问题 ${rank}`;
      out.push({
        id: `ask-history-${rank}`,
        title: preview,
        prompt,
        command: `/h${rank}`,
        searchText: `${prompt.toLowerCase()} /h${rank}`,
      });
      if (out.length >= SEND_HISTORY_MAX_COUNT) break;
    }

    return out;
  }

  async function refreshAskHistoryCommands() {
    const stored = await storageGet("local", [SEND_HISTORY_STORAGE_KEY]);
    const records = Array.isArray(stored[SEND_HISTORY_STORAGE_KEY])
      ? stored[SEND_HISTORY_STORAGE_KEY]
      : [];
    state.askHistoryCommands = buildAskHistoryCommands(records);
  }

  function applySettingsToState(settings) {
    const normalized = {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
    state.lastSettings = normalized;
  }

  async function loadSettings() {
    const stored = await storageGet("sync", [STORAGE_KEY]);
    const raw = stored[STORAGE_KEY];
    if (!raw || typeof raw !== "object") {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      ...DEFAULT_SETTINGS,
      consoleHost: normalizeText(raw.consoleHost, 100) || DEFAULT_CONSOLE_HOST,
      consolePort:
        Number.parseInt(String(raw.consolePort || DEFAULT_CONSOLE_PORT), 10) || DEFAULT_CONSOLE_PORT,
      agentId: normalizeText(raw.agentId, 240),
      chatKey: normalizeText(raw.chatKey, 300),
    };
  }

  function normalizePageUrl(value) {
    const raw = normalizeText(value, 1000);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  async function appendPageSendRecord(params) {
    const stored = await storageGet("local", [SEND_HISTORY_STORAGE_KEY]);
    const existing = Array.isArray(stored[SEND_HISTORY_STORAGE_KEY])
      ? stored[SEND_HISTORY_STORAGE_KEY]
      : [];

    const nextRecord = {
      id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      pageUrl: normalizePageUrl(params.pageUrl),
      pageTitle: normalizeText(params.pageTitle, 200),
      agentId: normalizeText(params.agentId, 240),
      chatKey: normalizeText(params.chatKey, 300),
      taskPrompt: normalizeText(params.taskPrompt, MAX_PROMPT_CHARS),
      attachmentFileName: normalizeText(params.attachmentFileName, 200),
      sentAt: Date.now(),
    };

    const merged = [nextRecord, ...existing]
      .filter((item) => item && typeof item === "object")
      .slice(0, SEND_HISTORY_MAX_COUNT);

    await storageSet("local", {
      [SEND_HISTORY_STORAGE_KEY]: merged,
    });
  }

  function buildConsoleBaseUrl(settings) {
    const host = String(settings.consoleHost || "").trim() || DEFAULT_CONSOLE_HOST;
    const rawPort = Number.parseInt(String(settings.consolePort || DEFAULT_CONSOLE_PORT), 10);
    if (!Number.isFinite(rawPort) || Number.isNaN(rawPort)) {
      throw new Error("Console 端口无效");
    }
    const port = Math.trunc(rawPort);
    if (port < 1 || port > 65535) {
      throw new Error("Console 端口范围应为 1-65535");
    }
    return `http://${host}:${port}`;
  }

  async function requestJson(url, init) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init && init.headers ? init.headers : {}),
      },
    });

    const rawText = await response.text();
    let json = null;
    if (rawText) {
      try {
        json = JSON.parse(rawText);
      } catch {
        json = null;
      }
    }

    if (!response.ok) {
      const hint = json && typeof json === "object"
        ? String(json.error || json.message || "")
        : "";
      throw new Error(hint || `请求失败：HTTP ${response.status}`);
    }

    if (!json || typeof json !== "object") {
      throw new Error("服务返回了非法 JSON");
    }

    return json;
  }

  async function fetchAgents(baseUrl) {
    const payload = await requestJson(`${baseUrl}/api/ui/agents`, { method: "GET" });
    if (payload.success !== true) {
      throw new Error(payload.error || "加载 Agent 列表失败");
    }
    return payload;
  }

  async function fetchContexts(baseUrl, agentId) {
    const payload = await requestJson(
      `${baseUrl}/api/tui/contexts?agent=${encodeURIComponent(agentId)}&limit=500`,
      { method: "GET" },
    );
    if (payload.success !== true) {
      throw new Error(payload.error || "加载上下文列表失败");
    }
    return Array.isArray(payload.contexts) ? payload.contexts : [];
  }

  function parseContextChannel(context) {
    const channelFromField = normalizeText(context.channel, 40).toLowerCase();
    if (channelFromField === "telegram" || channelFromField === "feishu" || channelFromField === "qq") {
      return channelFromField;
    }
    const contextId = normalizeText(context.contextId, 300).toLowerCase();
    if (contextId.startsWith("telegram-chat-")) return "telegram";
    if (contextId.startsWith("feishu-chat-")) return "feishu";
    if (contextId.startsWith("qq-")) return "qq";
    return "";
  }

  function resolveLinkedChannels(agent) {
    const out = new Set();
    const profiles = Array.isArray(agent && agent.chatProfiles) ? agent.chatProfiles : [];
    for (const profile of profiles) {
      const channel = normalizeText(profile && profile.channel, 40).toLowerCase();
      const linkState = normalizeText(profile && profile.linkState, 40).toLowerCase();
      if (linkState !== "connected") continue;
      if (channel === "telegram" || channel === "feishu" || channel === "qq") {
        out.add(channel);
      }
    }
    return out;
  }

  function resolveTargetAgent(agents, preferredAgentId) {
    const preferred = normalizeText(preferredAgentId, 240);
    if (preferred) {
      const matched = agents.find((item) => item && item.id === preferred);
      if (matched) return matched;
    }
    const running = agents.find((item) => item && item.running);
    if (running) return running;
    return agents[0] || null;
  }

  function resolveTargetChatKey(options, preferredChatKey) {
    const preferred = normalizeText(preferredChatKey, 300);
    if (preferred && options.some((item) => item.chatKey === preferred)) {
      return preferred;
    }
    return options[0] ? options[0].chatKey : "";
  }

  function toAgentOptionLabel(agent) {
    const name = normalizeText(agent.name, 48) || normalizeText(agent.id, 24) || "Agent";
    return agent.running ? name : `${name}（未运行）`;
  }

  function buildContextAttachment(params) {
    const safeTitle = normalizeText(params.pageTitle, 120) || "Untitled Page";
    const safeUrl = normalizeText(params.pageUrl, 1000) || "about:blank";
    const safeText = normalizeText(
      params.contentText,
      params.sourceType === "selection" ? MAX_SELECTION_TEXT_CHARS : MAX_PAGE_TEXT_CHARS,
    );
    const nowIso = new Date().toISOString();
    const isSelection = params.sourceType === "selection";
    const fileSuffix = isSelection ? "selection" : "page";
    const title = isSelection ? `引用片段 · ${safeTitle}` : `页面全文快照 · ${safeTitle}`;

    return {
      fileName: `${toSafeFileNamePart(safeTitle)}-${fileSuffix}.md`,
      markdown: [
        `# ${title}`,
        "",
        `> Source: ${safeUrl}`,
        `> Captured At: ${nowIso}`,
        `> Scope: ${isSelection ? "Selection" : "Full Page"}`,
        "",
        "---",
        "",
        "```text",
        safeText,
        "```",
      ].join("\n").trim(),
    };
  }

  function buildInstructions(params) {
    const safePrompt = normalizeText(params.taskPrompt, MAX_PROMPT_CHARS) || "请基于引用内容处理并回复。";
    const scopeText = params.sourceType === "selection" ? "选区引用" : "页面全文";
    return [
      `附件：${params.attachmentName}`,
      `原文链接：${normalizeText(params.pageUrl, 1000) || "N/A"}`,
      `内容范围：${scopeText}`,
      `用户要求：${safePrompt}`,
    ].join("\n");
  }

  async function resolveRouteInfo() {
    const settings = await loadSettings();
    const baseUrl = buildConsoleBaseUrl(settings);
    const agentsPayload = await fetchAgents(baseUrl);
    const agents = Array.isArray(agentsPayload.agents) ? agentsPayload.agents : [];

    if (agents.length < 1) {
      throw new Error("未发现可用 Agent，请先执行 `city agent start`");
    }

    const targetAgent = resolveTargetAgent(agents, settings.agentId || agentsPayload.selectedAgentId);
    if (!targetAgent) {
      throw new Error("未发现可用 Agent");
    }
    if (!targetAgent.running) {
      throw new Error("目标 Agent 未运行，请先启动后再试");
    }

    const contexts = await fetchContexts(baseUrl, targetAgent.id);
    const linkedChannels = resolveLinkedChannels(targetAgent);

    const options = [];
    const seen = new Set();
    for (const context of contexts) {
      const chatKey = normalizeText(context && context.contextId, 300);
      if (!chatKey || seen.has(chatKey)) continue;
      const channel = parseContextChannel(context);
      if (linkedChannels.size > 0 && !linkedChannels.has(channel)) continue;

      seen.add(chatKey);
      options.push({
        chatKey,
        updatedAt: Number.isFinite(context && context.updatedAt) ? Number(context.updatedAt) : 0,
        messageCount: Number.isFinite(context && context.messageCount)
          ? Number(context.messageCount)
          : 0,
      });
    }

    options.sort((left, right) => {
      if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
      return right.messageCount - left.messageCount;
    });

    const targetChatKey = resolveTargetChatKey(options, settings.chatKey);
    if (!targetChatKey) {
      throw new Error("未找到可用 Channel Chat，请先让聊天渠道收到过消息");
    }

    return {
      settings,
      baseUrl,
      targetAgent,
      targetChatKey,
    };
  }

  async function sendSelectionToAgent(params) {
    const contentText = normalizeText(
      params.contentText,
      params.sourceType === "selection" ? MAX_SELECTION_TEXT_CHARS : MAX_PAGE_TEXT_CHARS,
    );
    if (!contentText) {
      throw new Error("未能读取可发送内容");
    }

    const { targetAgent, targetChatKey, baseUrl } = await resolveRouteInfo();

    const attachment = buildContextAttachment({
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      contentText,
      sourceType: params.sourceType,
    });

    const executeUrl = `${baseUrl}/api/tui/contexts/${encodeURIComponent(targetChatKey)}/execute?agent=${encodeURIComponent(targetAgent.id)}`;

    const response = await fetch(executeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instructions: buildInstructions({
          attachmentName: attachment.fileName,
          pageUrl: params.pageUrl,
          taskPrompt: params.taskPrompt,
          sourceType: params.sourceType,
        }),
        attachments: [
          {
            type: "document",
            fileName: attachment.fileName,
            caption: `来源页面：${normalizeText(params.pageUrl, 1000) || "about:blank"}`,
            contentType: "text/markdown; charset=utf-8",
            content: attachment.markdown,
          },
        ],
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      let hint = "";
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          hint = String(parsed.error || parsed.message || "");
        } catch {
          hint = "";
        }
      }
      throw new Error(hint || `发送失败（HTTP ${response.status}）`);
    }

    await appendPageSendRecord({
      pageUrl: params.pageUrl,
      pageTitle: params.pageTitle,
      agentId: targetAgent.id,
      chatKey: targetChatKey,
      taskPrompt: normalizeText(params.taskPrompt, MAX_PROMPT_CHARS),
      attachmentFileName: attachment.fileName,
    });

    return {
      agentLabel: toAgentOptionLabel(targetAgent),
    };
  }

  function mountUi() {
    const host = document.createElement("div");
    host.id = "downcity-inline-share-root";

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        .dc-hidden { display: none !important; }
        .dc-selection-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 2147483645;
        }
        .dc-selection-highlight {
          position: fixed;
          border-radius: 5px;
          background: linear-gradient(
            180deg,
            rgba(99, 102, 241, 0.12) 0%,
            rgba(59, 130, 246, 0.18) 100%
          );
          box-shadow:
            inset 0 0 0 1px rgba(37, 99, 235, 0.26),
            0 1px 3px rgba(15, 23, 42, 0.12);
        }

        .dc-trigger {
          position: fixed;
          z-index: 2147483646;
        }
        .dc-trigger-btn {
          width: 30px;
          height: 30px;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 50%;
          cursor: pointer;
          background: #ffffff;
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
        }
        .dc-trigger-btn:hover { background: #f8fafc; }
        .dc-trigger-icon {
          width: 16px;
          height: 16px;
          object-fit: contain;
          display: block;
        }

        .dc-composer {
          position: fixed;
          z-index: 2147483646;
          width: min(${COMPOSER_MAX_WIDTH}px, calc(100vw - 16px));
        }
        .dc-shell {
          position: relative;
          border: 1px solid rgba(15, 23, 42, 0.12);
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
          padding: 7px;
        }

        .dc-input {
          width: 100%;
          min-height: 62px;
          max-height: 132px;
          resize: none;
          border: 0;
          outline: none;
          background: transparent;
          color: #0f172a;
          font-size: 14px;
          line-height: 1.45;
          padding: 2px 4px 4px;
        }
        .dc-input::placeholder { color: #94a3b8; }
        .dc-input:disabled { opacity: 0.72; }

        .dc-footer {
          margin-top: 4px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .dc-agent-tag {
          display: inline-flex;
          align-items: center;
          height: 22px;
          border-radius: 999px;
          border: 1px solid rgba(15, 23, 42, 0.14);
          background: #ffffff;
          color: #334155;
          font-size: 10px;
          font-weight: 600;
          padding: 0 8px;
          max-width: 70%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dc-send-btn {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 50%;
          cursor: pointer;
          background: #111827;
          color: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
        }
        .dc-send-btn svg { width: 13px; height: 13px; }
        .dc-send-btn:hover:enabled {
          transform: translateY(-1px);
          background: #0f172a;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
        }
        .dc-send-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .dc-slash {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 8px);
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
        }
        .dc-slash-item {
          width: 100%;
          border: 0;
          border-bottom: 1px solid rgba(15, 23, 42, 0.08);
          background: #fff;
          text-align: left;
          cursor: pointer;
          padding: 8px 10px;
          display: grid;
          gap: 2px;
        }
        .dc-slash-item:last-child { border-bottom: 0; }
        .dc-slash-item:hover,
        .dc-slash-item[data-active='true'] {
          background: #f8fafc;
        }
        .dc-slash-top {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dc-slash-cmd {
          display: inline-flex;
          height: 16px;
          align-items: center;
          border-radius: 999px;
          padding: 0 6px;
          font-size: 9px;
          font-weight: 700;
          color: #1d4ed8;
          background: rgba(37, 99, 235, 0.12);
        }
        .dc-slash-title {
          font-size: 11px;
          font-weight: 600;
          color: #0f172a;
          line-height: 1.3;
        }
        .dc-slash-sub {
          font-size: 10px;
          color: #475569;
          line-height: 1.35;
        }

        .dc-toast {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          z-index: 2147483647;
          max-width: min(84vw, 380px);
          padding: 8px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
          color: #ffffff;
          background: rgba(17, 24, 39, 0.96);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
          pointer-events: none;
          text-align: center;
        }
        .dc-toast[data-type='error'] {
          background: rgba(185, 28, 28, 0.95);
        }
      </style>

      <div id="dcSelectionOverlay" class="dc-selection-overlay dc-hidden"></div>

      <div id="dcTrigger" class="dc-trigger dc-hidden">
        <button id="dcTriggerBtn" class="dc-trigger-btn" type="button" aria-label="打开输入框">
          <img class="dc-trigger-icon" src="${TRIGGER_ICON_URL}" alt="" aria-hidden="true" />
        </button>
      </div>

      <div id="dcComposer" class="dc-composer dc-hidden">
        <div class="dc-shell">
          <div id="dcSlash" class="dc-slash dc-hidden"></div>
          <textarea id="dcInput" class="dc-input" rows="3" placeholder="Ask for follow-up changes"></textarea>
          <div class="dc-footer">
            <div id="dcAgentTag" class="dc-agent-tag">Agent</div>
            <button id="dcSendBtn" class="dc-send-btn" type="button" aria-label="发送">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 18V6"></path>
                <path d="M7 11L12 6L17 11"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div id="dcToast" class="dc-toast dc-hidden" data-type="success"></div>
    `;

    document.documentElement.appendChild(host);

    return {
      host,
      selectionOverlay: shadow.getElementById("dcSelectionOverlay"),
      trigger: shadow.getElementById("dcTrigger"),
      triggerBtn: shadow.getElementById("dcTriggerBtn"),
      composer: shadow.getElementById("dcComposer"),
      input: shadow.getElementById("dcInput"),
      agentTag: shadow.getElementById("dcAgentTag"),
      sendBtn: shadow.getElementById("dcSendBtn"),
      slash: shadow.getElementById("dcSlash"),
      toast: shadow.getElementById("dcToast"),
    };
  }

  const ui = mountUi();
  const DEFAULT_INPUT_PLACEHOLDER = "Ask for follow-up changes";

  function hideTrigger() {
    ui.trigger.classList.add("dc-hidden");
    state.hoverSelectionText = "";
    state.hoverSelectionRect = null;
  }

  function hideSelectionOverlay() {
    ui.selectionOverlay.classList.add("dc-hidden");
    ui.selectionOverlay.replaceChildren();
  }

  function hideToast() {
    if (state.toastTimerId) {
      clearTimeout(state.toastTimerId);
      state.toastTimerId = null;
    }
    ui.toast.classList.add("dc-hidden");
    ui.toast.textContent = "";
  }

  function showToast(type, text) {
    const message = normalizeText(text, 140);
    if (!message) return;
    if (state.toastTimerId) {
      clearTimeout(state.toastTimerId);
      state.toastTimerId = null;
    }
    ui.toast.dataset.type = type === "error" ? "error" : "success";
    ui.toast.textContent = message;
    ui.toast.classList.remove("dc-hidden");
    state.toastTimerId = setTimeout(() => {
      ui.toast.classList.add("dc-hidden");
      ui.toast.textContent = "";
      state.toastTimerId = null;
    }, 2200);
  }

  function renderSelectionOverlay() {
    const rects = Array.isArray(state.selectionRects) ? state.selectionRects : [];
    const normalizedRects = rects.length > 0
      ? rects
      : (state.selectionRect
          ? [{
              left: state.selectionRect.left,
              top: state.selectionRect.top,
              width: state.selectionRect.width,
              height: state.selectionRect.height,
            }]
          : []);

    if (normalizedRects.length < 1) {
      hideSelectionOverlay();
      return;
    }

    ui.selectionOverlay.replaceChildren();

    for (const rect of normalizedRects) {
      const node = document.createElement("div");
      node.className = "dc-selection-highlight";
      node.style.left = `${Math.round(rect.left)}px`;
      node.style.top = `${Math.round(rect.top)}px`;
      node.style.width = `${Math.round(rect.width)}px`;
      node.style.height = `${Math.round(rect.height)}px`;
      ui.selectionOverlay.appendChild(node);
    }

    ui.selectionOverlay.classList.remove("dc-hidden");
  }

  function setInputPlaceholder(type, text) {
    if (type === "sending") {
      ui.input.placeholder = "发送中...";
      return;
    }
    if (type === "error") {
      ui.input.placeholder = normalizeText(text, 120) || "发送失败，请重试";
      return;
    }
    ui.input.placeholder = DEFAULT_INPUT_PLACEHOLDER;
  }

  function hideSlashMenu() {
    state.slashVisible = false;
    state.slashSuggestions = [];
    state.slashActiveIndex = 0;
    ui.slash.classList.add("dc-hidden");
    ui.slash.replaceChildren();
  }

  function renderAgentTag() {
    ui.agentTag.textContent = state.agentTagText || "Agent";
  }

  function placeTrigger(rect) {
    if (!rect) {
      hideTrigger();
      return;
    }

    const triggerSize = 30;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - triggerSize - VIEWPORT_MARGIN),
    );
    const top = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.bottom + 6),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - triggerSize - VIEWPORT_MARGIN),
    );

    ui.trigger.style.left = `${Math.round(left)}px`;
    ui.trigger.style.top = `${Math.round(top)}px`;
    ui.trigger.classList.remove("dc-hidden");
  }

  function placeComposer(rect) {
    const anchor = rect || state.selectionRect || state.hoverSelectionRect || {
      left: window.innerWidth * 0.25,
      bottom: window.innerHeight * 0.35,
      top: window.innerHeight * 0.3,
      width: 320,
    };

    const targetWidth = Math.min(COMPOSER_MAX_WIDTH, Math.max(COMPOSER_MIN_WIDTH, 390));
    const maxWidth = Math.max(COMPOSER_MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const width = Math.min(targetWidth, maxWidth);

    ui.composer.style.width = `${Math.round(width)}px`;

    let left = anchor.left;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - width - VIEWPORT_MARGIN;
    }
    left = Math.max(VIEWPORT_MARGIN, left);

    let top = anchor.bottom + 8;
    const composerHeight = ui.composer.offsetHeight || 220;
    if (top + composerHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchor.top - composerHeight - 8;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    ui.composer.style.left = `${Math.round(left)}px`;
    ui.composer.style.top = `${Math.round(top)}px`;
  }

  function setOpen(open) {
    state.isOpen = Boolean(open);
    if (state.isOpen) {
      ui.composer.classList.remove("dc-hidden");
      hideTrigger();
      renderSelectionOverlay();
      renderAgentTag();
      setInputPlaceholder("idle");
      queueMicrotask(() => {
        placeComposer(state.selectionRect || state.hoverSelectionRect);
        ui.input.focus();
        ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
      });
      return;
    }

    state.isSending = false;
    state.selectionRects = [];
    ui.composer.classList.add("dc-hidden");
    ui.input.value = "";
    ui.input.blur();
    hideSlashMenu();
    hideSelectionOverlay();
    setInputPlaceholder("idle");
  }

  async function refreshAgentTag() {
    try {
      const routeInfo = await resolveRouteInfo();
      state.routeBaseUrl = routeInfo.baseUrl;
      state.agentTagText = toAgentOptionLabel(routeInfo.targetAgent);
      renderAgentTag();
    } catch {
      state.agentTagText = "Agent";
      renderAgentTag();
    }
  }

  function openComposerFromSelection(selectionText, rect, rects) {
    const selected = normalizeText(selectionText, MAX_SELECTION_TEXT_CHARS);
    state.selectionText = selected;
    state.selectionRect = rect || state.hoverSelectionRect || null;
    state.selectionRects = Array.isArray(rects) ? rects : [];

    setOpen(true);
    ui.input.value = "";
    ui.input.setSelectionRange(0, 0);

    void refreshAgentTag();
    void refreshAskHistoryCommands()
      .then(() => {
        updateSlashMenuFromInput();
      })
      .catch(() => {
        state.askHistoryCommands = [];
      });
    updateSlashMenuFromInput();
  }

  function openComposerFromCurrentSelection() {
    const text = getCurrentSelectionText() || state.hoverSelectionText || "";
    const rect = getSelectionRangeRect() || state.hoverSelectionRect;
    const rects = getSelectionRangeRects();
    openComposerFromSelection(text, rect, rects);
  }

  function refreshTriggerFromSelection() {
    if (state.isOpen || state.isSending) {
      hideTrigger();
      return;
    }

    const text = getCurrentSelectionText();
    const rect = getSelectionRangeRect();
    if (!text || !rect) {
      hideTrigger();
      return;
    }

    state.hoverSelectionText = text;
    state.hoverSelectionRect = rect;
    placeTrigger(rect);
  }

  function findTrailingSlashToken(value) {
    const text = String(value || "");
    const match = text.match(/(?:^|\s)(\/[^\s]*)$/);
    if (!match || !match[1]) return null;
    const token = String(match[1]);
    const end = text.length;
    const start = end - token.length;
    return {
      token,
      query: token.slice(1).toLowerCase(),
      start,
      end,
    };
  }

  function filterAskHistoryCommands(query) {
    const all = state.askHistoryCommands;
    if (!Array.isArray(all) || all.length < 1) return [];
    const normalizedQuery = normalizeText(query, 40).toLowerCase();
    if (!normalizedQuery) return all.slice(0, MAX_SLASH_ITEMS);
    return all
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, MAX_SLASH_ITEMS);
  }

  function applySlashSuggestion(index) {
    if (!state.slashVisible || state.slashSuggestions.length < 1) return;
    const safeIndex = Math.max(0, Math.min(state.slashSuggestions.length - 1, index));
    const selected = state.slashSuggestions[safeIndex];
    if (!selected) return;

    const token = findTrailingSlashToken(ui.input.value);
    if (!token) {
      hideSlashMenu();
      return;
    }

    const prefix = ui.input.value.slice(0, token.start);
    const spacer = prefix && !/\s$/.test(prefix) ? " " : "";
    const nextValue = clipText(`${prefix}${spacer}${selected.prompt}`, MAX_PROMPT_CHARS);
    ui.input.value = nextValue;
    hideSlashMenu();
    ui.input.focus();
    ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
  }

  function renderSlashMenu() {
    if (!state.slashVisible || state.slashSuggestions.length < 1) {
      hideSlashMenu();
      return;
    }

    ui.slash.classList.remove("dc-hidden");
    ui.slash.replaceChildren();

    for (let index = 0; index < state.slashSuggestions.length; index += 1) {
      const item = state.slashSuggestions[index];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dc-slash-item";
      button.dataset.active = index === state.slashActiveIndex ? "true" : "false";

      const top = document.createElement("div");
      top.className = "dc-slash-top";

      const cmd = document.createElement("span");
      cmd.className = "dc-slash-cmd";
      cmd.textContent = item.command;

      const title = document.createElement("span");
      title.className = "dc-slash-title";
      title.textContent = item.title;

      top.appendChild(cmd);
      top.appendChild(title);

      const sub = document.createElement("div");
      sub.className = "dc-slash-sub";
      sub.textContent = normalizeText(item.prompt, 90);

      button.appendChild(top);
      button.appendChild(sub);

      // 关键点（中文）：阻止 mousedown 导致输入框失焦。
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", () => {
        applySlashSuggestion(index);
      });

      ui.slash.appendChild(button);
    }
  }

  function updateSlashMenuFromInput() {
    if (!state.isOpen || state.isSending) {
      hideSlashMenu();
      return;
    }

    const token = findTrailingSlashToken(ui.input.value);
    if (!token) {
      hideSlashMenu();
      return;
    }

    const suggestions = filterAskHistoryCommands(token.query);
    if (suggestions.length < 1) {
      hideSlashMenu();
      return;
    }

    state.slashVisible = true;
    state.slashSuggestions = suggestions;
    if (state.slashActiveIndex >= suggestions.length) {
      state.slashActiveIndex = 0;
    }
    renderSlashMenu();
  }

  function setSendingState(isSending) {
    state.isSending = Boolean(isSending);
    ui.input.disabled = state.isSending;
    ui.sendBtn.disabled = state.isSending;
    if (state.isSending) {
      hideSlashMenu();
      setInputPlaceholder("sending");
      return;
    }
    setInputPlaceholder("idle");
  }

  async function submit() {
    if (state.isSending) return;

    const taskPrompt = normalizeText(ui.input.value, MAX_PROMPT_CHARS);
    if (!taskPrompt) {
      setInputPlaceholder("error", "请输入问题后再发送");
      ui.input.focus();
      return;
    }

    const selectedText = normalizeText(state.selectionText, MAX_SELECTION_TEXT_CHARS);
    const sourceType = selectedText ? "selection" : "page";
    const contentText = selectedText || getCurrentPageText();
    if (!contentText) {
      setInputPlaceholder("error", "未能读取页面内容，请刷新后重试");
      return;
    }

    try {
      setSendingState(true);
      const result = await sendSelectionToAgent({
        pageTitle: document.title || "未命名页面",
        pageUrl: window.location.href || "",
        contentText,
        sourceType,
        taskPrompt,
      });
      if (result && result.agentLabel) {
        state.agentTagText = result.agentLabel;
      }
      await refreshAskHistoryCommands().catch(() => {});
      showToast("success", "发送成功");
      setOpen(false);
    } catch (error) {
      const errorText = readErrorText(error);
      setInputPlaceholder("error", errorText);
      showToast("error", `发送失败：${errorText}`);
      ui.input.focus();
    } finally {
      setSendingState(false);
    }
  }

  void loadSettings()
    .then((settings) => {
      applySettingsToState(settings);
    })
    .catch(() => {
      applySettingsToState(DEFAULT_SETTINGS);
    });

  void refreshAskHistoryCommands().catch(() => {
    state.askHistoryCommands = [];
  });

  ui.triggerBtn.addEventListener("mousedown", (event) => {
    // 关键点（中文）：避免按下时选区被页面抢焦点导致丢失。
    event.preventDefault();
  });

  ui.triggerBtn.addEventListener("click", () => {
    openComposerFromCurrentSelection();
  });

  ui.input.addEventListener("input", () => {
    updateSlashMenuFromInput();
  });

  ui.input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    const key = String(event.key || "").toLowerCase();

    if (state.slashVisible && (key === "arrowdown" || key === "arrowup")) {
      event.preventDefault();
      if (state.slashSuggestions.length < 1) return;
      const total = state.slashSuggestions.length;
      if (key === "arrowdown") {
        state.slashActiveIndex = (state.slashActiveIndex + 1) % total;
      } else {
        state.slashActiveIndex = (state.slashActiveIndex - 1 + total) % total;
      }
      renderSlashMenu();
      return;
    }

    if (state.slashVisible && (key === "enter" || key === "tab") && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      applySlashSuggestion(state.slashActiveIndex);
      return;
    }

    const withModifier = event.metaKey || event.ctrlKey;
    if (key === "enter" && withModifier) {
      event.preventDefault();
      void submit();
      return;
    }

    if (key === "escape") {
      event.preventDefault();
      if (state.slashVisible) {
        hideSlashMenu();
        return;
      }
      if (!state.isSending) {
        setOpen(false);
      }
    }
  });

  ui.sendBtn.addEventListener("click", () => {
    void submit();
  });

  document.addEventListener(
    "mouseup",
    () => {
      queueMicrotask(() => {
        refreshTriggerFromSelection();
      });
    },
    true,
  );

  document.addEventListener(
    "keyup",
    () => {
      queueMicrotask(() => {
        refreshTriggerFromSelection();
      });
    },
    true,
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const clickedInsideUi = path.includes(ui.host);
      if (clickedInsideUi) return;

      if (state.isOpen && !state.isSending) {
        setOpen(false);
      }
      hideTrigger();
    },
    true,
  );

  window.addEventListener(
    "scroll",
    () => {
      if (!state.isOpen) {
        hideTrigger();
        return;
      }
      // 关键点（中文）：滚动后原选区矩形不再可靠，避免错位高亮。
      hideSelectionOverlay();
    },
    true,
  );

  window.addEventListener("resize", () => {
    if (state.isOpen) {
      placeComposer(state.selectionRect || state.hoverSelectionRect);
      hideSelectionOverlay();
      return;
    }
    hideTrigger();
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing) return;
      const key = String(event.key || "").toLowerCase();
      const withModifier = event.metaKey || event.ctrlKey;

      // 关键点（中文）：按 Cmd/Ctrl + U 唤起页面内输入框，避免冲突输入域。
      if (!withModifier || event.shiftKey || event.altKey || key !== "u") {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (!state.isOpen) {
        openComposerFromCurrentSelection();
        return;
      }
      ui.input.focus();
      ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
    },
    true,
  );

})();
