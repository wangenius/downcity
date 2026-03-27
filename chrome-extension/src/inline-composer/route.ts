/**
 * Inline Composer 路由与投递服务。
 *
 * 关键点（中文）：
 * - 复用现有 storage / http / console 地址能力，避免页内输入框再维护一套副本。
 * - 负责 Agent/Chat 路由解析、Markdown 附件组装与最终投递。
 */

import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  TuiContextExecuteRequestBody,
  TuiContextSummary,
  TuiContextsResponse,
} from "../types/api";
import type {
  AskHistoryCommand,
  InlineComposerChatOption,
  InlineComposerRouteSettings,
  RouteInfo,
  SendPageContextParams,
  SendToAgentResult,
} from "../types/inlineComposer";
import {
  DEFAULT_ROUTE_SETTINGS,
  MAX_PAGE_IMAGE_COUNT,
  MAX_PROMPT_CHARS,
  MAX_SLASH_ITEMS,
  SEND_HISTORY_MAX_COUNT,
} from "./constants";
import { normalizeText, toSafeFileNamePart } from "./helpers";

const STORAGE_KEY = "downcity.extension.settings.v1";
const SEND_HISTORY_STORAGE_KEY = "downcity.extension.send.history.v1";

function storageGet(
  area: "sync" | "local",
  keys: string[],
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve((result || {}) as Record<string, unknown>);
    });
  });
}

function storageSet(
  area: "sync" | "local",
  value: Record<string, unknown>,
): Promise<void> {
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

function buildConsoleBaseUrl(params: {
  host: string;
  port: number;
}): string {
  const host = String(params.host || "").trim() || "127.0.0.1";
  const rawPort =
    typeof params.port === "number"
      ? params.port
      : Number.parseInt(String(params.port || "").trim(), 10);
  if (!Number.isFinite(rawPort) || Number.isNaN(rawPort)) {
    throw new Error("Console 端口无效");
  }
  const port = Math.trunc(rawPort);
  if (port < 1 || port > 65535) {
    throw new Error("Console 端口范围应为 1-65535");
  }
  return `http://${host}:${port}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const rawText = await response.text();
  let json: unknown = null;
  if (rawText) {
    try {
      json = JSON.parse(rawText);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const errorHint =
      json && typeof json === "object"
        ? String(
            (json as Record<string, unknown>).error ||
              (json as Record<string, unknown>).message ||
              "",
          )
        : "";
    throw new Error(errorHint || `请求失败：HTTP ${response.status}`);
  }

  if (!json || typeof json !== "object") {
    throw new Error("服务返回的不是合法 JSON");
  }
  return json as T;
}

function normalizePageUrl(value: string): string {
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

function normalizeSendRecord(input: unknown): {
  id: string;
  pageUrl: string;
  pageTitle: string;
  agentId: string;
  chatKey: string;
  taskPrompt: string;
  attachmentFileName: string;
  sentAt: number;
} | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = String(value.id || "").trim();
  const pageUrl = normalizePageUrl(String(value.pageUrl || ""));
  const pageTitle = String(value.pageTitle || "").trim();
  const agentId = String(value.agentId || "").trim();
  const chatKey = String(value.chatKey || "").trim();
  const taskPrompt = String(value.taskPrompt || "").trim();
  const attachmentFileName = String(value.attachmentFileName || "").trim();
  const sentAt =
    typeof value.sentAt === "number" && Number.isFinite(value.sentAt)
      ? Math.trunc(value.sentAt)
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

async function loadAllSendRecords(): Promise<
  Array<ReturnType<typeof normalizeSendRecord> extends infer T ? Exclude<T, null> : never>
> {
  const stored = await storageGet("local", [SEND_HISTORY_STORAGE_KEY]);
  const raw = stored[SEND_HISTORY_STORAGE_KEY];
  if (!Array.isArray(raw)) return [];
  const out = raw
    .map((item) => normalizeSendRecord(item))
    .filter((item): item is Exclude<typeof item, null> => Boolean(item));
  out.sort((left, right) => right.sentAt - left.sentAt);
  return out;
}

async function loadRecentAskHistory(params?: { limit?: number }): Promise<string[]> {
  const limit =
    typeof params?.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.min(100, Math.trunc(params.limit)))
      : 12;
  const all = await loadAllSendRecords();
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of all) {
    const prompt = String(item.taskPrompt || "").trim();
    if (!prompt) continue;
    const dedupKey = prompt.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(prompt);
    if (out.length >= limit) break;
  }
  return out;
}

async function appendPageSendRecord(params: {
  pageUrl: string;
  pageTitle: string;
  agentId: string;
  chatKey: string;
  taskPrompt: string;
  attachmentFileName: string;
}): Promise<void> {
  const all = await loadAllSendRecords();
  const nextRecord = {
    id: `send_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    pageUrl: normalizePageUrl(params.pageUrl),
    pageTitle: String(params.pageTitle || "").trim(),
    agentId: String(params.agentId || "").trim(),
    chatKey: String(params.chatKey || "").trim(),
    taskPrompt: String(params.taskPrompt || "").trim(),
    attachmentFileName: String(params.attachmentFileName || "").trim(),
    sentAt: Date.now(),
  };
  await storageSet("local", {
    [SEND_HISTORY_STORAGE_KEY]: [nextRecord, ...all].slice(0, SEND_HISTORY_MAX_COUNT),
  });
}

