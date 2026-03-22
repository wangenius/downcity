/**
 * Downcity API 访问层。
 *
 * 关键点（中文）：
 * - 所有 HTTP 交互统一从这里走，UI 只关注业务流程。
 * - 默认走本地 Console，也支持外部传入自定义 IP/端口地址。
 */

import type {
  ChatKeyOption,
  ConsoleUiAgentsResponse,
  TuiContextExecuteRequestBody,
  TuiContextSummary,
  TuiContextsResponse,
} from "../types/api";

/**
 * Console UI 默认地址。
 */
export const DEFAULT_CONSOLE_BASE_URL = "http://127.0.0.1:5315";

type ApiRequestOptions = {
  consoleBaseUrl?: string;
};

/**
 * 归一化 Console 地址。
 */
function normalizeConsoleBaseUrl(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

/**
 * 构建 Console 地址。
 */
export function buildConsoleBaseUrl(params: {
  host: string;
  port: number;
}): string {
  const host = String(params.host || "").trim() || "127.0.0.1";
  const rawPort =
    typeof params.port === "number"
      ? params.port
      : Number.parseInt(String(params.port || "").trim(), 10);
  if (!Number.isFinite(rawPort) || Number.isNaN(rawPort)) {
    throw new Error("端口无效");
  }
  const port = Math.trunc(rawPort);
  if (port < 1 || port > 65535) {
    throw new Error("端口范围应为 1-65535");
  }
  return normalizeConsoleBaseUrl(`http://${host}:${port}`);
}

function getConsoleBaseUrl(input?: string): string {
  const normalized = normalizeConsoleBaseUrl(
    String(input || "").trim() || DEFAULT_CONSOLE_BASE_URL,
  );
  if (!normalized) {
    throw new Error("Console 地址配置无效");
  }
  return normalized;
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
    throw new Error(
      errorHint || `请求失败：HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!json || typeof json !== "object") {
    throw new Error("服务返回的不是合法 JSON");
  }

  return json as T;
}

type ParsedChatKey =
  | {
      channel: "telegram";
      chatId: string;
      threadId?: string | number;
    }
  | {
      channel: "feishu";
      chatId: string;
    }
  | {
      channel: "qq";
      chatId: string;
      chatType?: string;
    };

/**
 * 解析 chatKey（与 runtime 规则保持一致）。
 */
function parseChatKey(value: string): ParsedChatKey | null {
  const key = String(value || "").trim();
  if (!key) return null;

  const telegramTopicMatch = key.match(/^telegram-chat-(\S+)-topic-(\d+)$/i);
  if (telegramTopicMatch) {
    return {
      channel: "telegram",
      chatId: String(telegramTopicMatch[1] || "").trim(),
      threadId: String(telegramTopicMatch[2] || "").trim(),
    };
  }

  const telegramMatch = key.match(/^telegram-chat-(\S+)$/i);
  if (telegramMatch) {
    return {
      channel: "telegram",
      chatId: String(telegramMatch[1] || "").trim(),
    };
  }

  const feishuMatch = key.match(/^feishu-chat-(.+)$/i);
  if (feishuMatch) {
    return {
      channel: "feishu",
      chatId: String(feishuMatch[1] || "").trim(),
    };
  }

  const qqMatch = key.match(/^qq-([a-z0-9_]+)-(.+)$/i);
  if (qqMatch) {
    return {
      channel: "qq",
      chatType: String(qqMatch[1] || "").trim(),
      chatId: String(qqMatch[2] || "").trim(),
    };
  }

  return null;
}

function toDateText(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "未知时间";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function resolveChatDisplayName(summary: TuiContextSummary, parsed: ParsedChatKey): string {
  const chatTitle = String(summary.chatTitle || "").trim();
  const chatId = String(summary.chatId || "").trim();

  // 关键点（中文）：与 console-ui 一致，避免把 openid / chatId 本身误显示成可读名称。
  if (chatTitle && (!chatId || chatTitle !== chatId)) {
    return chatTitle;
  }

  if (chatId) return chatId;

  if (parsed.channel === "telegram") {
    if (parsed.threadId) {
      return `Topic ${parsed.threadId}`;
    }
    return parsed.chatId;
  }

  if (parsed.channel === "feishu") {
    return parsed.chatId;
  }

  return parsed.chatId;
}

function formatPlatformName(channel: ChatKeyOption["channel"]): string {
  if (channel === "telegram") return "Telegram";
  if (channel === "feishu") return "Feishu";
  return "QQ";
}

function parseContextSummary(summary: TuiContextSummary): ParsedChatKey | null {
  const channel = String(summary.channel || "")
    .trim()
    .toLowerCase();
  const chatId = String(summary.chatId || "").trim();
  if (channel === "telegram" && chatId) {
    return {
      channel: "telegram",
      chatId,
      ...(typeof summary.threadId === "number"
        ? { threadId: summary.threadId }
        : {}),
    };
  }
  if (channel === "feishu" && chatId) {
    return {
      channel: "feishu",
      chatId,
    };
  }
  if (channel === "qq" && chatId) {
    const chatType = String(summary.chatType || "").trim();
    return {
      channel: "qq",
      chatId,
      ...(chatType ? { chatType } : {}),
    };
  }
  // 关键点（中文）：extension 侧不再回退解析 legacy contextId。
  // 只认服务端明确给出的 chat meta，避免已删除/残留目录被误识别成可发会话。
  return null;
}

function toChatKeyOption(summary: TuiContextSummary): ChatKeyOption | null {
  const chatKey = String(summary.contextId || "").trim();
  const parsed = parseContextSummary(summary);
  if (!parsed) return null;

  const messageCount = Number.isFinite(summary.messageCount)
    ? Number(summary.messageCount)
    : 0;
  const lastText = String(summary.lastText || "").trim();
  const displayName = resolveChatDisplayName(summary, parsed);

  return {
    chatKey,
    channel: parsed.channel,
    title: `${displayName} · ${formatPlatformName(parsed.channel)}`,
    subtitle: [
      `消息 ${messageCount}`,
      `更新 ${toDateText(summary.updatedAt)}`,
      lastText ? `最近：${lastText}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    messageCount,
    ...(typeof summary.updatedAt === "number" ? { updatedAt: summary.updatedAt } : {}),
  };
}

/**
 * 拉取 Console 可用 Agent 列表。
 */
export async function fetchAgents(
  options?: ApiRequestOptions,
): Promise<ConsoleUiAgentsResponse> {
  const url = `${getConsoleBaseUrl(options?.consoleBaseUrl)}/api/ui/agents`;
  const payload = await requestJson<ConsoleUiAgentsResponse>(url, {
    method: "GET",
  });
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent 列表失败");
  }
  return payload;
}

