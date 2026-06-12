/**
 * Chrome Extension 后台脚本。
 *
 * 关键点（中文）：
 * - 负责把扩展图标与 Popup 消息接到 Chrome Side Panel。
 * - 负责把网页选区引用转发给 Side Panel。
 * - 不承载业务状态，避免 service worker 生命周期影响对话上下文。
 */

import type {
  PageSelectionReadResponse,
  PendingSelectionReferenceState,
  SelectionReferenceMessage,
} from "./types/sidePanel";
import { PENDING_SELECTION_REFERENCE_STORAGE_KEY } from "./types/sidePanel";

const OPEN_SIDE_PANEL_COMMAND = "open-side-panel";

let pendingSelectionReference: SelectionReferenceMessage | null = null;
let pendingComposerFocus = false;
let pendingSelectionReferenceExpiresAt = 0;

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input && typeof input === "object");
}

function toSelectionReferenceMessage(message: Record<string, unknown>): SelectionReferenceMessage {
  return {
    type: "downcity.side-panel.insert-selection-reference",
    id: String(message.id || `selection-${Date.now()}`).trim(),
    text: String(message.text || "").trim(),
    pageTitle: String(message.pageTitle || "").trim(),
    pageUrl: String(message.pageUrl || "").trim(),
  };
}

function toPendingSelectionReference(
  selection: PageSelectionReadResponse | null | undefined,
): SelectionReferenceMessage | null {
  const text = String(selection?.text || "").trim();
  if (!text) return null;
  return {
    type: "downcity.side-panel.insert-selection-reference",
    id: `selection-${Date.now()}`,
    text,
    pageTitle: String(selection?.pageTitle || "").trim(),
    pageUrl: String(selection?.pageUrl || "").trim(),
  };
}

function openSidePanel(tabId: number | undefined, windowId: number | undefined) {
  if (tabId) {
    void chrome.sidePanel.open({ tabId }).catch(() => undefined);
    return;
  }

  if (windowId) {
    void chrome.sidePanel.open({ windowId }).catch(() => undefined);
  }
}

function focusSidePanelComposer() {
  pendingComposerFocus = true;
  chrome.runtime.sendMessage({ type: "downcity.side-panel.focus-composer" }, () => {
    void chrome.runtime.lastError;
  });
}

function closeSidePanelWithOptions(tabId: number | undefined, windowId: number | undefined) {
  pendingComposerFocus = false;
  chrome.runtime.sendMessage({ type: "downcity.side-panel.close-self" }, () => {
    void chrome.runtime.lastError;
  });
}

function closeSidePanel(tabId: number | undefined, windowId: number | undefined) {
  if (tabId || windowId) {
    closeSidePanelWithOptions(tabId, windowId);
    return;
  }

  void chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    closeSidePanelWithOptions(tabs[0]?.id, undefined);
  });
}

function pushSelectionReferenceToSidePanel(reference: SelectionReferenceMessage) {
  chrome.runtime.sendMessage(reference, () => {
    void chrome.runtime.lastError;
  });
}

function saveSelectionReferenceToSession(reference: SelectionReferenceMessage) {
  const state: PendingSelectionReferenceState = {
    reference,
    expiresAt: Date.now() + 5000,
  };
  chrome.storage.session.set(
    {
      [PENDING_SELECTION_REFERENCE_STORAGE_KEY]: state,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function queueSelectionReference(reference: SelectionReferenceMessage) {
  pendingSelectionReference = reference;
  pendingSelectionReferenceExpiresAt = Date.now() + 3000;
  saveSelectionReferenceToSession(reference);
  pushSelectionReferenceToSidePanel(reference);
}

function readPendingSelectionReference(): SelectionReferenceMessage | null {
  if (!pendingSelectionReference) return null;
  if (Date.now() > pendingSelectionReferenceExpiresAt) {
    pendingSelectionReference = null;
    pendingSelectionReferenceExpiresAt = 0;
    return null;
  }
  return pendingSelectionReference;
}

function prepareSelectionReference(tabId: number | undefined, callback: () => void) {
  if (!tabId) {
    callback();
    return;
  }

  chrome.tabs.sendMessage(tabId, { type: "downcity.page-selection.read" }, (response) => {
    const reference = toPendingSelectionReference(response as PageSelectionReadResponse | undefined);
    if (reference) {
      queueSelectionReference(reference);
    }
    void chrome.runtime.lastError;
    callback();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  openSidePanel(tab.id, tab.windowId);
  setTimeout(focusSidePanelComposer, 120);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== OPEN_SIDE_PANEL_COMMAND) return;
  openSidePanel(tab?.id, tab?.windowId);
  prepareSelectionReference(tab?.id, () => {
    setTimeout(focusSidePanelComposer, 120);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRecord(message)) return false;

  const type = String(message.type || "").trim();
  if (type === "downcity.side-panel.ready") {
    const reference = readPendingSelectionReference();
    const focusComposer = pendingComposerFocus;
    pendingComposerFocus = false;
    sendResponse({ reference, focusComposer });
    return false;
  }

  if (type === "downcity.side-panel.close") {
    closeSidePanel(sender.tab?.id, sender.tab?.windowId);
    return false;
  }

  if (type === "downcity.page-selection.reference") {
    const reference = toSelectionReferenceMessage(message);
    if (!reference.text) return false;
    queueSelectionReference(reference);
    openSidePanel(sender.tab?.id, sender.tab?.windowId);
    setTimeout(focusSidePanelComposer, 120);
    return false;
  }

  if (type === "downcity.open-side-panel") {
    openSidePanel(sender.tab?.id, sender.tab?.windowId);
    setTimeout(focusSidePanelComposer, 120);
    return false;
  }

  return false;
});