function formatChannelName(channel: string): string {
  if (channel === "telegram") return "Telegram";
  if (channel === "feishu") return "Feishu";
  return "QQ";
}

/**
 * 将最近 ask 历史转为 slash 命令。
 */
export async function loadAskHistoryCommands(): Promise<AskHistoryCommand[]> {
  const prompts = await loadRecentAskHistory({ limit: 30 });
  return prompts.slice(0, 30).map((prompt, index) => ({
    id: `ask-history-${index + 1}`,
    prompt,
    command: `/h${index + 1}`,
    searchText: `${prompt.toLowerCase()} /h${index + 1}`,
  }));
}

/**
 * 读取 Inline Composer 使用的设置快照。
 */
export async function loadRouteSettings(): Promise<InlineComposerRouteSettings> {
  const stored = await storageGet("sync", [STORAGE_KEY]);
  const raw = stored[STORAGE_KEY];
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    consoleHost:
      normalizeText(value.consoleHost, 100) || DEFAULT_ROUTE_SETTINGS.consoleHost,
    consolePort:
      typeof value.consolePort === "number" && Number.isFinite(value.consolePort)
        ? Math.trunc(value.consolePort)
        : Number.parseInt(String(value.consolePort || DEFAULT_ROUTE_SETTINGS.consolePort), 10) ||
          DEFAULT_ROUTE_SETTINGS.consolePort,
    agentId: normalizeText(value.agentId, 240),
    chatKey: normalizeText(value.chatKey, 300),
  };
}

/**
 * 保存 Inline Composer 使用的设置快照。
 */
export async function saveRouteSettings(
  settings: InlineComposerRouteSettings,
): Promise<void> {
  const stored = await storageGet("sync", [STORAGE_KEY]);
  const raw = stored[STORAGE_KEY];
  const current =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  await storageSet("sync", {
    [STORAGE_KEY]: {
      ...current,
      consoleHost: settings.consoleHost,
      consolePort: settings.consolePort,
      agentId: settings.agentId,
      chatKey: settings.chatKey,
    },
  });
}

/**
 * 概括路由错误文案。
 */
export function summarizeRouteErrorText(errorText: string): string {
  const text = normalizeText(errorText, 160);
  if (!text) return "不可发送";
  if (/agent|未发现可用\s*agent|未运行/u.test(text)) {
    return "没有可用 Agent";
  }
  return "不可发送";
}

async function fetchAgents(baseUrl: string): Promise<ConsoleUiAgentOption[]> {
  const payload = await requestJson<ConsoleUiAgentsResponse>(
    `${baseUrl}/api/ui/agents`,
    { method: "GET" },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent 列表失败");
  }
  return Array.isArray(payload.agents) ? payload.agents : [];
}

async function fetchContexts(
  baseUrl: string,
  agentId: string,
): Promise<TuiContextSummary[]> {
  const payload = await requestJson<TuiContextsResponse>(
    `${baseUrl}/api/dashboard/sessions?agent=${encodeURIComponent(agentId)}&limit=500`,
    { method: "GET" },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载会话列表失败");
  }
  return Array.isArray(payload.sessions) ? payload.sessions : [];
}

