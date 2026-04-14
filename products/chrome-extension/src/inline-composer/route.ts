/**
 * Inline Composer 路由与投递服务。
 *
 * 关键点（中文）：
 * - 复用现有 storage / http / console 地址能力，避免页内输入框再维护一套副本。
 * - 负责 Agent/Chat 路由解析、Markdown 附件组装与最终投递。
 */

import type {
  ConsoleInlineInstantRequestBody,
  ConsoleInlineInstantResponse,
  ConsoleModelOption,
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  TuiContextExecuteRequestBody,
  TuiContextSummary,
  TuiContextsResponse,
} from "../types/api";
import type {
  AskHistoryCommand,
  ChannelRouteInfo,
  InlineComposerChatOption,
  InlineComposerRouteSettings,
  InstantRouteInfo,
  SendPageContextParams,
  SendToAgentResult,
} from "../types/inlineComposer";
import type { InlineInstantExecutorType } from "../types/extension";
import { requestViaBackground } from "../services/backgroundHttp";
import {
  DEFAULT_ROUTE_SETTINGS,
  MAX_PAGE_IMAGE_COUNT,
  MAX_PROMPT_CHARS,
  MAX_SLASH_ITEMS,
  SEND_HISTORY_MAX_COUNT,
} from "./constants";
import { normalizeText, toSafeFileNamePart } from "./helpers";

const SEND_HISTORY_STORAGE_KEY = "downcity.extension.send.history.v1";
const SETTINGS_STORAGE_KEY = "downcity.extension.settings.v1";
const AUTH_STORAGE_KEY = "downcity.extension.auth.v1";
const DEFAULT_CONSOLE_HOST = "127.0.0.1";
const DEFAULT_CONSOLE_PORT = 5315;

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

function normalizeAuthToken(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const matched = raw.match(/^Bearer\s+(.+)$/i);
  return String(matched?.[1] || raw).trim();
}

