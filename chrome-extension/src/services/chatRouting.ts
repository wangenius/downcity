/**
 * 扩展 chat 路由与会话选择工具。
 *
 * 关键点（中文）：
 * - 统一处理 Agent 选择、已连接渠道过滤、默认 chatKey 选择。
 * - popup / options / API 列表转换都复用同一套规则。
 */

import type {
  ChatKeyOption,
  ConsoleUiAgentOption,
  TuiContextSummary,
} from "../types/api";

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

function toDateText(timestamp?: number): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "未知时间";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", { hour12: false });
}

/**
 * 解析 chatKey（与 runtime 规则保持一致）。
 */
export function parseChatKey(value: string): ParsedChatKey | null {
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

function resolveChatDisplayName(summary: TuiContextSummary, parsed: ParsedChatKey): string {
  const chatTitle = String(summary.chatTitle || "").trim();
  const chatId = String(summary.chatId || "").trim();

  // 关键点（中文）：优先展示明确的 chatTitle，避免把 chatId/openid 当成人类可读名称。
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
  return null;
}

/**
 * 将 context 摘要转换成 chat 选项。
 */
export function toChatKeyOption(summary: TuiContextSummary): ChatKeyOption | null {
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
 * 解析当前 Agent 已连接的聊天渠道。
 */
export function resolveLinkedChannels(
  agent: ConsoleUiAgentOption | null | undefined,
): Set<"telegram" | "feishu" | "qq"> {
  const out = new Set<"telegram" | "feishu" | "qq">();
  const profiles = Array.isArray(agent?.chatProfiles) ? agent.chatProfiles : [];
  for (const profile of profiles) {
    const channel = String(profile?.channel || "").trim().toLowerCase();
    const linkState = String(profile?.linkState || "").trim().toLowerCase();
    if (linkState !== "connected") continue;
    if (channel === "telegram" || channel === "feishu" || channel === "qq") {
      out.add(channel);
    }
  }
  return out;
}

/**
 * 从候选 Agent 中选择最终目标。
 */
export function resolveAgentId(params: {
  /**
   * 当前 Agent 列表。
   */
  agents: ConsoleUiAgentOption[];
  /**
   * 用户偏好的 Agent id。
   */
  preferredAgentId: string;
  /**
   * 后端返回的默认 Agent id。
   */
  selectedAgentId: string;
}): string {
  const preferred = String(params.preferredAgentId || "").trim();
  if (preferred) {
    const preferredRunning = params.agents.find(
      (item) => item.id === preferred && item.running,
    );
    if (preferredRunning) return preferredRunning.id;
  }

  const candidateList = [
    params.selectedAgentId,
    ...(params.agents.filter((item) => item.running).map((item) => item.id)),
    params.preferredAgentId,
    ...(params.agents.map((item) => item.id)),
  ];

  for (const id of candidateList) {
    const normalized = String(id || "").trim();
    if (!normalized) continue;
    if (params.agents.some((item) => item.id === normalized)) {
      return normalized;
    }
  }

  return "";
}

/**
 * 选择最终 chatKey。
 */
export function resolveChatKey(
  options: ChatKeyOption[],
  preferredChatKey: string,
): string {
  const preferred = String(preferredChatKey || "").trim();
  if (preferred && options.some((item) => item.chatKey === preferred)) {
    return preferred;
  }
  if (options.length === 1) {
    return options[0]?.chatKey || "";
  }
  return "";
}