function parseContextChannel(
  context: TuiContextSummary,
): "telegram" | "feishu" | "qq" | "" {
  const channel = normalizeText(context.channel, 40).toLowerCase();
  if (channel === "telegram" || channel === "feishu" || channel === "qq") {
    return channel;
  }
  return "";
}

function resolveContextDisplayName(context: TuiContextSummary, chatKey: string): string {
  const chatTitle = normalizeText(context.chatTitle, 80);
  const chatId = normalizeText(context.chatId, 80);
  if (chatTitle && (!chatId || chatTitle !== chatId)) {
    return chatTitle;
  }
  if (chatId) return chatId;
  if (chatKey) return chatKey;
  return "Chat";
}

function resolveLinkedChannels(
  agent: ConsoleUiAgentOption,
): Set<"telegram" | "feishu" | "qq"> {
  const out = new Set<"telegram" | "feishu" | "qq">();
  const profiles = Array.isArray(agent.chatProfiles) ? agent.chatProfiles : [];
  for (const profile of profiles) {
    const channel = normalizeText(profile.channel, 40).toLowerCase();
    const linkState = normalizeText(profile.linkState, 40).toLowerCase();
    if (linkState !== "connected") continue;
    if (channel === "telegram" || channel === "feishu" || channel === "qq") {
      out.add(channel);
    }
  }
  return out;
}

function resolveTargetAgent(
  agents: ConsoleUiAgentOption[],
  preferredAgentId: string,
): ConsoleUiAgentOption | null {
  const preferred = normalizeText(preferredAgentId, 240);
  if (preferred) {
    const matched = agents.find((item) => item.id === preferred);
    if (matched?.running) return matched;
  }
  const running = agents.find((item) => item.running);
  if (running) return running;
  if (preferred) {
    const matched = agents.find((item) => item.id === preferred);
    if (matched) return matched;
  }
  return agents[0] || null;
}

function resolveTargetChatKey(
  options: InlineComposerChatOption[],
  preferredChatKey: string,
): string {
  const preferred = normalizeText(preferredChatKey, 300);
  if (preferred && options.some((item) => item.chatKey === preferred)) {
    return preferred;
  }
  if (options.length === 1) {
    return options[0]?.chatKey || "";
  }
  return "";
}

/**
 * 生成 Agent 标签。
 */
export function toAgentOptionLabel(agent: ConsoleUiAgentOption): string {
  const name = normalizeText(agent.name, 48) || normalizeText(agent.id, 24) || "Agent";
  return agent.running ? name : `${name}（未运行）`;
}

function buildImageMarkdown(
  params: SendPageContextParams,
): string {
  if (params.sourceType !== "page" || params.images.length < 1) {
    return "";
  }

  const sections = params.images.slice(0, MAX_PAGE_IMAGE_COUNT).map((image, index) => {
    const title = normalizeText(image.title, 120);
    const alt = normalizeText(image.alt, 120) || `image-${index + 1}`;
    const titleSuffix = title ? ` "${title.replace(/"/g, '\\"')}"` : "";
    const description = title && title !== alt ? `说明：${title}` : `说明：${alt}`;

    return [
      `### 图片 ${index + 1}`,
      "",
      `![${alt}](${image.url}${titleSuffix})`,
      "",
      description,
      "",
      `链接：${image.url}`,
    ].join("\n");
  });

  return ["", "## 页面图片", "", ...sections].join("\n").trim();
}

