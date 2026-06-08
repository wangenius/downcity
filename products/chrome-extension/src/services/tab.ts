/**
 * 浏览器标签页上下文服务。
 *
 * 关键点（中文）：
 * - 扩展弹窗打开时读取当前活动标签页。
 * - Side Panel 常驻时订阅活动标签页变化，保证当前页面上下文同步。
 * - 只暴露插件业务需要的最小字段。
 */

import type { ActiveTabContext } from "../types/extension";

/**
 * 当前标签页选中文本。
 */
export interface ActiveTabSelectionContext {
  /**
   * 当前标签页 id。
   */
  tabId: number | null;
  /**
   * 选中文本。
   */
  text: string;
}

/**
 * 读取当前活动标签页信息。
 */
export async function getActiveTabContext(): Promise<ActiveTabContext> {
  const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs[0]);
    });
  });

  return {
    tabId: typeof tab?.id === "number" ? tab.id : null,
    title: String(tab?.title || "未命名页面").trim() || "未命名页面",
    url: String(tab?.url || "").trim(),
  };
}

/**
 * 监听当前活动标签页变化。
 */
export function subscribeActiveTabContext(
  onChange: (tab: ActiveTabContext) => void,
): () => void {
  let disposed = false;
  let lastKey = "";

  const notify = async () => {
    if (disposed) return;
    try {
      const tab = await getActiveTabContext();
      const nextKey = `${tab.tabId || ""}::${tab.title}::${tab.url}`;
      if (nextKey === lastKey) return;
      lastKey = nextKey;
      onChange(tab);
    } catch {
      // 标签页读取失败不打断侧边栏对话，下一次浏览器事件会继续尝试同步。
    }
  };

  const onActivated = () => {
    void notify();
  };
  const onUpdated = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
    if (!changeInfo.title && !changeInfo.url && changeInfo.status !== "complete") {
      return;
    }
    void notify();
  };
  const onFocusChanged = () => {
    void notify();
  };

  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  chrome.windows.onFocusChanged.addListener(onFocusChanged);
  void notify();

  return () => {
    disposed = true;
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    chrome.windows.onFocusChanged.removeListener(onFocusChanged);
  };
}

/**
 * 读取当前活动标签页选中文本。
 */
export async function getActiveTabSelectionContext(): Promise<ActiveTabSelectionContext> {
  const tab = await getActiveTabContext();
  if (typeof tab.tabId !== "number") {
    return { tabId: null, text: "" };
  }

  const results = await new Promise<chrome.scripting.InjectionResult<string>[]>(
    (resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.tabId as number },
          func: () => String(window.getSelection()?.toString() || "").trim(),
        },
        (items) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve(items || []);
        },
      );
    },
  );

  const text = String(results[0]?.result || "").replace(/\s+/g, " ").trim();
  return {
    tabId: tab.tabId,
    text: text.length > 500 ? `${text.slice(0, 497)}...` : text,
  };
}
