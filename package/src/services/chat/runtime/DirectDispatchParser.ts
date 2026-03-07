/**
 * DirectDispatchParser：direct 模式 assistant 文本解析器。
 *
 * 关键点（中文）
 * - 默认把 assistant 文本原样当作用户可见正文发送。
 * - 支持标签协议：`<chatKey> / <reply> / <delay> / <time> / <file> / <react>`。
 * - `<file>` 标签会被转换为附件指令文本，拼到主正文中发送。
 */

import type {
  DirectFileTagPayload,
  DirectFileType,
  DirectReactTagPayload,
  ResolvedDirectDispatchPlan,
  ResolvedDirectReactionPayload,
  ResolvedDirectTextPayload,
} from "@services/chat/types/DirectDispatch.js";

const CHAT_KEY_TAG_REGEXP = /<chatKey>([\s\S]*?)<\/chatKey>/gi;
const REPLY_TAG_REGEXP = /<reply>([\s\S]*?)<\/reply>/gi;
const DELAY_TAG_REGEXP = /<delay>([\s\S]*?)<\/delay>/gi;
const TIME_TAG_REGEXP = /<time>([\s\S]*?)<\/time>/gi;
const FILE_TAG_REGEXP = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi;
const FILE_SELF_CLOSING_TAG_REGEXP = /<file\b([^>]*)\/>/gi;
const REACT_TAG_REGEXP = /<react\b([^>]*)>([\s\S]*?)<\/react>/gi;
const REACT_SELF_CLOSING_TAG_REGEXP = /<react\b([^>]*)\/>/gi;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * 解析标签属性。
 *
 * 说明（中文）
 * - 支持双引号和单引号属性值。
 */
function parseTagAttributes(rawAttrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrs = String(rawAttrs || "");
  const regexp = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = regexp.exec(attrs);
    if (!match) break;
    const key = normalizeText(match[1]).toLowerCase();
    if (!key) continue;
    const value = normalizeText(match[2] ?? match[3] ?? "");
    out[key] = value;
  }
  return out;
}

function parseBoolean(value: unknown): boolean {
  const text = normalizeText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes";
}

function parseDirectFileType(value: unknown): DirectFileType {
  const text = normalizeText(value).toLowerCase();
  if (text === "photo") return "photo";
  if (text === "voice") return "voice";
  if (text === "audio") return "audio";
  return "document";
}

/**
 * 解析 `<delay>` 毫秒值。
 *
 * 说明（中文）
 * - 仅接受非负整数字符串。
 * - 非法值返回 undefined（降级为立即发送）。
 */
function parseDelayMsTag(value: unknown): number | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;
  if (!/^\d+$/.test(text)) return undefined;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

/**
 * 解析 `<time>` 绝对发送时间。
 *
 * 支持格式（中文）
 * - Unix 时间戳（秒/毫秒）
 * - ISO 时间字符串
 */
function parseSendAtMsTag(value: unknown): number | undefined {
  const text = normalizeText(value);
  if (!text) return undefined;

  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }
    // 关键点（中文）：10 位通常是秒级时间戳，统一转换为毫秒。
    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function extractLastTagValue(source: string, regexp: RegExp): string {
  let last = "";
  const text = String(source || "");
  let match: RegExpExecArray | null = null;
  regexp.lastIndex = 0;
  while (true) {
    match = regexp.exec(text);
    if (!match) break;
    last = normalizeText(match[1]);
  }
  return last;
}

/**
 * 提取 `<file>` 标签列表。
 */
