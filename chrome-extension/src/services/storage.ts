/**
 * 插件设置存储服务。
 *
 * 关键点（中文）：
 * - 使用 chrome.storage.sync 持久化用户配置。
 * - 读写统一 Promise 化，避免 callback 地狱。
 */

import type {
  ExtensionPageSendRecord,
  ExtensionQuickPromptItem,
  ExtensionSettings,
} from "../types/extension";

const STORAGE_KEY = "shipmyagent.extension.settings.v1";
const SEND_HISTORY_STORAGE_KEY = "shipmyagent.extension.send.history.v1";
const SEND_HISTORY_MAX_COUNT = 120;
const DEFAULT_CONSOLE_HOST = "127.0.0.1";
const DEFAULT_CONSOLE_PORT = 5315;

/**
 * 默认常用问题模板。
 */
export const DEFAULT_QUICK_PROMPTS: ExtensionQuickPromptItem[] = [
  {
    id: "quick-summary",
    title: "摘要 + 要点",
    prompt: "阅读附件后，输出 5 条关键要点，并给出一句总结。",
  },
  {
    id: "quick-actions",
    title: "可执行建议",
    prompt: "阅读附件后，给出 3 条可执行建议（含优先级与预期收益）。",
  },
  {
    id: "quick-risk",
    title: "风险检查",
    prompt: "阅读附件后，列出主要风险与不确定性，并给出规避建议。",
  },
  {
    id: "quick-brief",
    title: "会议速记版",
    prompt: "阅读附件后，整理成会议速记：背景、现状、决策点、待办。",
  },
];

function normalizeHost(input: unknown): string {
  const value = String(input || "").trim();
  return value || DEFAULT_CONSOLE_HOST;
}

function normalizePort(input: unknown): number {
  const value =
    typeof input === "number"
      ? input
      : Number.parseInt(String(input || "").trim(), 10);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return DEFAULT_CONSOLE_PORT;
  }
  if (value < 1 || value > 65535) return DEFAULT_CONSOLE_PORT;
  return Math.trunc(value);
}

function normalizeQuickPromptId(input: unknown): string {
  const value = String(input || "").trim();
  return value || "";
}

function toQuickPromptIdFromTitle(title: string): string {
  const ascii = String(title || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return ascii ? `quick-${ascii}` : `quick-${Date.now()}`;
}

function normalizeQuickPromptItem(
  input: Partial<ExtensionQuickPromptItem> | null | undefined,
): ExtensionQuickPromptItem | null {
  if (!input || typeof input !== "object") return null;
  const title = String(input.title || "").replace(/\s+/g, " ").trim();
  const prompt = String(input.prompt || "").trim();
  if (!title || !prompt) return null;
  const id = normalizeQuickPromptId(input.id) || toQuickPromptIdFromTitle(title);
  return {
    id,
    title: title.slice(0, 40),
    prompt: prompt.slice(0, 5000),
  };
}

function normalizeQuickPromptList(input: unknown): ExtensionQuickPromptItem[] {
  const source = Array.isArray(input) ? input : [];
  const out: ExtensionQuickPromptItem[] = [];
  const idSet = new Set<string>();
  for (const item of source) {
    const normalized = normalizeQuickPromptItem(
      item as Partial<ExtensionQuickPromptItem>,
    );
    if (!normalized) continue;
    if (idSet.has(normalized.id)) continue;
    out.push(normalized);
    idSet.add(normalized.id);
  }
  if (out.length > 0) return out;
  return DEFAULT_QUICK_PROMPTS.map((item) => ({ ...item }));
}

/**
 * 从历史 `consoleBaseUrl` 派生 host/port。
 *
 * 关键点（中文）：
 * - 向后兼容旧字段，避免升级后用户配置丢失。
 */
function parseLegacyBaseUrl(input: unknown): {
  consoleHost: string;
  consolePort: number;
} | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const host = normalizeHost(parsed.hostname);
    const port = normalizePort(parsed.port || DEFAULT_CONSOLE_PORT);
    return { consoleHost: host, consolePort: port };
  } catch {
    return null;
  }
}

/**
 * 默认设置。
 */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  consoleHost: DEFAULT_CONSOLE_HOST,
  consolePort: DEFAULT_CONSOLE_PORT,
  agentId: "",
  chatKey: "",
  taskPrompt: "请阅读这个页面并给我一个可执行摘要。",
  quickPrompts: DEFAULT_QUICK_PROMPTS.map((item) => ({ ...item })),
  defaultQuickPromptId: DEFAULT_QUICK_PROMPTS[0]?.id || "",
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
  const legacy = parseLegacyBaseUrl(value.consoleBaseUrl);
  const quickPrompts = normalizeQuickPromptList(value.quickPrompts);
  const defaultQuickPromptId = normalizeQuickPromptId(value.defaultQuickPromptId);
  const safeDefaultQuickPromptId = quickPrompts.some(
    (item) => item.id === defaultQuickPromptId,
  )
    ? defaultQuickPromptId
    : quickPrompts[0]?.id || "";

  return {
    // 关键点（中文）：兼容旧存储结构（旧版本可能只保存 consoleBaseUrl）。
    consoleHost: legacy?.consoleHost || normalizeHost(value.consoleHost),
    consolePort: legacy?.consolePort || normalizePort(value.consolePort),
    agentId: typeof value.agentId === "string" ? value.agentId.trim() : "",
    chatKey: typeof value.chatKey === "string" ? value.chatKey.trim() : "",
    taskPrompt:
      typeof value.taskPrompt === "string" && value.taskPrompt.trim()
        ? value.taskPrompt
        : DEFAULT_SETTINGS.taskPrompt,
    quickPrompts,
    defaultQuickPromptId: safeDefaultQuickPromptId,
  };
}

