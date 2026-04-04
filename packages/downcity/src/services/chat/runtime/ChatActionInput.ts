/**
 * ChatActionInput：chat service 的 CLI/API 输入映射模块。
 *
 * 关键点（中文）
 * - 这里统一处理命令行与 HTTP 请求到 action payload 的转换。
 * - 所有校验错误都尽量在输入层 fail-fast，避免进入执行层后才发现参数非法。
 * - `chat send` 的 frontmatter / <file> 协议也在这里完成标准化解析。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject, JsonValue } from "@/shared/types/Json.js";
import type { ServiceActionCommandInput } from "@/shared/types/Service.js";
import type {
  ChatConfigureActionPayload,
  ChatDeleteActionPayload,
  ChatHistoryActionPayload,
  ChatInfoActionPayload,
  ChatListActionPayload,
  ChatReactActionPayload,
  ChatSendActionPayload,
} from "@/shared/types/ChatService.js";
import { buildChatMessageText, parseChatMessageMarkup } from "@services/chat/runtime/ChatMessageMarkup.js";
import { parseChatSendOptionsFromMetadata } from "@services/chat/runtime/ChatSendMetadata.js";
import { normalizeChatSendText, resolveChatKey } from "@services/chat/Action.js";
import { resolveChatChannelNameOrThrow } from "@services/chat/runtime/ChatChannelFacade.js";

function isJsonObject(value: JsonValue): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

/**
 * 解析 chat send 正文协议。
 *
 * 关键点（中文）
 * - 正文支持 frontmatter metadata，字段语义与 `city chat send` 参数一致。
 * - `<file>` 为唯一附件协议；会保留在规范化正文里，交给渠道出站阶段解析。
 * - 显式 CLI/API 参数优先，但与 metadata 冲突的 delay/time 组合会报错。
 */
