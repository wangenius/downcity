/**
 * Chrome Extension 后台脚本。
 *
 * 关键点（中文）：
 * - 负责把扩展图标与 Popup 消息接到 Chrome Side Panel。
 * - 负责把网页选区引用转发给 Side Panel。
 * - 不承载业务状态，避免 service worker 生命周期影响对话上下文。
 */

import type { SelectionReferenceMessage } from "./types/sidePanel";

let pendingSelectionReference: SelectionReferenceMessage | null = null;

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

function openSidePanel(tabId: number | undefined) {
  if (tabId) {
    void chrome.sidePanel.open({ tabId });
    return;
  }

  void chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTabId = tabs[0]?.id;
    if (activeTabId) {
      void chrome.sidePanel.open({ tabId: activeTabId });
    }
  });
}

function pushSelectionReferenceToSidePanel(reference: SelectionReferenceMessage) {
  chrome.runtime.sendMessage(reference, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isRecord(message)) return false;

  const type = String(message.type || "").trim();
  if (type === "downcity.side-panel.ready") {
    const reference = pendingSelectionReference;
    pendingSelectionReference = null;
    sendResponse({ reference });
    return false;
  }

  if (type === "downcity.page-selection.reference") {
    const reference = toSelectionReferenceMessage(message);
    if (!reference.text) return false;
    pendingSelectionReference = reference;
    openSidePanel(sender.tab?.id);
    pushSelectionReferenceToSidePanel(reference);
    return false;
  }

  if (type === "downcity.open-side-panel") {
    openSidePanel(sender.tab?.id);
    return false;
  }

  return false;
});