function buildAuthHeaders(params?: {
  authToken?: unknown;
  headers?: HeadersInit;
}): Headers {
  const headers = new Headers(params?.headers || {});
  const token = normalizeAuthToken(params?.authToken);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

function toHeaderRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
  authOptions?: { authToken?: unknown },
): Promise<T> {
  const response = await requestViaBackground({
    url,
    method: String(init?.method || "GET"),
    headers: toHeaderRecord(
      buildAuthHeaders({
        authToken: authOptions?.authToken,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      }),
    ),
    body: typeof init?.body === "string" ? init.body : undefined,
  });

  const rawText = response.text;
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
    throw new Error(
      errorHint || `请求失败：HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error("服务返回的不是合法 JSON");
  }
  return json as T;
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
  if (value < 1 || value > 65535) {
    return DEFAULT_CONSOLE_PORT;
  }
  return Math.trunc(value);
}

function parseLegacyBaseUrl(input: unknown): {
  consoleHost: string;
  consolePort: number;
} | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return {
      consoleHost: normalizeHost(parsed.hostname),
      consolePort: normalizePort(parsed.port || DEFAULT_CONSOLE_PORT),
    };
  } catch {
    return null;
  }
}

async function loadStoredRouteSnapshot(): Promise<{
  consoleHost: string;
  consolePort: number;
  agentId: string;
  chatKey: string;
  inlineMode: "channel" | "instant";
  instantExecutor: InlineInstantExecutorType;
  instantAgentId: string;
  instantModelId: string;
  legacyAuthToken: string;
}> {
  const stored = await storageGet("sync", [SETTINGS_STORAGE_KEY]);
  const raw = stored[SETTINGS_STORAGE_KEY];
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const legacy = parseLegacyBaseUrl(value.consoleBaseUrl);

  return {
    consoleHost: legacy?.consoleHost || normalizeHost(value.consoleHost),
    consolePort: legacy?.consolePort || normalizePort(value.consolePort),
    agentId: normalizeText(value.agentId, 240),
    chatKey: normalizeText(value.chatKey, 300),
    inlineMode: String(value.inlineMode || "").trim() === "instant" ? "instant" : "channel",
    instantExecutor: String(value.instantExecutor || "").trim() === "acp" ? "acp" : "model",
    instantAgentId: normalizeText(value.instantAgentId, 240),
    instantModelId: normalizeText(value.instantModelId, 240),
    legacyAuthToken: normalizeAuthToken(value.authToken).slice(0, 4096),
  };
}

async function saveStoredRouteSnapshot(settings: InlineComposerRouteSettings): Promise<void> {
  const stored = await storageGet("sync", [SETTINGS_STORAGE_KEY]);
  const raw = stored[SETTINGS_STORAGE_KEY];
  const current = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  await storageSet("sync", {
    [SETTINGS_STORAGE_KEY]: {
      ...current,
      consoleHost: normalizeHost(settings.consoleHost),
      consolePort: normalizePort(settings.consolePort),
      agentId: normalizeText(settings.agentId, 240),
      chatKey: normalizeText(settings.chatKey, 300),
      inlineMode: settings.inlineMode === "instant" ? "instant" : "channel",
      instantExecutor: settings.instantExecutor === "acp" ? "acp" : "model",
      instantAgentId: normalizeText(settings.instantAgentId, 240),
      instantModelId: normalizeText(settings.instantModelId, 240),
    },
  });
}

async function loadStoredAuthToken(): Promise<string> {
  const [localStored, routeSettings] = await Promise.all([
    storageGet("local", [AUTH_STORAGE_KEY]),
    loadStoredRouteSnapshot(),
  ]);
  const raw = localStored[AUTH_STORAGE_KEY];
  if (raw && typeof raw === "object") {
    return normalizeAuthToken((raw as Record<string, unknown>).token).slice(0, 4096);
  }
  return routeSettings.legacyAuthToken;
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
  const [loaded, authToken] = await Promise.all([
    loadStoredRouteSnapshot(),
    loadStoredAuthToken(),
  ]);
  return {
    consoleHost:
      normalizeText(loaded.consoleHost, 100) || DEFAULT_ROUTE_SETTINGS.consoleHost,
    consolePort:
      typeof loaded.consolePort === "number" && Number.isFinite(loaded.consolePort)
        ? Math.trunc(loaded.consolePort)
        : DEFAULT_ROUTE_SETTINGS.consolePort,
    authToken: normalizeText(authToken, 4096),
    agentId: normalizeText(loaded.agentId, 240),
    chatKey: normalizeText(loaded.chatKey, 300),
    inlineMode: loaded.inlineMode === "instant" ? "instant" : "channel",
    instantExecutor: loaded.instantExecutor === "acp" ? "acp" : "model",
    instantAgentId: normalizeText(loaded.instantAgentId, 240),
    instantModelId: normalizeText(loaded.instantModelId, 240),
  };
}

/**
 * 解析 Inline Composer 当前应使用的最终设置。
 *
 * 关键点（中文）：
 * - `authToken` 必须始终以 `chrome.storage.local` 中的最新值为准。
 * - 允许调用方覆盖 Agent / Chat / mode 等瞬时 UI 选择，但不允许用旧 token 覆盖新 token。
 */
async function resolveEffectiveRouteSettings(
  inputSettings?: Partial<InlineComposerRouteSettings>,
): Promise<InlineComposerRouteSettings> {
  const loaded = await loadRouteSettings();
  const preferred = inputSettings || {};

  return {
    ...DEFAULT_ROUTE_SETTINGS,
    ...loaded,
    ...preferred,
    consoleHost: normalizeText(preferred.consoleHost, 100) || loaded.consoleHost,
    consolePort:
      typeof preferred.consolePort === "number" && Number.isFinite(preferred.consolePort)
        ? Math.trunc(preferred.consolePort)
        : loaded.consolePort,
    agentId: normalizeText(preferred.agentId, 240) || loaded.agentId,
    chatKey: normalizeText(preferred.chatKey, 300) || loaded.chatKey,
    inlineMode:
      preferred.inlineMode === undefined
        ? loaded.inlineMode
        : preferred.inlineMode === "instant"
          ? "instant"
          : "channel",
    instantExecutor:
      preferred.instantExecutor === undefined
        ? loaded.instantExecutor
        : preferred.instantExecutor === "acp"
          ? "acp"
          : "model",
    instantAgentId:
      normalizeText(preferred.instantAgentId, 240) || loaded.instantAgentId,
    instantModelId:
      normalizeText(preferred.instantModelId, 240) || loaded.instantModelId,
    authToken: loaded.authToken,
  };
}

/**
 * 保存 Inline Composer 使用的设置快照。
 */
export async function saveRouteSettings(
  settings: InlineComposerRouteSettings,
): Promise<void> {
  await saveStoredRouteSnapshot(settings);
}

/**
 * Inline Composer 即时模式执行。
 */
export async function runInlineInstant(params: {
  consoleHost: string;
  consolePort: number;
  authToken: string;
  executorType: InlineInstantExecutorType;
  prompt: string;
  system?: string;
  pageContext?: string;
  modelId?: string;
  agentId?: string;
}): Promise<ConsoleInlineInstantResponse> {
  const baseUrl = buildConsoleBaseUrl({
    host: params.consoleHost,
    port: params.consolePort,
  });
  const payload = await requestJson<ConsoleInlineInstantResponse>(
    `${baseUrl}/api/ui/inline/instant-run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        executorType: params.executorType,
        prompt: normalizeText(params.prompt, MAX_PROMPT_CHARS),
        system: normalizeText(params.system, 2000),
        pageContext: String(params.pageContext || "").trim(),
        modelId: normalizeText(params.modelId, 240),
        agentId: normalizeText(params.agentId, 240),
      } satisfies ConsoleInlineInstantRequestBody),
    },
    {
      authToken: params.authToken,
    },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "即时执行失败");
  }
  return payload;
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

