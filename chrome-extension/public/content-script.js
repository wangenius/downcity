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
  if (typeof window === "undefined") {
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
  const CONTENT_STYLE_URL = chrome.runtime.getURL("content-script.css");


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
    routeErrorText: "",
    isRouteLoading: false,
    isRoutePanelOpen: false,
    routeAgents: [],
    routeChats: [],
    activeAgentId: "",
    activeChatKey: "",
    routeRefreshSeq: 0,
    toastTimerId: null,
  };

  function summarizeRouteErrorText(errorText) {
    const text = normalizeText(errorText, 160);
    if (!text) return "不可发送";
    if (/agent|未发现可用\s*agent|未运行/u.test(text)) {
      return "没有可用 Agent";
    }
    return "不可发送";
  }

  function formatChannelName(channel) {
    if (channel === "telegram") return "Telegram";
    if (channel === "feishu") return "Feishu";
    return "QQ";
  }

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
    if (rect && (rect.width > 0 || rect.height > 0)) {
      return rect;
    }

    // 关键点（中文）：部分页面（尤其 iframe / 特殊排版容器）会返回空 bounding rect，
    // 这里退化到最后一个 client rect，尽量保证触发按钮仍然能定位。
    const rects = Array.from(range.getClientRects()).filter(
      (item) => item && (item.width > 0 || item.height > 0),
    );
    if (rects.length > 0) {
      return rects[rects.length - 1];
    }

    const anchorElement = selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode && selection.anchorNode.parentElement
        ? selection.anchorNode.parentElement
        : null;
    if (anchorElement) {
      const fallbackRect = anchorElement.getBoundingClientRect();
      if (fallbackRect && (fallbackRect.width > 0 || fallbackRect.height > 0)) {
        return fallbackRect;
      }
    }
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

  function getSafePageMeta() {
    const fallbackUrl = normalizeText(window.location && window.location.href, 1000) || "about:blank";
    const fallbackTitle = normalizeText(document.title, 200) || "未命名页面";
    const htmlLang = normalizeText(
      document.documentElement && document.documentElement.getAttribute("lang"),
      40,
    );
    const metaLang = normalizeText(
      document.querySelector('meta[http-equiv="content-language"]') &&
        document.querySelector('meta[http-equiv="content-language"]').getAttribute("content"),
      40,
    );

    return {
      url: fallbackUrl,
      title: fallbackTitle,
      lang: htmlLang || metaLang || "zh-CN",
    };
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
      out.push({
        id: `ask-history-${rank}`,
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

  async function saveSettings(settings) {
    await storageSet("sync", {
      [STORAGE_KEY]: {
        ...DEFAULT_SETTINGS,
        ...settings,
      },
    });
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
    return "";
  }

  function resolveContextDisplayName(context, chatKey, channel) {
    const chatTitle = normalizeText(context && context.chatTitle, 80);
    const chatId = normalizeText(context && context.chatId, 80);
    if (chatTitle && (!chatId || chatTitle !== chatId)) {
      return chatTitle;
    }
    if (chatId) return chatId;
    if (chatKey) return chatKey;
    return formatChannelName(channel);
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
      if (matched && matched.running) return matched;
    }
    const running = agents.find((item) => item && item.running);
    if (running) return running;
    if (preferred) {
      const matched = agents.find((item) => item && item.id === preferred);
      if (matched) return matched;
    }
    return agents[0] || null;
  }

  function resolveTargetChatKey(options, preferredChatKey) {
    const preferred = normalizeText(preferredChatKey, 300);
    if (preferred && options.some((item) => item.chatKey === preferred)) {
      return preferred;
    }
    if (options.length === 1) {
      return options[0] ? options[0].chatKey : "";
    }
    return "";
  }

  function toAgentOptionLabel(agent) {
    const name = normalizeText(agent.name, 48) || normalizeText(agent.id, 24) || "Agent";
    return agent.running ? name : `${name}（未运行）`;
  }

  function buildContextAttachment(params) {
    const safeTitle = normalizeText(params.pageTitle, 120) || "Untitled Page";
    const safeUrl = normalizeText(params.pageUrl, 1000) || "about:blank";
    const safeLang = normalizeText(params.pageLang, 40) || "zh-CN";
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
        `> Language: ${safeLang}`,
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

  async function resolveRouteInfo(inputSettings) {
    const settings = inputSettings && typeof inputSettings === "object"
      ? { ...DEFAULT_SETTINGS, ...inputSettings }
      : await loadSettings();
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
      if (!channel) continue;
      if (linkedChannels.size > 0 && !linkedChannels.has(channel)) continue;
      const displayName = resolveContextDisplayName(context, chatKey, channel);

      seen.add(chatKey);
      options.push({
        chatKey,
        channel,
        title: `${displayName} · ${formatChannelName(channel)}`,
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
      if (options.length > 1) {
        throw new Error("未选择目标 Channel Chat，请先打开设置页明确选择");
      }
      throw new Error("未找到可用 Channel Chat，请先让聊天渠道收到过消息");
    }

    return {
      settings,
      baseUrl,
      agents,
      chatOptions: options,
      targetAgent,
      targetChatKey,
    };
  }

  async function refreshRouteState(preferredSettings) {
    const requestSeq = state.routeRefreshSeq + 1;
    state.routeRefreshSeq = requestSeq;
    state.isRouteLoading = true;
    renderAgentTag();
    renderRoutePanel();
    try {
      const routeInfo = await resolveRouteInfo(preferredSettings || state.lastSettings);
      if (requestSeq !== state.routeRefreshSeq) return;
      state.routeBaseUrl = routeInfo.baseUrl;
      state.routeErrorText = "";
      state.routeAgents = routeInfo.agents;
      state.routeChats = routeInfo.chatOptions;
      state.activeAgentId = routeInfo.targetAgent.id;
      state.activeChatKey = routeInfo.targetChatKey;
      state.agentTagText = toAgentOptionLabel(routeInfo.targetAgent);

      const nextSettings = {
        ...state.lastSettings,
        agentId: routeInfo.targetAgent.id,
        chatKey: routeInfo.targetChatKey,
      };
      state.lastSettings = nextSettings;
      await saveSettings(nextSettings);
    } catch (error) {
      if (requestSeq !== state.routeRefreshSeq) return;
      state.routeBaseUrl = "";
      state.routeErrorText = summarizeRouteErrorText(readErrorText(error));
      state.routeAgents = [];
      state.routeChats = [];
      state.activeAgentId = "";
      state.activeChatKey = "";
      state.agentTagText = "Agent";
    } finally {
      if (requestSeq !== state.routeRefreshSeq) return;
      state.isRouteLoading = false;
      renderAgentTag();
      renderRoutePanel();
    }
  }

  async function sendSelectionToAgent(params) {
    const contentText = normalizeText(
      params.contentText,
      params.sourceType === "selection" ? MAX_SELECTION_TEXT_CHARS : MAX_PAGE_TEXT_CHARS,
    );
    if (!contentText) {
      throw new Error("未能读取可发送内容");
    }

    const { targetAgent, targetChatKey, baseUrl } = await resolveRouteInfo({
      ...state.lastSettings,
      agentId: state.activeAgentId || state.lastSettings.agentId,
      chatKey: state.activeChatKey || state.lastSettings.chatKey,
    });

    const attachment = buildContextAttachment({
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      pageLang: params.pageLang,
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
      <link rel="stylesheet" href="${CONTENT_STYLE_URL}" />

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
            <button id="dcRouteTrigger" class="dc-route-trigger" type="button" aria-label="选择 Agent 和 Chat">
              <img class="dc-agent-icon" src="${TRIGGER_ICON_URL}" alt="" aria-hidden="true" />
              <div id="dcAgentTag" class="dc-agent-tag">Agent</div>
            </button>
            <button id="dcSendBtn" class="dc-send-btn" type="button" aria-label="发送">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 18V6"></path>
                <path d="M7 11L12 6L17 11"></path>
              </svg>
            </button>
          </div>
          <div id="dcRoutePanel" class="dc-route-panel dc-hidden">
            <div class="dc-route-section">
              <div class="dc-route-title">Agent</div>
              <div id="dcAgentList" class="dc-route-list"></div>
            </div>
            <div class="dc-route-section">
              <div class="dc-route-title">Chat</div>
              <div id="dcChatList" class="dc-route-list"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="dcToast" class="dc-toast dc-hidden" data-type="success"></div>
    `;

    const mountTarget = document.body || document.documentElement;
    mountTarget.appendChild(host);

    return {
      host,
      selectionOverlay: shadow.getElementById("dcSelectionOverlay"),
      trigger: shadow.getElementById("dcTrigger"),
      triggerBtn: shadow.getElementById("dcTriggerBtn"),
      composer: shadow.getElementById("dcComposer"),
      input: shadow.getElementById("dcInput"),
      routeTrigger: shadow.getElementById("dcRouteTrigger"),
      routePanel: shadow.getElementById("dcRoutePanel"),
      agentList: shadow.getElementById("dcAgentList"),
      chatList: shadow.getElementById("dcChatList"),
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

  function setRoutePanelOpen(open) {
    state.isRoutePanelOpen = Boolean(open);
    ui.routePanel.classList.toggle("dc-hidden", !state.isRoutePanelOpen);
  }

  function renderRoutePanel() {
    const selectedAgent = state.routeAgents.find((item) => item.id === state.activeAgentId) || null;
    const selectedChat = state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
    const agentLabel = state.isRouteLoading
      ? "加载 Agent..."
      : (selectedAgent ? toAgentOptionLabel(selectedAgent) : "选择 Agent");
    const chatLabel = state.isRouteLoading
      ? "加载 Chat..."
      : (selectedChat ? selectedChat.title : "选择 Chat");

    ui.routeTrigger.title = `${agentLabel} / ${chatLabel}`;
    ui.routeTrigger.disabled = state.isSending || state.isRouteLoading || state.routeAgents.length < 1;

    ui.agentList.replaceChildren();
    if (state.routeAgents.length > 0) {
      for (const agent of state.routeAgents) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dc-route-item";
        button.dataset.selected = agent.id === state.activeAgentId ? "true" : "false";
        button.textContent = toAgentOptionLabel(agent);
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          void selectAgent(agent.id);
        });
        ui.agentList.appendChild(button);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "dc-route-empty";
      empty.textContent = "没有可用 Agent";
      ui.agentList.appendChild(empty);
    }

    ui.chatList.replaceChildren();
    if (state.routeChats.length > 0) {
      for (const chat of state.routeChats) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dc-route-item";
        button.dataset.selected = chat.chatKey === state.activeChatKey ? "true" : "false";
        button.textContent = normalizeText(chat.title, 72);
        button.title = chat.title;
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          void selectChat(chat.chatKey);
        });
        ui.chatList.appendChild(button);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "dc-route-empty";
      empty.textContent = "当前 Agent 暂无 Chat";
      ui.chatList.appendChild(empty);
    }
  }

  function renderAgentTag() {
    const selectedChat = state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
    const chatShort = selectedChat ? normalizeText(selectedChat.title, 26) : "No Chat";
    ui.agentTag.textContent = state.routeErrorText || `${state.agentTagText || "Agent"} · ${chatShort}`;
    ui.agentTag.dataset.state = state.routeErrorText ? "error" : "default";
    ui.routeTrigger.dataset.state = state.routeErrorText ? "error" : "default";
    ui.agentTag.title = state.routeErrorText || `${state.agentTagText || "Agent"} / ${chatShort}`;
    ui.sendBtn.disabled = state.isSending;
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
      setRoutePanelOpen(false);
      renderAgentTag();
      renderRoutePanel();
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
    setRoutePanelOpen(false);
    hideSelectionOverlay();
    setInputPlaceholder("idle");
  }

  async function selectAgent(agentId) {
    const selectedId = normalizeText(agentId, 240);
    if (!selectedId || selectedId === state.activeAgentId) {
      setRoutePanelOpen(false);
      return;
    }
    setRoutePanelOpen(false);
    const nextSettings = {
      ...state.lastSettings,
      agentId: selectedId,
      chatKey: "",
    };
    await refreshRouteState(nextSettings);
  }

  async function selectChat(chatKey) {
    const selectedKey = normalizeText(chatKey, 300);
    if (!selectedKey || selectedKey === state.activeChatKey) {
      setRoutePanelOpen(false);
      return;
    }
    setRoutePanelOpen(false);
    state.activeChatKey = selectedKey;
    state.lastSettings = {
      ...state.lastSettings,
      agentId: state.activeAgentId,
      chatKey: selectedKey,
    };
    await saveSettings(state.lastSettings);
    renderRoutePanel();
    renderAgentTag();
    const selectedChat = state.routeChats.find((item) => item.chatKey === selectedKey) || null;
    if (selectedChat) {
      showToast("success", `已切换到 ${normalizeText(selectedChat.title, 32)}`);
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

    void refreshRouteState();
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

      const content = document.createElement("span");
      content.className = "dc-slash-text";
      content.textContent = normalizeText(item.prompt, 72);

      const rank = document.createElement("span");
      rank.className = "dc-slash-rank";
      rank.textContent = String(index + 1);

      button.appendChild(content);
      button.appendChild(rank);

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
    renderRoutePanel();
    ui.sendBtn.disabled = state.isSending;
    if (state.isSending) {
      hideSlashMenu();
      setRoutePanelOpen(false);
      setInputPlaceholder("sending");
      return;
    }
    renderRoutePanel();
    renderAgentTag();
    setInputPlaceholder("idle");
  }

  async function submit() {
    if (state.isSending) return;
    if (
      state.isRouteLoading
      || state.routeErrorText
      || !state.activeAgentId
      || !state.activeChatKey
    ) {
      await refreshRouteState({
        ...state.lastSettings,
        agentId: state.activeAgentId || state.lastSettings.agentId,
        chatKey: state.activeChatKey || state.lastSettings.chatKey,
      });
      if (state.routeErrorText || !state.activeAgentId || !state.activeChatKey) {
        showToast(
          "error",
          state.routeErrorText || "当前没有可用 Agent 或 Chat，请先检查设置",
        );
        return;
      }
    }

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
      const pageMeta = getSafePageMeta();
      const result = await sendSelectionToAgent({
        pageTitle: pageMeta.title,
        pageUrl: pageMeta.url,
        pageLang: pageMeta.lang,
        contentText,
        sourceType,
        taskPrompt,
      });
      if (result && result.agentLabel) {
        state.agentTagText = result.agentLabel;
      }
      await refreshAskHistoryCommands().catch(() => {});
      const selectedChat = state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
      showToast("success", `已发送到 ${normalizeText(selectedChat && selectedChat.title, 36) || "目标会话"}`);
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
      state.activeAgentId = settings.agentId || "";
      state.activeChatKey = settings.chatKey || "";
      renderRoutePanel();
      renderAgentTag();
    })
    .catch(() => {
      applySettingsToState(DEFAULT_SETTINGS);
      state.activeAgentId = "";
      state.activeChatKey = "";
      renderRoutePanel();
      renderAgentTag();
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

  ui.routeTrigger.addEventListener("click", () => {
    if (ui.routeTrigger.disabled) return;
    const nextOpen = !state.isRoutePanelOpen;
    setRoutePanelOpen(nextOpen);
    if (!nextOpen) return;
    void refreshRouteState({
      ...state.lastSettings,
      agentId: state.activeAgentId || state.lastSettings.agentId,
      chatKey: state.activeChatKey || state.lastSettings.chatKey,
    });
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
      if (state.isRoutePanelOpen) {
        setRoutePanelOpen(false);
        return;
      }
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
    "selectionchange",
    () => {
      queueMicrotask(() => {
        refreshTriggerFromSelection();
      });
    },
    true,
  );

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
      const eventTarget = event.target;
      const clickedInsideUi = path.includes(ui.host)
        || (eventTarget instanceof Node && ui.host.contains(eventTarget));
      if (clickedInsideUi) {
        return;
      }

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
