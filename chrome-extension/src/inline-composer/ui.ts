/**
 * Inline Composer UI。
 *
 * 关键点（中文）：
 * - 负责选区按钮、输入面板、路由面板与快捷键交互。
 * - 与页面提取、路由投递解耦，便于后续继续拆分和测试。
 */

import type {
  AskHistoryCommand,
  InlineComposerRouteSettings,
  InlineComposerState,
  MountedInlineComposerUi,
  SelectionRectSnapshot,
} from "../types/inlineComposer";
import {
  COMPOSER_MAX_WIDTH,
  COMPOSER_MIN_WIDTH,
  CONTENT_STYLE_URL,
  DEFAULT_ROUTE_SETTINGS,
  MAX_PAGE_TEXT_CHARS,
  MAX_PROMPT_CHARS,
  MAX_SELECTION_TEXT_CHARS,
  TRIGGER_ICON_URL,
  VIEWPORT_MARGIN,
} from "./constants";
import { clipText, normalizeText, readErrorText } from "./helpers";
import {
  getCurrentPageSnapshot,
  getCurrentSelectionText,
  getSafePageMeta,
  getSelectionRangeRect,
  getSelectionRangeRects,
  isEditableTarget,
} from "./pageContext";
import {
  loadAskHistoryCommands,
  loadRouteSettings,
  resolveRouteInfo,
  saveRouteSettings,
  sendPageContextToAgent,
  summarizeRouteErrorText,
  toAgentOptionLabel,
  MAX_SLASH_ITEMS,
} from "./route";

const DEFAULT_INPUT_PLACEHOLDER = "Ask for follow-up changes";