/**
 * 保存设置。
 */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const quickPrompts = normalizeQuickPromptList(settings.quickPrompts);
  const defaultQuickPromptId = normalizeQuickPromptId(settings.defaultQuickPromptId);
  const normalizedSettings: ExtensionSettings = {
    consoleHost: normalizeHost(settings.consoleHost),
    consolePort: normalizePort(settings.consolePort),
    agentId: String(settings.agentId || "").trim(),
    chatKey: String(settings.chatKey || "").trim(),
    taskPrompt: String(settings.taskPrompt || "").trim() || DEFAULT_SETTINGS.taskPrompt,
    quickPrompts,
    defaultQuickPromptId: quickPrompts.some((item) => item.id === defaultQuickPromptId)
      ? defaultQuickPromptId
      : quickPrompts[0]?.id || "",
  };
  await new Promise<void>((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: normalizedSettings }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function normalizePageUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeSendRecord(
  input: Partial<ExtensionPageSendRecord> | null | undefined,
): ExtensionPageSendRecord | null {
  if (!input || typeof input !== "object") return null;
  const id = String(input.id || "").trim();
  const pageUrl = normalizePageUrl(String(input.pageUrl || ""));
  const pageTitle = String(input.pageTitle || "").trim();
  const agentId = String(input.agentId || "").trim();
  const chatKey = String(input.chatKey || "").trim();
  const taskPrompt = String(input.taskPrompt || "").trim();
  const attachmentFileName = String(input.attachmentFileName || "").trim();
  const sentAt =
    typeof input.sentAt === "number" && Number.isFinite(input.sentAt)
      ? Math.trunc(input.sentAt)
      : 0;
  if (!id || !pageUrl || !agentId || !chatKey || !attachmentFileName || sentAt <= 0) {
    return null;
  }
  return {
    id,
    pageUrl,
    pageTitle,
    agentId,
    chatKey,
    taskPrompt,
    attachmentFileName,
    sentAt,
  };
}

async function loadAllSendRecords(): Promise<ExtensionPageSendRecord[]> {
  const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
    chrome.storage.local.get([SEND_HISTORY_STORAGE_KEY], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result as Record<string, unknown>);
    });
  });
  const raw = stored[SEND_HISTORY_STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  const out: ExtensionPageSendRecord[] = [];
  for (const item of raw) {
    const normalized = normalizeSendRecord(
      item as Partial<ExtensionPageSendRecord>,
    );
    if (!normalized) continue;
    out.push(normalized);
  }
  out.sort((a, b) => b.sentAt - a.sentAt);
  return out;
}

async function saveAllSendRecords(records: ExtensionPageSendRecord[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [SEND_HISTORY_STORAGE_KEY]: records }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * 记录一次页面发送事件。
 */
export async function appendPageSendRecord(params: {
  pageUrl: string;
  pageTitle: string;
  agentId: string;
  chatKey: string;
  taskPrompt: string;
  attachmentFileName: string;
}): Promise<void> {
  const nextRecord: ExtensionPageSendRecord = {
    // 关键点（中文）：本地记录 id 仅用于 UI 列表渲染，无需与服务端对齐。
    id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    pageUrl: normalizePageUrl(params.pageUrl),
    pageTitle: String(params.pageTitle || "").trim(),
    agentId: String(params.agentId || "").trim(),
    chatKey: String(params.chatKey || "").trim(),
    taskPrompt: String(params.taskPrompt || "").trim(),
    attachmentFileName: String(params.attachmentFileName || "").trim(),
    sentAt: Date.now(),
  };
  const all = await loadAllSendRecords();
  const merged = [nextRecord, ...all].slice(0, SEND_HISTORY_MAX_COUNT);
  await saveAllSendRecords(merged);
}

/**
 * 读取当前页面发送记录。
 */
export async function loadPageSendRecords(params: {
  pageUrl: string;
  limit?: number;
}): Promise<ExtensionPageSendRecord[]> {
  const pageUrl = normalizePageUrl(params.pageUrl);
  if (!pageUrl) return [];
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.min(50, Math.trunc(params.limit)))
      : 8;
  const all = await loadAllSendRecords();
  return all.filter((item) => item.pageUrl === pageUrl).slice(0, limit);
}