/**
 * 拉取指定 Agent 可用的 chatKey 列表。
 */
export async function fetchChatKeyOptions(
  agentId: string,
  options?: ApiRequestOptions,
): Promise<ChatKeyOption[]> {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return [];

  const url = `${getConsoleBaseUrl(options?.consoleBaseUrl)}/api/tui/contexts?agent=${encodeURIComponent(normalizedAgentId)}&limit=500`;
  const payload = await requestJson<TuiContextsResponse>(url, {
    method: "GET",
  });

  if (payload.success !== true) {
    throw new Error(payload.error || "加载 chatKey 列表失败");
  }

  const contexts = Array.isArray(payload.contexts) ? payload.contexts : [];
  const seen = new Set<string>();
  const outOptions: ChatKeyOption[] = [];

  for (const item of contexts) {
    const option = toChatKeyOption(item);
    if (!option) continue;
    if (seen.has(option.chatKey)) continue;
    seen.add(option.chatKey);
    outOptions.push(option);
  }

  return outOptions.sort((a, b) => {
    const tsA = typeof a.updatedAt === "number" ? a.updatedAt : 0;
    const tsB = typeof b.updatedAt === "number" ? b.updatedAt : 0;
    if (tsA !== tsB) return tsB - tsA;
    return b.messageCount - a.messageCount;
  });
}

/**
 * 投递 Agent 任务（异步，不等待执行完成）。
 *
 * 关键点（中文）：
 * - 优先使用 sendBeacon，支持 popup 关闭后的请求续传。
 * - sendBeacon 不可用时，回退到 keepalive fetch。
 * - 只确认“请求已发起”，不等待后端执行结束。
 */
export function dispatchAgentTask(params: {
  consoleBaseUrl?: string;
  agentId: string;
  contextId: string;
  body: TuiContextExecuteRequestBody;
}): boolean {
  const agentId = String(params.agentId || "").trim();
  const contextId = String(params.contextId || "").trim();
  if (!agentId) return false;
  if (!contextId) return false;

  const url = `${getConsoleBaseUrl(params.consoleBaseUrl)}/api/tui/contexts/${encodeURIComponent(contextId)}/execute?agent=${encodeURIComponent(agentId)}`;
  const bodyText = JSON.stringify(params.body);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const queued = navigator.sendBeacon(
        url,
        new Blob([bodyText], { type: "text/plain;charset=UTF-8" }),
      );
      if (queued) return true;
    }

    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyText,
      keepalive: true,
    }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}