function buildContextAttachment(params: SendPageContextParams): {
  fileName: string;
  markdown: string;
} {
  const safeTitle = normalizeText(params.pageTitle, 120) || "Untitled Page";
  const safeUrl = normalizeText(params.pageUrl, 1000) || "about:blank";
  const safeLang = normalizeText(params.pageLang, 40) || "zh-CN";
  const safeText = normalizeText(params.contentText);
  const nowIso = new Date().toISOString();
  const isSelection = params.sourceType === "selection";
  const fileSuffix = isSelection ? "selection" : "page";
  const title = isSelection ? `引用片段 · ${safeTitle}` : `页面全文快照 · ${safeTitle}`;
  const imageMarkdown = buildImageMarkdown(params);

  return {
    fileName: `${toSafeFileNamePart(safeTitle)}-${fileSuffix}.md`,
    markdown: [
      `# ${title}`,
      "",
      `> Source: ${safeUrl}`,
      `> Language: ${safeLang}`,
      `> Captured At: ${nowIso}`,
      `> Scope: ${isSelection ? "Selection" : "Full Page"}`,
      params.images.length > 0 && !isSelection
        ? `> Images: ${Math.min(params.images.length, MAX_PAGE_IMAGE_COUNT)}`
        : "",
      "",
      "---",
      "",
      "## 正文",
      "",
      "```text",
      safeText,
      "```",
      imageMarkdown,
    ]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

function buildInstructions(params: {
  attachmentName: string;
  pageUrl: string;
  taskPrompt: string;
  sourceType: "selection" | "page";
  imageCount: number;
}): string {
  const safePrompt =
    normalizeText(params.taskPrompt, MAX_PROMPT_CHARS) || "请基于引用内容处理并回复。";
  const scopeText = params.sourceType === "selection" ? "选区引用" : "页面全文";
  return [
    `附件：${params.attachmentName}`,
    `原文链接：${normalizeText(params.pageUrl, 1000) || "N/A"}`,
    `内容范围：${scopeText}`,
    params.sourceType === "page" && params.imageCount > 0
      ? `页面图片：已附带 ${Math.min(params.imageCount, MAX_PAGE_IMAGE_COUNT)} 张图片引用`
      : "",
    `用户要求：${safePrompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 解析当前可用路由。
 */
export async function resolveRouteInfo(
  inputSettings?: Partial<InlineComposerRouteSettings>,
): Promise<RouteInfo> {
  const loaded = await loadRouteSettings();
  const settings: InlineComposerRouteSettings = {
    ...DEFAULT_ROUTE_SETTINGS,
    ...loaded,
    ...(inputSettings || {}),
  };
  const baseUrl = buildConsoleBaseUrl({
    host: settings.consoleHost,
    port: settings.consolePort,
  });

  const agents = await fetchAgents(baseUrl);
  if (agents.length < 1) {
    throw new Error("未发现可用 Agent，请先执行 `city agent start`");
  }

  const targetAgent = resolveTargetAgent(agents, settings.agentId);
  if (!targetAgent) {
    throw new Error("未发现可用 Agent");
  }
  if (!targetAgent.running) {
    throw new Error("目标 Agent 未运行，请先启动后再试");
  }

  const contexts = await fetchContexts(baseUrl, targetAgent.id);
  const linkedChannels = resolveLinkedChannels(targetAgent);

  const options: InlineComposerChatOption[] = [];
  const seen = new Set<string>();

  for (const context of contexts) {
    const chatKey = normalizeText(context.sessionId, 300);
    if (!chatKey || seen.has(chatKey)) continue;
    const channel = parseContextChannel(context);
    if (!channel) continue;
    if (linkedChannels.size > 0 && !linkedChannels.has(channel)) continue;

    seen.add(chatKey);
    options.push({
      chatKey,
      channel,
      title: `${resolveContextDisplayName(context, chatKey)} · ${formatChannelName(channel)}`,
      updatedAt:
        typeof context.updatedAt === "number" && Number.isFinite(context.updatedAt)
          ? context.updatedAt
          : 0,
      messageCount:
        typeof context.messageCount === "number" && Number.isFinite(context.messageCount)
          ? context.messageCount
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

/**
 * 发送页面上下文到 Agent。
 */
export async function sendPageContextToAgent(
  params: SendPageContextParams,
  routeSettings: InlineComposerRouteSettings,
): Promise<SendToAgentResult> {
  const { targetAgent, targetChatKey, baseUrl } = await resolveRouteInfo(routeSettings);
  const attachment = buildContextAttachment(params);
  const executeUrl = `${baseUrl}/api/dashboard/sessions/${encodeURIComponent(targetChatKey)}/execute?agent=${encodeURIComponent(targetAgent.id)}`;

  const body: TuiContextExecuteRequestBody = {
    instructions: buildInstructions({
      attachmentName: attachment.fileName,
      pageUrl: params.pageUrl,
      taskPrompt: params.taskPrompt,
      sourceType: params.sourceType,
      imageCount: params.images.length,
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
  };

  const response = await fetch(executeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const raw = await response.text();
    let hint = "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
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

export { MAX_SLASH_ITEMS };
