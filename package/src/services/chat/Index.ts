/**
 * Chat service。
 *
 * 关键点（中文）
 * - 使用统一 actions 模型声明 CLI/API/执行逻辑
 * - API 默认路由为 `/service/chat/<action>`
 * - 业务逻辑下沉到 `services/chat/Action.ts`
 */

import path from "node:path";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  resolveChatContextSnapshot,
  resolveChatKey,
  sendChatActionByChatKey,
  sendChatTextByChatKey,
} from "./Action.js";
import { readChatHistory } from "./runtime/ChatHistoryStore.js";
import { resolveChatMethod, type ChatMethod } from "./runtime/ChatMethod.js";
import { createTelegramBot } from "./channels/telegram/Bot.js";
import { createFeishuBot } from "./channels/feishu/Feishu.js";
import { createQQBot } from "./channels/qq/QQ.js";
import type {
  Service,
  ServiceActionCommandInput,
} from "@agent/service/ServiceManager.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { ChatHistoryEventV1 } from "./types/ChatHistory.js";
import type { ChatHistoryRequest, ChatReactRequest } from "./types/ChatCommand.js";
import type { TelegramBot } from "./channels/telegram/Bot.js";
import type { FeishuBot } from "./channels/feishu/Feishu.js";
import type { QQBot } from "./channels/qq/QQ.js";

type ChatChannelState = {
  telegram: TelegramBot | null;
  feishu: FeishuBot | null;
  qq: QQBot | null;
};

type ChatSendActionPayload = {
  text: string;
  chatKey?: string;
  delayMs?: number;
  sendAtMs?: number;
  replyToMessage?: boolean;
};

type ChatContextActionPayload = {
  chatKey?: string;
  contextId?: string;
};

type ChatHistoryActionPayload = ChatHistoryRequest;
type ChatReactActionPayload = ChatReactRequest;

const CHAT_PROMPT_FILE_URL = new URL("./PROMPT.txt", import.meta.url);
const CHAT_DIRECT_PROMPT_FILE_URL = new URL("./PROMPT.direct.txt", import.meta.url);
const TELEGRAM_PROMPT_FILE_URL = new URL(
  "./channels/telegram/PROMPT.txt",
  import.meta.url,
);
const TELEGRAM_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/telegram/PROMPT.direct.txt",
  import.meta.url,
);
const FEISHU_PROMPT_FILE_URL = new URL(
  "./channels/feishu/PROMPT.txt",
  import.meta.url,
);
const FEISHU_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/feishu/PROMPT.direct.txt",
  import.meta.url,
);
const QQ_PROMPT_FILE_URL = new URL("./channels/qq/PROMPT.txt", import.meta.url);
const QQ_DIRECT_PROMPT_FILE_URL = new URL(
  "./channels/qq/PROMPT.direct.txt",
  import.meta.url,
);

/**
 * 加载 chat service 使用说明提示词。
 *
 * 关键点（中文）
 * - 启动阶段即加载，缺失时直接抛错，避免静默失效。
 */
function loadChatServicePrompt(fileUrl: URL): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load chat service prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_SERVICE_PROMPTS: Record<ChatMethod, string> = {
  cmd: loadChatServicePrompt(CHAT_PROMPT_FILE_URL),
  direct: loadChatServicePrompt(CHAT_DIRECT_PROMPT_FILE_URL),
};

/**
 * 加载单个 channel 提示词。
 *
 * 关键点（中文）
 * - channel 提示词属于强依赖资产，缺失时直接抛错，避免运行时悄悄丢失规则。
 */
function loadChatChannelPrompt(fileUrl: URL, channelName: string): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load ${channelName} chat channel prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_CHANNEL_PROMPTS: Record<
  "telegram" | "feishu" | "qq",
  Record<ChatMethod, string>
> = {
  telegram: {
    cmd: loadChatChannelPrompt(TELEGRAM_PROMPT_FILE_URL, "telegram"),
    direct: loadChatChannelPrompt(
      TELEGRAM_DIRECT_PROMPT_FILE_URL,
      "telegram-direct",
    ),
  },
  feishu: {
    cmd: loadChatChannelPrompt(FEISHU_PROMPT_FILE_URL, "feishu"),
    direct: loadChatChannelPrompt(FEISHU_DIRECT_PROMPT_FILE_URL, "feishu-direct"),
  },
  qq: {
    cmd: loadChatChannelPrompt(QQ_PROMPT_FILE_URL, "qq"),
    direct: loadChatChannelPrompt(QQ_DIRECT_PROMPT_FILE_URL, "qq-direct"),
  },
};

