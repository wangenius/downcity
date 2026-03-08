/**
 * DirectDispatchParser：direct 模式 assistant 文本解析器。
 *
 * 关键点（中文）
 * - 默认把 assistant 文本原样当作用户可见正文发送。
 * - 结构化控制参数使用 frontmatter metadata（`reply/react`）。
 * - 附件能力保留 `<file>` 标签；会被转换为附件指令文本，拼到主正文中发送。
 */

import yaml from "js-yaml";
import type {
  DirectFileTagPayload,
  DirectFileType,
  DirectReactTagPayload,
  ResolvedDirectDispatchPlan,
  ResolvedDirectReactionPayload,
  ResolvedDirectTextPayload,
} from "@services/chat/types/DirectDispatch.js";

const FILE_TAG_REGEXP = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi;
const FILE_SELF_CLOSING_TAG_REGEXP = /<file\b([^>]*)\/>/gi;
const FRONTMATTER_REGEXP = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

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
  if (typeof value === "boolean") return value;
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

type DirectFrontmatterMetadata = Record<string, unknown>;

function extractFrontmatter(params: {
  source: string;
}): {
  metadata: DirectFrontmatterMetadata;
  body: string;
} {
  const source = String(params.source || "");
  const match = FRONTMATTER_REGEXP.exec(source);
  if (!match) {
    return {
      metadata: {},
      body: source,
    };
  }

  const yamlRaw = String(match[1] || "");
  let metadata: DirectFrontmatterMetadata = {};
  try {
    const parsed = yaml.load(yamlRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as DirectFrontmatterMetadata;
    }
  } catch {
    // 关键点（中文）：frontmatter 非法时按“无 metadata”处理，避免误删正文。
    return {
      metadata: {},
      body: source,
    };
  }

  const body = source.slice(match[0].length);
  return {
    metadata,
    body,
  };
}

function parseOptionalMessageId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value)) {
    const text = String(Math.trunc(value)).trim();
    return text ? text : undefined;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : undefined;
  }
  return undefined;
}

function resolveReplyControl(params: {
  replyRaw: unknown;
}): {
  replyToMessage: boolean;
  messageId?: string;
} {
  const replyAsMessageId = parseOptionalMessageId(params.replyRaw);
  if (replyAsMessageId) {
    return {
      replyToMessage: true,
      messageId: replyAsMessageId,
    };
  }

  return {
    replyToMessage: false,
  };
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

function parseReactionFromMetadata(value: unknown): DirectReactTagPayload | null {
  if (typeof value === "string") {
    const emoji = normalizeText(value);
    return emoji ? { emoji } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const emoji = normalizeText(raw.emoji);
  if (!emoji) return null;
  const big = parseBoolean(raw.big);
  return {
    emoji,
    ...(big ? { big: true } : {}),
  };
}

function parseReactionsFromMetadata(
  metadata: DirectFrontmatterMetadata,
): DirectReactTagPayload[] {
  const out: DirectReactTagPayload[] = [];
  const raw = metadata.react;
  if (!raw) return out;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    const parsed = parseReactionFromMetadata(item);
    if (!parsed) continue;
    out.push(parsed);
  }
  return out;
}

/**
 * 剥离附件标签，保留正文文本。
 */
function stripAttachmentTags(source: string): string {
  return String(source || "")
    .replace(FILE_TAG_REGEXP, "")
    .replace(FILE_SELF_CLOSING_TAG_REGEXP, "")
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
  replyToMessage: boolean;
  messageId?: string;
  files: DirectFileTagPayload[];
}): ResolvedDirectTextPayload | null {
  const baseText = stripAttachmentTags(params.source);
  const attachmentLines = buildAttachmentLines(params.files);
  const text = [baseText, attachmentLines.join("\n")]
    .filter((item) => normalizeText(item).length > 0)
    .join(baseText && attachmentLines.length > 0 ? "\n\n" : "")
    .trim();
  if (!text) return null;

  const chatKey = normalizeText(params.fallbackChatKey);
  if (!chatKey) return null;

  return {
    text,
    chatKey,
    replyToMessage: params.replyToMessage,
    ...(typeof params.messageId === "string" && params.messageId
      ? { messageId: params.messageId }
      : {}),
  };
}

function resolveReactionPlans(params: {
  fallbackChatKey: string;
  replyMessageId?: string;
  reacts: DirectReactTagPayload[];
}): ResolvedDirectReactionPayload[] {
  const out: ResolvedDirectReactionPayload[] = [];
  const chatKey = normalizeText(params.fallbackChatKey);
  const replyMessageId = normalizeText(params.replyMessageId);
  if (!chatKey) return out;
  for (const react of params.reacts) {
    const emoji = normalizeText(react.emoji);
    if (!emoji) continue;
    // 关键点（中文）：react 统一复用当前会话；目标消息仅来自 reply。
    const messageId = replyMessageId;
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
 * - frontmatter metadata：`reply/react`。
 * - `<file type=\"document\">path</file>`：发送附件（会转换为附件指令行）。
 */
export function parseDirectDispatchAssistantText(params: {
  assistantText: string;
  fallbackChatKey: string;
}): ResolvedDirectDispatchPlan | null {
  const source = String(params.assistantText ?? "");
  const fallbackChatKey = normalizeText(params.fallbackChatKey);
  if (!normalizeText(source) || !fallbackChatKey) return null;

  const extracted = extractFrontmatter({ source });
  const metadata = extracted.metadata;
  const body = extracted.body;

  const replyRaw = metadata.reply;
  const replyControl = resolveReplyControl({
    replyRaw,
  });
  const files = extractFileTags(body);
  const reacts = parseReactionsFromMetadata(metadata);

  const textPlan = resolveTextPlan({
    source: body,
    fallbackChatKey,
    replyToMessage: replyControl.replyToMessage,
    ...(replyControl.messageId ? { messageId: replyControl.messageId } : {}),
    files,
  });
  const reactionPlans = resolveReactionPlans({
    fallbackChatKey,
    replyMessageId: replyControl.messageId,
    reacts,
  });

  if (!textPlan && reactionPlans.length === 0) return null;
  return {
    text: textPlan,
    reactions: reactionPlans,
  };
}
