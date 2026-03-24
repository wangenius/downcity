/**
 * Chat 消息标记语法解析工具。
 *
 * 关键点（中文）
 * - 统一处理 frontmatter metadata 与 `<file>` 附件标签。
 * - 所有用户/模型可见的消息协议都应复用这里，避免 direct/cmd/channel 各自漂移。
 */

import yaml from "js-yaml";
import type {
  ChatMessageFileTag,
  ChatMessageFileType,
  ParsedChatMessageMarkup,
} from "@services/chat/types/ChatMessageMarkup.js";

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
 * - 支持单引号和双引号属性值。
 * - 未做 HTML 实体解码，保持协议最简。
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

/**
 * 归一化附件类型。
 */
export function normalizeChatMessageFileType(value: unknown): ChatMessageFileType {
  const text = normalizeText(value).toLowerCase();
  if (text === "photo" || text === "image") return "photo";
  if (text === "voice") return "voice";
  if (text === "audio") return "audio";
  if (text === "video") return "video";
  return "document";
}

/**
 * 提取 frontmatter metadata。
 *
 * 关键点（中文）
 * - frontmatter 非法时按“无 metadata”处理，避免误删正文。
 */
export function extractChatMessageFrontmatter(params: {
  source: string;
}): {
  metadata: Record<string, unknown>;
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
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(yamlRaw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    return {
      metadata: {},
      body: source,
    };
  }

  return {
    metadata,
    body: source.slice(match[0].length),
  };
}

/**
 * 提取 `<file>` 标签列表。
 */
export function extractChatMessageFileTags(source: string): ChatMessageFileTag[] {
  const out: ChatMessageFileTag[] = [];
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
      type: normalizeChatMessageFileType(attrs.type),
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
      type: normalizeChatMessageFileType(attrs.type),
      ...(caption ? { caption } : {}),
    });
  }

  return out;
}

/**
 * 移除正文中的 `<file>` 标签，仅保留自然语言正文。
 */
export function stripChatMessageFileTags(source: string): string {
  return String(source || "")
    .replace(FILE_TAG_REGEXP, "")
    .replace(FILE_SELF_CLOSING_TAG_REGEXP, "")
    .trim();
}

function normalizeTagAttributeValue(value: string, quote: '"' | "'"): string {
  if (quote === '"') {
    return value.replace(/"/g, "'");
  }
  return value.replace(/'/g, '"');
}

/**
 * 渲染一条标准化 `<file>` 标签。
 *
 * 关键点（中文）
 * - 统一输出 block 形式，便于 direct/cmd/inbound 都保持一致文本。
 */
export function renderChatMessageFileTag(file: ChatMessageFileTag): string {
  const path = normalizeText(file.path);
  if (!path) return "";
  const type = normalizeChatMessageFileType(file.type);
  const caption = normalizeText(file.caption);
  const quote: '"' | "'" = caption.includes('"') && !caption.includes("'") ? "'" : '"';
  const safeCaption = caption
    ? normalizeTagAttributeValue(caption, quote)
    : "";
  const captionAttr = safeCaption ? ` caption=${quote}${safeCaption}${quote}` : "";
  return `<file type="${type}"${captionAttr}>${path}</file>`;
}

/**
 * 把附件列表渲染回统一的 `<file>` 文本块。
 */
export function buildChatMessageFileBlock(files: ChatMessageFileTag[]): string {
  return files
    .map((file) => renderChatMessageFileTag(file))
    .filter((item) => normalizeText(item).length > 0)
    .join("\n");
}

/**
 * 把“正文 + 附件标签”重建成统一消息文本。
 */
export function buildChatMessageText(params: {
  bodyText?: string;
  files?: ChatMessageFileTag[];
}): string {
  const bodyText = normalizeText(params.bodyText);
  const fileBlock = buildChatMessageFileBlock(
    Array.isArray(params.files) ? params.files : [],
  );
  return [bodyText, fileBlock]
    .filter((item) => normalizeText(item).length > 0)
    .join(bodyText && fileBlock ? "\n\n" : "")
    .trim();
}

/**
 * 统一解析一段 chat 消息文本。
 */
export function parseChatMessageMarkup(source: string): ParsedChatMessageMarkup {
  const extracted = extractChatMessageFrontmatter({
    source: String(source || ""),
  });
  const files = extractChatMessageFileTags(extracted.body);
  return {
    metadata: extracted.metadata,
    bodyText: stripChatMessageFileTags(extracted.body),
    files,
  };
}