/**
 * 构建当前启用 channel 的提示词片段。
 *
 * 关键点（中文）
 * - 仅注入已启用 channel，避免给模型引入未接入平台的噪音规则。
 */
function buildEnabledChannelPrompts(
  context: ServiceRuntime,
  method: ChatMethod,
): string[] {
  const prompts: string[] = [];
  const channels = context.config.services?.chat?.channels || {};
  if (channels.telegram?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.telegram[method]);
  }
  if (channels.feishu?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.feishu[method]);
  }
  if (channels.qq?.enabled) {
    prompts.push(CHAT_CHANNEL_PROMPTS.qq[method]);
  }
  return prompts;
}

let channelState: ChatChannelState = {
  telegram: null,
  feishu: null,
  qq: null,
};

function resetChannelState(): void {
  channelState = {
    telegram: null,
    feishu: null,
    qq: null,
  };
}

// 占位符判定（中文）：init 生成的模板值 `${...}` 不应被当作真实密钥。
function isPlaceholder(value?: string): boolean {
  return value === "${}";
}

async function startChatChannels(context: ServiceRuntime): Promise<void> {
  if (channelState.telegram || channelState.feishu || channelState.qq) {
    await stopChatChannels();
  }
  const channels = context.config.services?.chat?.channels || {};

  if (channels.telegram?.enabled) {
    context.logger.info("Telegram channel enabled");
    channelState.telegram = createTelegramBot(channels.telegram, context);
    if (channelState.telegram) {
      await channelState.telegram.start();
    }
  }

  if (channels.feishu?.enabled) {
    context.logger.info("Feishu channel enabled");
    const feishuChannel = channels.feishu as typeof channels.feishu & {
      adminUserIds?: string[];
    };
    const feishuConfig = {
      enabled: true,
      appId:
        (channels.feishu?.appId && !isPlaceholder(channels.feishu.appId)
          ? channels.feishu.appId
          : undefined) ||
        process.env.FEISHU_APP_ID ||
        "",
      appSecret:
        (channels.feishu?.appSecret && !isPlaceholder(channels.feishu.appSecret)
          ? channels.feishu.appSecret
          : undefined) ||
        process.env.FEISHU_APP_SECRET ||
        "",
      domain: feishuChannel?.domain || "https://open.feishu.cn",
      adminUserIds: Array.isArray(feishuChannel?.adminUserIds)
        ? feishuChannel.adminUserIds
        : undefined,
    };
    channelState.feishu = await createFeishuBot(feishuConfig, context);
    if (channelState.feishu) {
      await channelState.feishu.start();
    }
  }

  if (channels.qq?.enabled) {
    context.logger.info("QQ channel enabled");
    const envQqGroupAccess = (process.env.QQ_GROUP_ACCESS || "")
      .trim()
      .toLowerCase();
    const qqGroupAccess: "initiator_or_admin" | "anyone" | undefined =
      channels.qq?.groupAccess === "anyone"
        ? "anyone"
        : channels.qq?.groupAccess === "initiator_or_admin"
          ? "initiator_or_admin"
          : envQqGroupAccess === "initiator_or_admin"
            ? "initiator_or_admin"
            : "anyone";
    const qqConfig = {
      enabled: true,
      appId:
        (channels.qq?.appId && !isPlaceholder(channels.qq.appId)
          ? channels.qq.appId
          : undefined) ||
        process.env.QQ_APP_ID ||
        "",
      appSecret:
        (channels.qq?.appSecret && !isPlaceholder(channels.qq.appSecret)
          ? channels.qq.appSecret
          : undefined) ||
        process.env.QQ_APP_SECRET ||
        "",
      sandbox:
        typeof channels.qq?.sandbox === "boolean"
          ? channels.qq.sandbox
          : (process.env.QQ_SANDBOX || "").toLowerCase() === "true",
      groupAccess: qqGroupAccess,
    };
    channelState.qq = await createQQBot(qqConfig, context);
    if (channelState.qq) {
      await channelState.qq.start();
    }
  }
}

async function stopChatChannels(): Promise<void> {
  const current = channelState;
  resetChannelState();

  if (current.telegram) {
    await current.telegram.stop();
  }
  if (current.feishu) {
    await current.feishu.stop();
  }
  if (current.qq) {
    await current.qq.stop();
  }
}

function getStringOpt(opts: Record<string, JsonValue>, key: string): string {
  return typeof opts[key] === "string" ? String(opts[key]).trim() : "";
}