function extractFileTags(source: string): DirectFileTagPayload[] {
  const out: DirectFileTagPayload[] = [];
  const text = String(source || "");

  FILE_TAG_REGEXP.lastIndex = 0;
  let blockMatch: RegExpExecArray | null = null;
  while (true) {
    blockMatch = FILE_TAG_REGEXP.exec(text);
    if (!blockMatch) break;
    const attrs = parseTagAttributes(blockMatch[1] || "");
    const path = normalizeText(blockMatch[2]);
    if (!path) continue;
    const caption = normalizeText(attrs.caption);
    out.push({
      path,
      type: parseDirectFileType(attrs.type),
      ...(caption ? { caption } : {}),
    });
  }

  FILE_SELF_CLOSING_TAG_REGEXP.lastIndex = 0;
  let selfMatch: RegExpExecArray | null = null;
  while (true) {
    selfMatch = FILE_SELF_CLOSING_TAG_REGEXP.exec(text);
    if (!selfMatch) break;
    const attrs = parseTagAttributes(selfMatch[1] || "");
    const path = normalizeText(attrs.path);
    if (!path) continue;
    const caption = normalizeText(attrs.caption);
    out.push({
      path,
      type: parseDirectFileType(attrs.type),
      ...(caption ? { caption } : {}),
    });
  }

  return out;
}

/**
 * 提取 `<react>` 标签列表。
 */
function extractReactTags(source: string): DirectReactTagPayload[] {
  const out: DirectReactTagPayload[] = [];
  const text = String(source || "");

  REACT_TAG_REGEXP.lastIndex = 0;
  let blockMatch: RegExpExecArray | null = null;
  while (true) {
    blockMatch = REACT_TAG_REGEXP.exec(text);
    if (!blockMatch) break;
    const attrs = parseTagAttributes(blockMatch[1] || "");
    const emoji = normalizeText(attrs.emoji || blockMatch[2]);
    if (!emoji) continue;
    const chatKey = normalizeText(attrs.chatkey);
    const messageId = normalizeText(attrs.messageid);
    out.push({
      emoji,
      ...(chatKey ? { chatKey } : {}),
      ...(messageId ? { messageId } : {}),
      ...(parseBoolean(attrs.big) ? { big: true } : {}),
    });
  }

  REACT_SELF_CLOSING_TAG_REGEXP.lastIndex = 0;
  let selfMatch: RegExpExecArray | null = null;
  while (true) {
    selfMatch = REACT_SELF_CLOSING_TAG_REGEXP.exec(text);
    if (!selfMatch) break;
    const attrs = parseTagAttributes(selfMatch[1] || "");
    const emoji = normalizeText(attrs.emoji);
    if (!emoji) continue;
    const chatKey = normalizeText(attrs.chatkey);
    const messageId = normalizeText(attrs.messageid);
    out.push({
      emoji,
      ...(chatKey ? { chatKey } : {}),
      ...(messageId ? { messageId } : {}),
      ...(parseBoolean(attrs.big) ? { big: true } : {}),
    });
  }

  return out;
}

/**
 * 剥离协议标签，保留正文文本。
 */
function stripDirectProtocolTags(source: string): string {
  return String(source || "")
    .replace(CHAT_KEY_TAG_REGEXP, "")
    .replace(REPLY_TAG_REGEXP, "")
    .replace(DELAY_TAG_REGEXP, "")
    .replace(TIME_TAG_REGEXP, "")
    .replace(FILE_TAG_REGEXP, "")
    .replace(FILE_SELF_CLOSING_TAG_REGEXP, "")
    .replace(REACT_TAG_REGEXP, "")
    .replace(REACT_SELF_CLOSING_TAG_REGEXP, "")
    .trim();
}

/**
 * 把 `<file>` 标签转为附件指令行。
 */
function buildAttachmentLines(files: DirectFileTagPayload[]): string[] {
  const lines: string[] = [];
  for (const file of files) {
    const path = normalizeText(file.path);
    if (!path) continue;
    const type = parseDirectFileType(file.type);
    const caption = normalizeText(file.caption);
    lines.push(
      caption
        ? `@attach ${type} ${path} | ${caption}`
        : `@attach ${type} ${path}`,
    );
  }
  return lines;
}

