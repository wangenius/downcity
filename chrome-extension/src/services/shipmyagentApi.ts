/**
 * ShipMyAgent API 访问层。
 *
 * 关键点（中文）：
 * - 所有 HTTP 交互统一从这里走，UI 只关注业务流程。
 * - Console 地址固定为本地默认端口，避免用户重复填写。
 */

import type {
  ChatKeyOption,
  ConsoleUiAgentsResponse,
  GenericApiResponse,
  TuiContextExecuteRequestBody,
  TuiContextSummary,
  TuiContextsResponse,
} from "../types/api";

/**
 * Console UI 默认地址。
 */
export const DEFAULT_CONSOLE_BASE_URL = "http://127.0.0.1:5315";

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

function getConsoleBaseUrl(): string {
  const normalized = normalizeConsoleBaseUrl(DEFAULT_CONSOLE_BASE_URL);
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
      threadId?: string;
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

function toChatKeyTitle(parsed: ParsedChatKey): string {
  if (parsed.channel === "telegram") {
    if (parsed.threadId) {
      return `Telegram · ${parsed.chatId} · Topic ${parsed.threadId}`;
    }
    return `Telegram · ${parsed.chatId}`;
  }

  if (parsed.channel === "feishu") {
    return `Feishu · ${parsed.chatId}`;
  }

  return parsed.chatType
    ? `QQ · ${parsed.chatType} · ${parsed.chatId}`
    : `QQ · ${parsed.chatId}`;
}

function toChatKeyOption(summary: TuiContextSummary): ChatKeyOption | null {
  const chatKey = String(summary.contextId || "").trim();
  const parsed = parseChatKey(chatKey);
  if (!parsed) return null;

  const messageCount = Number.isFinite(summary.messageCount)
    ? Number(summary.messageCount)
    : 0;
  const lastText = String(summary.lastText || "").trim();

  return {
    chatKey,
    channel: parsed.channel,
    title: toChatKeyTitle(parsed),
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
export async function fetchAgents(): Promise<ConsoleUiAgentsResponse> {
  const url = `${getConsoleBaseUrl()}/api/ui/agents`;
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
export async function fetchChatKeyOptions(agentId: string): Promise<ChatKeyOption[]> {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return [];

  const url = `${getConsoleBaseUrl()}/api/tui/contexts?agent=${encodeURIComponent(normalizedAgentId)}&limit=500`;
  const payload = await requestJson<TuiContextsResponse>(url, {
    method: "GET",
  });

  if (payload.success !== true) {
    throw new Error(payload.error || "加载 chatKey 列表失败");
  }

  const contexts = Array.isArray(payload.contexts) ? payload.contexts : [];
  const seen = new Set<string>();
  const options: ChatKeyOption[] = [];

  for (const item of contexts) {
    const option = toChatKeyOption(item);
    if (!option) continue;
    if (seen.has(option.chatKey)) continue;
    seen.add(option.chatKey);
    options.push(option);
  }

  return options.sort((a, b) => {
    const tsA = typeof a.updatedAt === "number" ? a.updatedAt : 0;
    const tsB = typeof b.updatedAt === "number" ? b.updatedAt : 0;
    if (tsA !== tsB) return tsB - tsA;
    return b.messageCount - a.messageCount;
  });
}

/**
 * 投递 Agent 任务。
 *
 * 关键点（中文）：
 * - 这里显式等待 HTTP 返回，确保大附件（例如页面 Markdown）可靠送达。
 * - 服务端返回 `success=false` 时抛错，便于 UI 给出明确失败提示。
 */
export async function dispatchAgentTask(params: {
  agentId: string;
  contextId: string;
  body: TuiContextExecuteRequestBody;
}): Promise<void> {
  const agentId = String(params.agentId || "").trim();
  const contextId = String(params.contextId || "").trim();
  if (!agentId) throw new Error("Missing agentId");
  if (!contextId) throw new Error("Missing contextId");

  const url = `${getConsoleBaseUrl()}/api/tui/contexts/${encodeURIComponent(contextId)}/execute?agent=${encodeURIComponent(agentId)}`;
  const payload = await requestJson<GenericApiResponse>(url, {
    method: "POST",
    body: JSON.stringify(params.body),
  });
  if (payload?.success === false) {
    throw new Error(String(payload.error || payload.message || "任务投递失败"));
  }
}
