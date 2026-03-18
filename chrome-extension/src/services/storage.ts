/**
 * 插件设置存储服务。
 *
 * 关键点（中文）：
 * - 使用 chrome.storage.sync 持久化用户配置。
 * - 读写统一 Promise 化，避免 callback 地狱。
 */

import type { ExtensionSettings } from "../types/extension";

const STORAGE_KEY = "shipmyagent.extension.settings.v1";

/**
 * 默认设置。
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  agentId: "",
  chatKey: "",
  taskPrompt: "请阅读这个页面并给我一个可执行摘要。",
};

/**
 * 加载设置。
 */
export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result as Record<string, unknown>);
    });
  });

  const raw = stored[STORAGE_KEY];
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const value = raw as Partial<ExtensionSettings> & { consoleBaseUrl?: string };
  return {
    // 关键点（中文）：兼容旧存储结构，忽略历史 consoleBaseUrl 字段。
    agentId: typeof value.agentId === "string" ? value.agentId.trim() : "",
    chatKey: typeof value.chatKey === "string" ? value.chatKey.trim() : "",
    taskPrompt:
      typeof value.taskPrompt === "string" && value.taskPrompt.trim()
        ? value.taskPrompt
        : DEFAULT_SETTINGS.taskPrompt,
  };
}

/**
 * 保存设置。
 */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}