function resolveTextPlan(params: {
  source: string;
  fallbackChatKey: string;
  chatKeyOverride?: string;
  replyToMessage: boolean;
  delayMs?: number;
  sendAtMs?: number;
  files: DirectFileTagPayload[];
}): ResolvedDirectTextPayload | null {
  const baseText = stripDirectProtocolTags(params.source);
  const attachmentLines = buildAttachmentLines(params.files);
  const text = [baseText, attachmentLines.join("\n")]
    .filter((item) => normalizeText(item).length > 0)
    .join(baseText && attachmentLines.length > 0 ? "\n\n" : "")
    .trim();
  if (!text) return null;

  const chatKey = normalizeText(params.chatKeyOverride || params.fallbackChatKey);
  if (!chatKey) return null;

  return {
    text,
    chatKey,
    replyToMessage: params.replyToMessage,
    ...(typeof params.sendAtMs === "number"
      ? { sendAtMs: params.sendAtMs }
      : {}),
    ...(typeof params.delayMs === "number" ? { delayMs: params.delayMs } : {}),
  };
}

function resolveReactionPlans(params: {
  fallbackChatKey: string;
  reacts: DirectReactTagPayload[];
}): ResolvedDirectReactionPayload[] {
  const out: ResolvedDirectReactionPayload[] = [];
  for (const react of params.reacts) {
    const emoji = normalizeText(react.emoji);
    if (!emoji) continue;
    const chatKey = normalizeText(react.chatKey || params.fallbackChatKey);
    if (!chatKey) continue;
    const messageId = normalizeText(react.messageId);
    out.push({
      emoji,
      chatKey,
      ...(messageId ? { messageId } : {}),
      big: react.big === true,
    });
  }
  return out;
}

/**
 * 从 assistant 文本中解析 direct 出站执行计划。
 *
 * 协议（中文）
 * - `<chatKey>...</chatKey>`：覆盖主文本目标会话。
 * - `<reply>true|false</reply>`：设置主文本 reply 语义。
 * - `<delay>3000</delay>`：主文本延迟发送毫秒数（非负整数）。
 * - `<time>2026-03-05T20:30:00+08:00</time>`：主文本定时发送（秒/毫秒时间戳或 ISO）。
 * - `<file type=\"document\">path</file>`：发送附件（会转换为附件指令行）。
 * - `<react>👍</react>`：发送表情反应（支持属性：chatKey/messageId/big）。
 */
export function parseDirectDispatchAssistantText(params: {
  assistantText: string;
  fallbackChatKey: string;
}): ResolvedDirectDispatchPlan | null {
  const source = String(params.assistantText ?? "");
  const fallbackChatKey = normalizeText(params.fallbackChatKey);
  if (!normalizeText(source) || !fallbackChatKey) return null;

  const chatKeyOverride = extractLastTagValue(source, CHAT_KEY_TAG_REGEXP);
  const replyRaw = extractLastTagValue(source, REPLY_TAG_REGEXP);
  const delayRaw = extractLastTagValue(source, DELAY_TAG_REGEXP);
  const timeRaw = extractLastTagValue(source, TIME_TAG_REGEXP);
  const files = extractFileTags(source);
  const reacts = extractReactTags(source);
  const delayMs = parseDelayMsTag(delayRaw);
  const sendAtMs = parseSendAtMsTag(timeRaw);

  const textPlan = resolveTextPlan({
    source,
    fallbackChatKey,
    ...(chatKeyOverride ? { chatKeyOverride } : {}),
    replyToMessage: parseBoolean(replyRaw),
    ...(typeof sendAtMs === "number"
      ? { sendAtMs }
      : typeof delayMs === "number"
        ? { delayMs }
        : {}),
    files,
  });
  const reactionPlans = resolveReactionPlans({
    fallbackChatKey,
    reacts,
  });

  if (!textPlan && reactionPlans.length === 0) return null;
  return {
    text: textPlan,
    reactions: reactionPlans,
  };
}
