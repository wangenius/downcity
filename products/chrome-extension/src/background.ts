/**
 * Chrome Extension 后台脚本。
 *
 * 关键点（中文）：
 * - 负责把扩展图标与 Popup 消息接到 Chrome Side Panel。
 * - 不承载业务状态，避免 service worker 生命周期影响对话上下文。
 */

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender) => {
  const type = String((message as Record<string, unknown>)?.type || "").trim();
  if (type !== "downcity.open-side-panel") return false;

  const tabId = sender.tab?.id;
  if (tabId) {
    void chrome.sidePanel.open({ tabId });
    return false;
  }

  void chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTabId = tabs[0]?.id;
    if (activeTabId) {
      void chrome.sidePanel.open({ tabId: activeTabId });
    }
  });
  return false;
});