function parseChatSendTextProtocol(params: {
  rawText: string;
  explicitChatKey?: string;
  explicitDelayMs?: number;
  explicitSendAtMs?: number;
  explicitReplyToMessage?: boolean;
  explicitMessageId?: string;
}): ChatSendActionPayload {
  const parsed = parseChatMessageMarkup(normalizeChatSendText(params.rawText));
  const metadataOptions = parseChatSendOptionsFromMetadata({
    metadata: parsed.metadata,
    strict: true,
  });

  const delayMs =
    typeof params.explicitDelayMs === "number"
      ? params.explicitDelayMs
      : metadataOptions.delayMs;
  const sendAtMs =
    typeof params.explicitSendAtMs === "number"
      ? params.explicitSendAtMs
      : metadataOptions.sendAtMs;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`delay` and `time` cannot be used together.");
  }

  const chatKey = resolveChatKey({
    chatKey: params.explicitChatKey || metadataOptions.chatKey,
  });
  const messageId = String(
    params.explicitMessageId || metadataOptions.messageId || "",
  ).trim();
  const replyToMessage =
    params.explicitReplyToMessage === true ||
    metadataOptions.replyToMessage === true;

  return {
    text: buildChatMessageText({
      segments: parsed.segments,
    }),
    ...(chatKey ? { chatKey } : {}),
    ...(typeof delayMs === "number" ? { delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { sendAtMs } : {}),
    ...(replyToMessage ? { replyToMessage: true } : {}),
    ...(messageId ? { messageId } : {}),
  };
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

export function mapChatChannelCommandInput(
  input: ServiceActionCommandInput,
): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatChannelApiInput(
  body: JsonValue,
): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const channelRaw =
    typeof (body as JsonObject).channel === "string"
      ? String((body as JsonObject).channel).trim()
      : "";
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatChannelApiQueryInput(query?: {
  channel?: string;
}): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  const channelRaw = String(query?.channel || "").trim();
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatListCommandInput(
  input: ServiceActionCommandInput,
): ChatListActionPayload {
  const channelRaw = getStringOpt(input.opts, "channel");
  const limitRaw = getStringOpt(input.opts, "limit");
  const q = getStringOpt(input.opts, "q");
  const channel = channelRaw ? resolveChatChannelNameOrThrow(channelRaw) : undefined;
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;
  return {
    ...(channel ? { channel } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(q ? { q } : {}),
  };
}

export function mapChatListApiInput(query?: {
  channel?: string;
  limit?: string;
  q?: string;
}): ChatListActionPayload {
  const channelRaw = String(query?.channel || "").trim();
  const limitRaw = String(query?.limit || "").trim();
  const q = String(query?.q || "").trim();
  const channel = channelRaw ? resolveChatChannelNameOrThrow(channelRaw) : undefined;
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;
  return {
    ...(channel ? { channel } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(q ? { q } : {}),
  };
}

export function mapChatInfoCommandInput(
  input: ServiceActionCommandInput,
): ChatInfoActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatInfoApiInput(query?: {
  chatKey?: string;
  sessionId?: string;
}): ChatInfoActionPayload {
  const chatKey = String(query?.chatKey || "").trim();
  const sessionId = String(query?.sessionId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatConfigureCommandInput(
  input: ServiceActionCommandInput,
): ChatConfigureActionPayload {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) {
    throw new Error("Missing --channel. Use telegram|feishu|qq.");
  }
  const channel = resolveChatChannelNameOrThrow(channelRaw);
  const rawConfigJson = getStringOpt(input.opts, "configJson");
  if (!rawConfigJson) {
    throw new Error("Missing --config-json.");
  }
  let parsed: JsonValue = {};
  try {
    parsed = JSON.parse(rawConfigJson) as JsonValue;
  } catch (error) {
    throw new Error(`Invalid --config-json: ${String(error)}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error("--config-json must be a JSON object");
  }
  return {
    channel,
    config: parsed as Record<string, JsonValue>,
    restart: getBooleanOpt(input.opts, "restart"),
  };
}

export async function mapChatConfigureApiInput(c: {
  req: {
    json: () => Promise<JsonValue>;
  };
}): Promise<ChatConfigureActionPayload> {
  const body = await c.req.json().catch(() => ({} as JsonValue));
  if (!isJsonObject(body)) {
    throw new Error("Invalid JSON body");
  }
  const channelRaw = typeof body.channel === "string" ? String(body.channel).trim() : "";
  if (!channelRaw) {
    throw new Error("Missing channel");
  }
  const configRaw = body.config;
  if (!isJsonObject(configRaw)) {
    throw new Error("Missing config object");
  }
  const restart = typeof body.restart === "boolean" ? body.restart : undefined;
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
    config: configRaw as Record<string, JsonValue>,
    ...(typeof restart === "boolean" ? { restart } : {}),
  };
}

export function mapChatHistoryCommandInput(
  input: ServiceActionCommandInput,
): ChatHistoryActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
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
    ...(sessionId ? { sessionId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

export function mapChatHistoryApiInput(query: {
  chatKey?: string;
  sessionId?: string;
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
  const sessionId = String(query.sessionId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

/**
 * 解析 `chat send` 的命令输入。
 *
 * 关键点（中文）
 * - `--text / --stdin / --text-file` 三选一
 * - 文本读取失败直接抛错，由上层统一输出
 */
export async function mapChatSendCommandInput(
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

  const delayRaw = getStringOpt(input.opts, "delay");
  const timeRaw = getStringOpt(input.opts, "time");
  const replyToMessage = getBooleanOpt(input.opts, "reply");
  const messageId = getStringOpt(input.opts, "messageId");
  const delayMs = delayRaw
    ? parseNonNegativeIntOptionOrThrow(delayRaw, "delay")
    : undefined;
  const sendAtMs = timeRaw ? parseSendTimeOptionOrThrow(timeRaw, "time") : undefined;
  if (typeof delayMs === "number" && typeof sendAtMs === "number") {
    throw new Error("`--delay` and `--time` cannot be used together.");
  }
  const payload = parseChatSendTextProtocol({
    rawText: text,
    explicitChatKey: getStringOpt(input.opts, "chatKey"),
    ...(typeof delayMs === "number" ? { explicitDelayMs: delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { explicitSendAtMs: sendAtMs } : {}),
    ...(replyToMessage ? { explicitReplyToMessage: true } : {}),
    ...(messageId ? { explicitMessageId: messageId } : {}),
  });
  const chatKey = resolveChatKey({
    chatKey: payload.chatKey,
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure DC_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  return {
    text: payload.text,
    chatKey,
    ...(typeof payload.delayMs === "number" ? { delayMs: payload.delayMs } : {}),
    ...(typeof payload.sendAtMs === "number" ? { sendAtMs: payload.sendAtMs } : {}),
    ...(payload.replyToMessage === true ? { replyToMessage: true } : {}),
    ...(payload.messageId ? { messageId: payload.messageId } : {}),
  };
}

export function mapChatSendApiInput(body: JsonValue): ChatSendActionPayload {
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
  return parseChatSendTextProtocol({
    rawText: String(payload.text ?? ""),
    explicitChatKey:
      typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined,
    ...(typeof delayMs === "number" ? { explicitDelayMs: delayMs } : {}),
    ...(typeof sendAtMs === "number" ? { explicitSendAtMs: sendAtMs } : {}),
    ...(replyRaw === true ? { explicitReplyToMessage: true } : {}),
    ...(typeof payload.messageId === "string" || typeof payload.messageId === "number"
      ? { explicitMessageId: String(payload.messageId).trim() }
      : {}),
  });
}

export function mapChatReactCommandInput(
  input: ServiceActionCommandInput,
): ChatReactActionPayload {
  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure DC_CTX_CHAT_KEY is injected in current shell context.",
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

export function mapChatReactApiInput(body: JsonValue): ChatReactActionPayload {
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

export function mapChatDeleteCommandInput(
  input: ServiceActionCommandInput,
): ChatDeleteActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatDeleteApiInput(body: JsonValue): ChatDeleteActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const payload = body as JsonObject;
  const chatKey = typeof payload.chatKey === "string" ? payload.chatKey.trim() : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}