async function fetchAgents(
  baseUrl: string,
  authToken: string,
): Promise<ConsoleUiAgentOption[]> {
  const payload = await requestJson<ConsoleUiAgentsResponse>(
    `${baseUrl}/api/ui/agents`,
    { method: "GET" },
    { authToken },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent 列表失败");
  }
  return Array.isArray(payload.agents) ? payload.agents : [];
}

async function fetchModels(
  baseUrl: string,
  authToken: string,
): Promise<ConsoleModelOption[]> {
  const payload = await requestJson<{
    success: boolean;
    models?: ConsoleModelOption[];
    error?: string;
  }>(
    `${baseUrl}/api/ui/model/pool`,
    { method: "GET" },
    { authToken },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载模型列表失败");
  }
  return Array.isArray(payload.models)
    ? payload.models.filter((item) => item && item.isPaused !== true)
    : [];
}

async function fetchContexts(
  baseUrl: string,
  agentId: string,
  authToken: string,
): Promise<TuiContextSummary[]> {
  const payload = await requestJson<TuiContextsResponse>(
    `${baseUrl}/api/dashboard/sessions?agent=${encodeURIComponent(agentId)}&limit=500`,
    { method: "GET" },
    { authToken },
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
export async function resolveChannelRouteInfo(
  inputSettings?: Partial<InlineComposerRouteSettings>,
): Promise<ChannelRouteInfo> {
  const settings = await resolveEffectiveRouteSettings(inputSettings);
  const baseUrl = buildConsoleBaseUrl({
    host: settings.consoleHost,
    port: settings.consolePort,
  });

  const agents = await fetchAgents(baseUrl, settings.authToken);
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

  const contexts = await fetchContexts(baseUrl, targetAgent.id, settings.authToken);
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
 * 解析即时模式当前可用执行目标。
 */
export async function resolveInstantRouteInfo(
  inputSettings?: Partial<InlineComposerRouteSettings>,
): Promise<InstantRouteInfo> {
  const settings = await resolveEffectiveRouteSettings(inputSettings);
  const baseUrl = buildConsoleBaseUrl({
    host: settings.consoleHost,
    port: settings.consolePort,
  });

  const [agents, models] = await Promise.all([
    fetchAgents(baseUrl, settings.authToken),
    fetchModels(baseUrl, settings.authToken),
  ]);
  const acpAgents = agents.filter((item) => item.executionMode === "acp");
  const targetExecutor: InlineInstantExecutorType =
    settings.instantExecutor === "acp" ? "acp" : "model";
  const targetAgentId =
    acpAgents.some((item) => item.id === settings.instantAgentId)
      ? settings.instantAgentId
      : acpAgents[0]?.id || "";
  const targetModelId =
    models.some((item) => item.id === settings.instantModelId)
      ? settings.instantModelId
      : models[0]?.id || "";

  return {
    settings,
    baseUrl,
    agents: acpAgents,
    models,
    targetExecutor,
    targetAgentId,
    targetModelId,
  };
}

/**
 * 发送页面上下文到 Agent。
 */
export async function sendPageContextToAgent(
  params: SendPageContextParams,
  routeSettings: InlineComposerRouteSettings,
): Promise<SendToAgentResult> {
  const { targetAgent, targetChatKey, baseUrl } = await resolveChannelRouteInfo(routeSettings);
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

  const response = await requestViaBackground({
    url: executeUrl,
    method: "POST",
    headers: toHeaderRecord(
      buildAuthHeaders({
        authToken: routeSettings.authToken,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    ),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const raw = response.text;
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
