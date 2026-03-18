/**
 * 浏览器标签页上下文服务。
 *
 * 关键点（中文）：
 * - popup 打开时读取当前活动标签页。
 * - 只暴露插件业务需要的最小字段。
 */

import type { ActiveTabContext } from "../types/extension";

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
