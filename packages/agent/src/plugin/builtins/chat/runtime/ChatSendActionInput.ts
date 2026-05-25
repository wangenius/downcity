/**
 * Chat send action 输入映射。
 *
 * 关键点（中文）
 * - 专门处理 `chat send` 的 CLI/API payload 标准化。
 * - frontmatter metadata 与 `<file>` 协议在这里转换为统一正文。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type { PluginActionCommandInput } from "@/plugin/types/Plugin.js";
import type { ChatSendActionPayload } from "@/plugin/builtins/chat/types/ChatService.js";
import {
  buildChatMessageText,
  parseChatMessageMarkup,
} from "@/plugin/builtins/chat/runtime/ChatMessageMarkup.js";
import { parseChatSendOptionsFromMetadata } from "@/plugin/builtins/chat/runtime/ChatSendMetadata.js";
import {
  normalizeChatSendText,
  resolveChatKey,
} from "@/plugin/builtins/chat/Action.js";
import { getBooleanOpt, getStringOpt } from "./ChatActionInputSupport.js";

/**
 * 解析非负整数 option。
 */
function parseNonNegativeIntOptionOrThrow(
  value: string,
  fieldName: string,
): number {
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

/**
 * 判断 ISO datetime 是否缺少时区。
 */
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

/**
 * 解析 `chat send` 的命令输入。
 *
 * 关键点（中文）
 * - `--text / --stdin / --text-file` 三选一
 * - 文本读取失败直接抛错，由上层统一输出
 */
export async function mapChatSendCommandInput(
  input: PluginActionCommandInput,
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

/**
 * 解析 `chat send` 的 API 输入。
 */
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