function createInitialState(): InlineComposerState {
  return {
    isOpen: false,
    isSending: false,
    selectionText: "",
    selectionRect: null,
    selectionRects: [],
    hoverSelectionText: "",
    hoverSelectionRect: null,
    lastSettings: { ...DEFAULT_ROUTE_SETTINGS },
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
}

function mustElement<T extends Element>(value: Element | null, name: string): T {
  if (!value) {
    throw new Error(`Missing required UI node: ${name}`);
  }
  return value as T;
}

function mountUi(): MountedInlineComposerUi {
  const host = document.createElement("div");
  host.id = "downcity-inline-share-root";

  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <link rel="stylesheet" href="${CONTENT_STYLE_URL}" />

    <div id="dcSelectionOverlay" class="dc-selection-overlay dc-hidden" hidden></div>

    <div id="dcTrigger" class="dc-trigger dc-hidden" hidden>
      <button id="dcTriggerBtn" class="dc-trigger-btn" type="button" aria-label="打开输入框">
        <img class="dc-trigger-icon" src="${TRIGGER_ICON_URL}" alt="" aria-hidden="true" />
      </button>
    </div>

    <div id="dcComposer" class="dc-composer dc-hidden" hidden>
      <div class="dc-shell">
        <div id="dcSlash" class="dc-slash dc-hidden" hidden></div>
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
        <div id="dcRoutePanel" class="dc-route-panel dc-hidden" hidden>
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

    <div id="dcToast" class="dc-toast dc-hidden" data-type="success" hidden></div>
  `;

  (document.body || document.documentElement).appendChild(host);

  return {
    host,
    selectionOverlay: mustElement<HTMLDivElement>(
      shadow.getElementById("dcSelectionOverlay"),
      "dcSelectionOverlay",
    ),
    trigger: mustElement<HTMLDivElement>(shadow.getElementById("dcTrigger"), "dcTrigger"),
    triggerBtn: mustElement<HTMLButtonElement>(
      shadow.getElementById("dcTriggerBtn"),
      "dcTriggerBtn",
    ),
    composer: mustElement<HTMLDivElement>(shadow.getElementById("dcComposer"), "dcComposer"),
    input: mustElement<HTMLTextAreaElement>(shadow.getElementById("dcInput"), "dcInput"),
    routeTrigger: mustElement<HTMLButtonElement>(
      shadow.getElementById("dcRouteTrigger"),
      "dcRouteTrigger",
    ),
    routePanel: mustElement<HTMLDivElement>(
      shadow.getElementById("dcRoutePanel"),
      "dcRoutePanel",
    ),
    agentList: mustElement<HTMLDivElement>(shadow.getElementById("dcAgentList"), "dcAgentList"),
    chatList: mustElement<HTMLDivElement>(shadow.getElementById("dcChatList"), "dcChatList"),
    agentTag: mustElement<HTMLDivElement>(shadow.getElementById("dcAgentTag"), "dcAgentTag"),
    sendBtn: mustElement<HTMLButtonElement>(shadow.getElementById("dcSendBtn"), "dcSendBtn"),
    slash: mustElement<HTMLDivElement>(shadow.getElementById("dcSlash"), "dcSlash"),
    toast: mustElement<HTMLDivElement>(shadow.getElementById("dcToast"), "dcToast"),
  };
}

/**
 * 启动页面内输入面板。
 */
export function bootstrapInlineComposer(): void {
  if (typeof window === "undefined") return;
  if (document.getElementById("downcity-inline-share-root")) return;

  const state = createInitialState();
  const ui = mountUi();

  function isEventInsideUi(event: Event): boolean {
    const path =
      typeof (event as Event & { composedPath?: () => EventTarget[] }).composedPath ===
      "function"
        ? (event as Event & { composedPath: () => EventTarget[] }).composedPath()
        : [];
    return path.includes(ui.host) || (event.target instanceof Node && ui.host.contains(event.target));
  }

  function isSelectionKeyboardEvent(event: KeyboardEvent): boolean {
    const key = String(event.key || "").toLowerCase();
    if (event.shiftKey) return true;
    if (
      key === "arrowleft" ||
      key === "arrowright" ||
      key === "arrowup" ||
      key === "arrowdown" ||
      key === "home" ||
      key === "end" ||
      key === "pageup" ||
      key === "pagedown"
    ) {
      return true;
    }
    return (event.metaKey || event.ctrlKey) && key === "a";
  }

  function stopUiKeyboardPropagation(event: Event): void {
    event.stopPropagation();
  }

  function setNodeHidden(node: HTMLElement, hidden: boolean): void {
    node.hidden = hidden;
    node.classList.toggle("dc-hidden", hidden);
  }

  function hideTrigger(): void {
    setNodeHidden(ui.trigger, true);
    state.hoverSelectionText = "";
    state.hoverSelectionRect = null;
  }

  function hideSelectionOverlay(): void {
    setNodeHidden(ui.selectionOverlay, true);
    ui.selectionOverlay.replaceChildren();
  }

  function hideToast(): void {
    if (state.toastTimerId !== null) {
      window.clearTimeout(state.toastTimerId);
      state.toastTimerId = null;
    }
    setNodeHidden(ui.toast, true);
    ui.toast.textContent = "";
  }

  function showToast(type: "success" | "error", text: string): void {
    const message = normalizeText(text, 140);
    if (!message) return;
    if (state.toastTimerId !== null) {
      window.clearTimeout(state.toastTimerId);
      state.toastTimerId = null;
    }
    ui.toast.dataset.type = type;
    ui.toast.textContent = message;
    setNodeHidden(ui.toast, false);
    state.toastTimerId = window.setTimeout(() => {
      hideToast();
    }, 2200);
  }

  function renderSelectionOverlay(): void {
    const rects = state.selectionRects.length > 0
      ? state.selectionRects
      : state.selectionRect
        ? [
            {
              left: state.selectionRect.left,
              top: state.selectionRect.top,
              width: state.selectionRect.width,
              height: state.selectionRect.height,
            },
          ]
        : [];

    if (rects.length < 1) {
      hideSelectionOverlay();
      return;
    }

    ui.selectionOverlay.replaceChildren();
    for (const rect of rects) {
      const node = document.createElement("div");
      node.className = "dc-selection-highlight";
      node.style.left = `${Math.round(rect.left)}px`;
      node.style.top = `${Math.round(rect.top)}px`;
      node.style.width = `${Math.round(rect.width)}px`;
      node.style.height = `${Math.round(rect.height)}px`;
      ui.selectionOverlay.appendChild(node);
    }

    setNodeHidden(ui.selectionOverlay, false);
  }

  function setInputPlaceholder(
    type: "idle" | "sending" | "error",
    text?: string,
  ): void {
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

  function hideSlashMenu(): void {
    state.slashVisible = false;
    state.slashSuggestions = [];
    state.slashActiveIndex = 0;
    setNodeHidden(ui.slash, true);
    ui.slash.replaceChildren();
  }

  function setRoutePanelOpen(open: boolean): void {
    state.isRoutePanelOpen = open;
    setNodeHidden(ui.routePanel, !open);
  }

  function renderRoutePanel(): void {
    const selectedAgent =
      state.routeAgents.find((item) => item.id === state.activeAgentId) || null;
    const selectedChat =
      state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
    const agentLabel = state.isRouteLoading
      ? "加载 Agent..."
      : selectedAgent
        ? toAgentOptionLabel(selectedAgent)
        : "选择 Agent";
    const chatLabel = state.isRouteLoading
      ? "加载 Chat..."
      : selectedChat
        ? selectedChat.title
        : "选择 Chat";

    ui.routeTrigger.title = `${agentLabel} / ${chatLabel}`;
    ui.routeTrigger.disabled =
      state.isSending || state.isRouteLoading || state.routeAgents.length < 1;

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

  function renderAgentTag(): void {
    const selectedChat =
      state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
    const chatShort = selectedChat ? normalizeText(selectedChat.title, 26) : "No Chat";
    const text =
      state.routeErrorText || `${state.agentTagText || "Agent"} · ${chatShort}`;
    ui.agentTag.textContent = text;
    ui.agentTag.dataset.state = state.routeErrorText ? "error" : "default";
    ui.routeTrigger.dataset.state = state.routeErrorText ? "error" : "default";
    ui.agentTag.title = text;
    ui.sendBtn.disabled = state.isSending;
  }

  function placeTrigger(rect: DOMRect | null): void {
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
    setNodeHidden(ui.trigger, false);
  }

  function placeComposer(rect: DOMRect | null): void {
    const anchor =
      rect ||
      state.selectionRect ||
      state.hoverSelectionRect || {
        left: window.innerWidth * 0.25,
        bottom: window.innerHeight * 0.35,
        top: window.innerHeight * 0.3,
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

  function setOpen(open: boolean): void {
    state.isOpen = open;
    if (open) {
      setNodeHidden(ui.composer, false);
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
    setNodeHidden(ui.composer, true);
    ui.input.value = "";
    ui.input.blur();
    hideSlashMenu();
    setRoutePanelOpen(false);
    hideSelectionOverlay();
    setInputPlaceholder("idle");
  }

  async function refreshRouteState(
    preferredSettings?: Partial<InlineComposerRouteSettings>,
  ): Promise<void> {
    const requestSeq = state.routeRefreshSeq + 1;
    state.routeRefreshSeq = requestSeq;
    state.isRouteLoading = true;
    renderAgentTag();
    renderRoutePanel();

    try {
      const routeInfo = await resolveRouteInfo({
        ...state.lastSettings,
        ...(preferredSettings || {}),
      });
      if (requestSeq !== state.routeRefreshSeq) return;

      state.routeBaseUrl = routeInfo.baseUrl;
      state.routeErrorText = "";
      state.routeAgents = routeInfo.agents;
      state.routeChats = routeInfo.chatOptions;
      state.activeAgentId = routeInfo.targetAgent.id;
      state.activeChatKey = routeInfo.targetChatKey;
      state.agentTagText = toAgentOptionLabel(routeInfo.targetAgent);

      const nextSettings: InlineComposerRouteSettings = {
        ...state.lastSettings,
        agentId: routeInfo.targetAgent.id,
        chatKey: routeInfo.targetChatKey,
      };
      state.lastSettings = nextSettings;
      await saveRouteSettings(nextSettings);
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

  async function selectAgent(agentId: string): Promise<void> {
    const selectedId = normalizeText(agentId, 240);
    if (!selectedId || selectedId === state.activeAgentId) {
      setRoutePanelOpen(false);
      return;
    }
    setRoutePanelOpen(false);
    await refreshRouteState({
      ...state.lastSettings,
      agentId: selectedId,
      chatKey: "",
    });
  }

  async function selectChat(chatKey: string): Promise<void> {
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
    await saveRouteSettings(state.lastSettings);
    renderRoutePanel();
    renderAgentTag();
    const selectedChat =
      state.routeChats.find((item) => item.chatKey === selectedKey) || null;
    if (selectedChat) {
      showToast("success", `已切换到 ${normalizeText(selectedChat.title, 32)}`);
    }
  }

  async function refreshAskHistoryCommands(): Promise<void> {
    state.askHistoryCommands = await loadAskHistoryCommands();
  }

  function openComposerFromSelection(
    selectionText: string,
    rect: DOMRect | null,
    rects: SelectionRectSnapshot[],
  ): void {
    state.selectionText = normalizeText(selectionText, MAX_SELECTION_TEXT_CHARS);
    state.selectionRect = rect || state.hoverSelectionRect || null;
    state.selectionRects = rects;
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

  function openComposerFromCurrentSelection(): void {
    const text = getCurrentSelectionText() || state.hoverSelectionText || "";
    const rect = getSelectionRangeRect() || state.hoverSelectionRect;
    openComposerFromSelection(text, rect, getSelectionRangeRects());
  }

  function refreshTriggerFromSelection(): void {
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

  function findTrailingSlashToken(value: string): {
    token: string;
    query: string;
    start: number;
    end: number;
  } | null {
    const match = String(value || "").match(/(?:^|\s)(\/[^\s]*)$/);
    if (!match?.[1]) return null;
    const token = String(match[1]);
    const end = String(value).length;
    return {
      token,
      query: token.slice(1).toLowerCase(),
      start: end - token.length,
      end,
    };
  }

  function filterAskHistoryCommands(query: string): AskHistoryCommand[] {
    const normalizedQuery = normalizeText(query, 40).toLowerCase();
    if (!normalizedQuery) {
      return state.askHistoryCommands.slice(0, MAX_SLASH_ITEMS);
    }
    return state.askHistoryCommands
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, MAX_SLASH_ITEMS);
  }

  function applySlashSuggestion(index: number): void {
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
    ui.input.value = clipText(`${prefix}${spacer}${selected.prompt}`, MAX_PROMPT_CHARS);
    hideSlashMenu();
    ui.input.focus();
    ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
  }

  function renderSlashMenu(): void {
    if (!state.slashVisible || state.slashSuggestions.length < 1) {
      hideSlashMenu();
      return;
    }

    setNodeHidden(ui.slash, false);
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

      button.append(content, rank);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        applySlashSuggestion(index);
      });
      ui.slash.appendChild(button);
    }
  }

  function updateSlashMenuFromInput(): void {
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

  function setSendingState(isSending: boolean): void {
    state.isSending = isSending;
    ui.input.disabled = isSending;
    renderRoutePanel();
    ui.sendBtn.disabled = isSending;
    if (isSending) {
      hideSlashMenu();
      setRoutePanelOpen(false);
      setInputPlaceholder("sending");
      return;
    }
    renderRoutePanel();
    renderAgentTag();
    setInputPlaceholder("idle");
  }

  async function submit(): Promise<void> {
    if (state.isSending) return;
    if (
      state.isRouteLoading ||
      state.routeErrorText ||
      !state.activeAgentId ||
      !state.activeChatKey
    ) {
      await refreshRouteState({
        ...state.lastSettings,
        agentId: state.activeAgentId || state.lastSettings.agentId,
        chatKey: state.activeChatKey || state.lastSettings.chatKey,
      });
      if (state.routeErrorText || !state.activeAgentId || !state.activeChatKey) {
        showToast("error", state.routeErrorText || "当前没有可用 Agent 或 Chat，请先检查设置");
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
    const pageSnapshot =
      sourceType === "page" ? getCurrentPageSnapshot() : { text: "", images: [] };
    const contentText = selectedText || normalizeText(pageSnapshot.text, MAX_PAGE_TEXT_CHARS);

    if (!contentText) {
      setInputPlaceholder("error", "未能读取页面内容，请刷新后重试");
      return;
    }

    try {
      setSendingState(true);
      const pageMeta = getSafePageMeta();
      const result = await sendPageContextToAgent(
        {
          pageTitle: pageMeta.title,
          pageUrl: pageMeta.url,
          pageLang: pageMeta.lang,
          contentText,
          images: sourceType === "page" ? pageSnapshot.images : [],
          sourceType,
          taskPrompt,
        },
        {
          ...state.lastSettings,
          agentId: state.activeAgentId,
          chatKey: state.activeChatKey,
        },
      );

      state.agentTagText = result.agentLabel;
      await refreshAskHistoryCommands().catch(() => {});
      const selectedChat =
        state.routeChats.find((item) => item.chatKey === state.activeChatKey) || null;
      showToast(
        "success",
        `已发送到 ${normalizeText(selectedChat?.title, 36) || "目标会话"}`,
      );
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

  void loadRouteSettings()
    .then((settings) => {
      state.lastSettings = { ...DEFAULT_ROUTE_SETTINGS, ...settings };
      state.activeAgentId = settings.agentId || "";
      state.activeChatKey = settings.chatKey || "";
      renderRoutePanel();
      renderAgentTag();
    })
    .catch(() => {
      state.lastSettings = { ...DEFAULT_ROUTE_SETTINGS };
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
  ui.input.addEventListener("keydown", stopUiKeyboardPropagation, true);
  ui.input.addEventListener("keypress", stopUiKeyboardPropagation, true);
  ui.input.addEventListener("keyup", stopUiKeyboardPropagation, true);

  ui.input.addEventListener("keydown", (event) => {
    stopUiKeyboardPropagation(event);
    if (event.isComposing) return;
    const key = String(event.key || "").toLowerCase();

    if (state.slashVisible && (key === "arrowdown" || key === "arrowup")) {
      event.preventDefault();
      const total = state.slashSuggestions.length;
      if (total < 1) return;
      state.slashActiveIndex =
        key === "arrowdown"
          ? (state.slashActiveIndex + 1) % total
          : (state.slashActiveIndex - 1 + total) % total;
      renderSlashMenu();
      return;
    }

    if (
      state.slashVisible &&
      (key === "enter" || key === "tab") &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      applySlashSuggestion(state.slashActiveIndex);
      return;
    }

    if (key === "enter" && (event.metaKey || event.ctrlKey)) {
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
    "mouseup",
    (event) => {
      if (isEventInsideUi(event)) return;
      queueMicrotask(() => {
        // 关键点（中文）：只在用户完成选区后刷新 trigger，避免误显示。
        refreshTriggerFromSelection();
      });
    },
    true,
  );

  document.addEventListener(
    "keyup",
    (event) => {
      if (isEventInsideUi(event) || !isSelectionKeyboardEvent(event)) return;
      queueMicrotask(() => {
        refreshTriggerFromSelection();
      });
    },
    true,
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (isEventInsideUi(event)) return;
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
      if (event.isComposing || isEventInsideUi(event)) return;
      const key = String(event.key || "").toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || key !== "u") {
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

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing || !state.isOpen || !isEventInsideUi(event)) {
        return;
      }
      const key = String(event.key || "").toLowerCase();
      if (key !== "enter") return;
      if (!event.metaKey && !event.ctrlKey) return;

      event.preventDefault();
      event.stopPropagation();
      if (!state.isSending) {
        void submit();
      }
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.isComposing || !state.isOpen) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "escape") return;

      event.preventDefault();
      event.stopPropagation();

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
    },
    true,
  );
}