function getBooleanOpt(opts: Record<string, JsonValue>, key: string): boolean {
  return opts[key] === true;
}

function parsePositiveIntOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

function parseNonNegativeIntOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

function looksLikeIsoDatetimeWithoutTimezone(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
  if (!isoLike) return false;
  return !/(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
}

/**
 * 解析定时发送时间。
 *
 * 支持格式（中文）
 * - Unix 时间戳：秒或毫秒（纯数字）
 * - ISO 时间字符串：例如 `2026-03-05T20:30:00+08:00`
 */
function parseSendTimeOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }
    // 关键点（中文）：10 位通常是秒级时间戳，统一转换为毫秒。
    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  }
  if (looksLikeIsoDatetimeWithoutTimezone(text)) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. ISO datetime must include timezone offset (e.g. +08:00 or Z).`,
    );
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. Use Unix timestamp (seconds/ms) or ISO datetime.`,
    );
  }
  return parsed;
}

function parseOptionalTimestampOrThrow(
  value: string,
  fieldName: string,
): number | undefined {
  const text = String(value || "").trim();
  if (!text) return undefined;
  return parsePositiveIntOptionOrThrow(text, fieldName);
}

function readHistoryDirectionOrThrow(
  value: string,
): "all" | "inbound" | "outbound" | undefined {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return undefined;
  if (text === "all" || text === "inbound" || text === "outbound") {
    return text;
  }
  throw new Error(`Invalid direction: ${value}. Use all|inbound|outbound.`);
}

function mapChatHistoryCommandInput(
  input: ServiceActionCommandInput,
): ChatHistoryActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const contextId = getStringOpt(input.opts, "contextId");
  const direction = readHistoryDirectionOrThrow(
    getStringOpt(input.opts, "direction"),
  );
  const limitRaw = getStringOpt(input.opts, "limit");
  const beforeTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "beforeTs"),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "afterTs"),
    "afterTs",
  );
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;

  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  return {
    ...(chatKey ? { chatKey } : {}),
    ...(contextId ? { contextId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

function mapChatHistoryApiInput(query: {
  chatKey?: string;
  contextId?: string;
  limit?: string;
  direction?: string;
  beforeTs?: string;
  afterTs?: string;
}): ChatHistoryActionPayload {
  const direction = readHistoryDirectionOrThrow(String(query.direction || ""));
  const limitText = String(query.limit || "").trim();
  const limit = limitText
    ? parsePositiveIntOptionOrThrow(limitText, "limit")
    : undefined;
  const beforeTs = parseOptionalTimestampOrThrow(
    String(query.beforeTs || ""),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    String(query.afterTs || ""),
    "afterTs",
  );
  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  const chatKey = String(query.chatKey || "").trim();
  const contextId = String(query.contextId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(contextId ? { contextId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

function toChatHistoryView(events: ChatHistoryEventV1[]): JsonObject[] {
  return events.map((event) => ({
    ...event,
    isoTime: new Date(event.ts).toISOString(),
  })) as JsonObject[];
}

/**
 * 解析 `chat send` 的命令输入。
 *
 * 关键点（中文）
 * - `--text / --stdin / --text-file` 三选一
 * - 文本读取失败直接抛错，由上层统一输出
 */
async function mapChatSendCommandInput(
  input: ServiceActionCommandInput,
): Promise<ChatSendActionPayload> {
  const explicitText = getStringOpt(input.opts, "text");
  const useStdin = getBooleanOpt(input.opts, "stdin");
  const textFile = getStringOpt(input.opts, "textFile");
  const inputSourcesCount =
    (explicitText ? 1 : 0) + (useStdin ? 1 : 0) + (textFile ? 1 : 0);

  if (inputSourcesCount !== 1) {
    throw new Error(
      "Exactly one text source is required: use one of --text, --stdin, or --text-file.",
    );
  }

  let text = explicitText;
  if (useStdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else if (textFile) {
    const filePath = path.resolve(process.cwd(), textFile);
    text = await fs.readFile(filePath, "utf8");
  }

  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  const delayRaw = getStringOpt(input.opts, "delay");
  const timeRaw = getStringOpt(input.opts, "time");
  const replyToMessage = getBooleanOpt(input.opts, "reply");
  const delayMs = delayRaw
    ? parseNonNegativeIntOptionOrThrow(delayRaw, "delay")
    : undefined;
  const sendAtMs = timeRaw ? parseSendTimeOptionOrThrow(timeRaw, "time") : undefined;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`--delay` and `--time` cannot be used together.");
  }
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure SMA_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  return {
    text,
    chatKey,
    ...(typeof delayMs === "number" ? { delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { sendAtMs } : {}),
    ...(replyToMessage ? { replyToMessage: true } : {}),
  };
}

function mapChatSendApiInput(body: JsonValue): ChatSendActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  const delayRaw = payload.delayMs ?? payload.delay;
  const timeRaw = payload.sendAtMs ?? payload.sendAt ?? payload.time;
  const replyRaw = payload.replyToMessage ?? payload.reply;
  const delayText =
    typeof delayRaw === "string" || typeof delayRaw === "number"
      ? String(delayRaw).trim()
      : "";
  const timeText =
    typeof timeRaw === "string" || typeof timeRaw === "number"
      ? String(timeRaw).trim()
      : "";
  const delayMs = delayText
    ? parseNonNegativeIntOptionOrThrow(delayText, "delayMs")
    : undefined;
  const sendAtMs = timeText
    ? parseSendTimeOptionOrThrow(timeText, "sendAtMs")
    : undefined;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`delayMs` and `sendAtMs` cannot be used together.");
  }
  return {
    text: String(payload.text ?? ""),
    chatKey:
      typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined,
    ...(typeof delayMs === "number" ? { delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { sendAtMs } : {}),
    ...(replyRaw === true ? { replyToMessage: true } : {}),
  };
}

async function executeChatSendAction(params: {
  context: ServiceRuntime;
  payload: ChatSendActionPayload;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const result = await sendChatTextByChatKey({
    context: params.context,
    chatKey,
    text: String(params.payload.text || ""),
    delayMs: params.payload.delayMs,
    sendAtMs: params.payload.sendAtMs,
    replyToMessage: params.payload.replyToMessage === true,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat send failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
    },
  };
}

function mapChatReactCommandInput(
  input: ServiceActionCommandInput,
): ChatReactActionPayload {
  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure SMA_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  const emoji = getStringOpt(input.opts, "emoji");
  const messageId = getStringOpt(input.opts, "messageId");
  const big = getBooleanOpt(input.opts, "big");
  return {
    chatKey,
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

function mapChatReactApiInput(body: JsonValue): ChatReactActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  const chatKey =
    typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined;
  const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : undefined;
  const messageId =
    typeof payload.messageId === "string" || typeof payload.messageId === "number"
      ? String(payload.messageId).trim()
      : undefined;
  const big = payload.big === true;
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

async function executeChatReactAction(params: {
  context: ServiceRuntime;
  payload: ChatReactActionPayload;
}) {
  const chatKey = resolveChatKey({
    chatKey: params.payload.chatKey,
    context: params.context,
  });
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const messageId = String(params.payload.messageId || "").trim() || undefined;
  const result = await sendChatActionByChatKey({
    context: params.context,
    chatKey,
    action: "react",
    messageId,
    reactionEmoji: params.payload.emoji,
    reactionIsBig: params.payload.big === true,
  });
  if (!result.success) {
    return {
      success: false,
      error: result.error || "chat react failed",
    };
  }
  return {
    success: true,
    data: {
      chatKey: result.chatKey || chatKey,
      ...(messageId ? { messageId } : {}),
      ...(typeof params.payload.emoji === "string" && params.payload.emoji.trim()
        ? { emoji: params.payload.emoji.trim() }
        : {}),
      ...(params.payload.big === true ? { big: true } : {}),
    },
  };
}

export const chatService: Service = {
  name: "chat",
  system: (context) => {
    const method = resolveChatMethod(context.config);
    return [CHAT_SERVICE_PROMPTS[method], ...buildEnabledChannelPrompts(context, method)]
      .filter(Boolean)
      .join("\n\n");
  },
  actions: {
    send: {
      command: {
        description: "发送消息到目标 chatKey",
        configure(command: Command) {
          command
            .option("--text <text>", "消息正文")
            .option("--stdin", "从标准输入读取消息正文", false)
            .option("--text-file <file>", "从文件读取消息正文（相对当前目录）")
            .option("--delay <ms>", "延迟发送毫秒数（非负整数）")
            .option(
              "--time <time>",
              "定时发送时间（Unix 时间戳秒/毫秒或 ISO 时间）",
            )
            .option("--reply", "显式使用 reply_to_message 回复目标消息", false)
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 SMA_CTX_CHAT_KEY）",
            );
        },
        mapInput: mapChatSendCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatSendApiInput(await c.req.json());
        },
      },
      async execute(params) {
        return executeChatSendAction({
          context: params.context,
          payload: params.payload as ChatSendActionPayload,
        });
      },
    },
    react: {
      command: {
        description: "给目标消息贴表情（当前仅 Telegram 支持）",
        configure(command: Command) {
          command
            .option("--emoji <emoji>", "表情字符（默认 👍）")
            .option("--big", "使用大表情效果（Telegram is_big）", false)
            .option("--message-id <id>", "目标消息 ID（默认尝试从 chat meta 回填）")
            .option(
              "--chat-key <chatKey>",
              "目标 chatKey（不传则尝试读取 SMA_CTX_CHAT_KEY）",
            );
        },
        mapInput: mapChatReactCommandInput,
      },
      api: {
        method: "POST",
        async mapInput(c) {
          return mapChatReactApiInput(await c.req.json());
        },
      },
      async execute(params) {
        return executeChatReactAction({
          context: params.context,
          payload: params.payload as ChatReactActionPayload,
        });
      },
    },
    context: {
      command: {
        description: "查看当前会话上下文快照",
        configure(command: Command) {
          command.option("--chat-key <chatKey>", "显式覆盖 chatKey");
        },
        mapInput(input) {
          const chatKey = getStringOpt(input.opts, "chatKey");
          return {
            ...(chatKey ? { chatKey } : {}),
          };
        },
      },
      api: {
        method: "GET",
        mapInput(c) {
          const chatKey = String(c.req.query("chatKey") || "").trim();
          const contextId = String(c.req.query("contextId") || "").trim();
          return {
            ...(chatKey ? { chatKey } : {}),
            ...(contextId ? { contextId } : {}),
          };
        },
      },
      async execute(params) {
        const payload = params.payload as ChatContextActionPayload;
        const snapshot = resolveChatContextSnapshot({
          context: params.context,
          ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
          ...(payload.contextId ? { contextId: payload.contextId } : {}),
        });
        return {
          success: true,
          data: {
            context: snapshot,
          },
        };
      },
    },
    history: {
      command: {
        description: "读取 chat 历史消息（默认最近 30 条）",
        configure(command: Command) {
          command
            .option("--chat-key <chatKey>", "显式覆盖 chatKey")
            .option("--context-id <contextId>", "显式覆盖 contextId")
            .option("--limit <n>", "返回最近 N 条（默认 30）")
            .option(
              "--direction <direction>",
              "方向过滤（all|inbound|outbound）",
            )
            .option("--before-ts <ts>", "仅返回 ts 小于该值的记录（毫秒）")
            .option("--after-ts <ts>", "仅返回 ts 大于该值的记录（毫秒）");
        },
        mapInput: mapChatHistoryCommandInput,
      },
      api: {
        method: "GET",
        mapInput(c) {
          return mapChatHistoryApiInput({
            chatKey: c.req.query("chatKey"),
            contextId: c.req.query("contextId"),
            limit: c.req.query("limit"),
            direction: c.req.query("direction"),
            beforeTs: c.req.query("beforeTs"),
            afterTs: c.req.query("afterTs"),
          });
        },
      },
      async execute(params) {
        const payload = params.payload as ChatHistoryActionPayload;
        const snapshot = resolveChatContextSnapshot({
          context: params.context,
          ...(payload.chatKey ? { chatKey: payload.chatKey } : {}),
          ...(payload.contextId ? { contextId: payload.contextId } : {}),
        });
        const explicitContextId = String(payload.contextId || "").trim();
        const explicitChatKey = String(payload.chatKey || "").trim();
        // 关键点（中文）：history 查询优先显式参数，避免被当前请求上下文的 contextId 覆盖。
        const contextId = String(
          explicitContextId || explicitChatKey || snapshot.contextId || "",
        ).trim();
        if (!contextId) {
          return {
            success: false,
            error:
              "Missing contextId. Provide --context-id/--chat-key or ensure SMA_CTX_CONTEXT_ID is injected.",
          };
        }

        const historyResult = await readChatHistory({
          context: params.context,
          contextId,
          limit: payload.limit,
          direction: payload.direction || "all",
          beforeTs: payload.beforeTs,
          afterTs: payload.afterTs,
        });
        const historyPath = path
          .relative(params.context.rootPath, historyResult.historyPath)
          .split(path.sep)
          .join("/");

        return {
          success: true,
          data: {
            context: snapshot,
            historyPath,
            count: historyResult.events.length,
            events: toChatHistoryView(historyResult.events),
          },
        };
      },
    },
  },
  lifecycle: {
    async start(context) {
      await startChatChannels(context);
    },
    async stop() {
      await stopChatChannels();
    },
  },
};
