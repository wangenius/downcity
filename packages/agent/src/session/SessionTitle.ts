/**
 * SDK Session 标题生成与持久化辅助。
 *
 * 关键点（中文）
 * - session title 是 `meta.json` 顶层字段，列表与详情都以它为准。
 * - title 默认允许为空；只有模型成功生成标题时才会写入。
 * - 当 title 仍为空时，后续执行链路可以再次尝试生成。
 */

import { generateText, type LanguageModel } from "ai";
import type { SessionHistoryMetaV1 } from "@/executor/types/SessionHistoryMeta.js";
import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import {
  normalizeSessionTitle,
  readSessionMetadata,
  writeSessionMetadata,
} from "@/session/storage/Metadata.js";

const GENERATED_SESSION_TITLE_MAX_CHARS = 24;

/**
 * 标题持久化参数。
 */
export interface EnsureSessionTitleParams {
  /**
   * 当前项目根目录。
   */
  projectRoot: string;

  /**
   * 当前 agent 稳定标识。
   */
  agentId: string;

  /**
   * 当前 sessionId。
   */
  sessionId: string;

  /**
   * 当前 session 已落盘消息。
   */
  messages: SessionMessageV1[];

  /**
   * 可选模型实例；传入时会尝试生成更短标题。
   */
  model?: LanguageModel;

  /**
   * 是否允许调用模型生成标题。
   */
  generate?: boolean;
}

function truncateTitle(input: string, maxChars: number): string {
  const title = String(input || "").replace(/\s+/g, " ").trim();
  if (!title) return "";
  if (title.length <= maxChars) return title;
  return title.slice(0, maxChars).trimEnd();
}

function extractTextFromMessage(message: SessionMessageV1): string {
  if (!Array.isArray(message.parts)) return "";
  const texts: string[] = [];
  for (const part of message.parts) {
    if (!part || typeof part !== "object") continue;
    const textPart = part as { type?: unknown; text?: unknown };
    if (textPart.type !== "text" || typeof textPart.text !== "string") continue;
    const text = textPart.text.trim();
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

function resolveFirstUserText(messages: SessionMessageV1[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = extractTextFromMessage(message);
    if (text) return text;
  }
  return "";
}

function normalizeGeneratedTitle(input: string): string | undefined {
  const firstLine = String(input || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const title = normalizeSessionTitle(
    String(firstLine || "")
      .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
      .replace(/^标题[:：]\s*/i, "")
      .trim(),
  );
  return title
    ? truncateTitle(title, GENERATED_SESSION_TITLE_MAX_CHARS)
    : undefined;
}

async function generateSessionTitle(input: {
  /**
   * 当前模型实例。
   */
  model: LanguageModel;

  /**
   * 首条用户消息文本。
   */
  firstUserText: string;
}): Promise<string | undefined> {
  try {
    const result = await generateText({
      model: input.model,
      system:
        "你负责为一段会话生成极简标题。只输出标题本身，不要解释，不要使用引号。",
      prompt: [
        "根据下面这条用户首条消息，生成一个简短的会话标题。",
        "要求：3 到 12 个汉字或 2 到 6 个英文词；不要句号；不要前缀。",
        "",
        input.firstUserText,
      ].join("\n"),
    });
    return normalizeGeneratedTitle(result.text);
  } catch {
    // 关键点（中文）：标题生成失败不能影响 session 主流程。
    return undefined;
  }
}

/**
 * 确保当前 session meta 中持久化 title。
 */
export async function ensureSessionTitle(
  input: EnsureSessionTitleParams,
): Promise<SessionHistoryMetaV1> {
  const current = await readSessionMetadata(input);
  if (current.title) return current;

  const firstUserText = resolveFirstUserText(input.messages);
  if (input.generate !== true || !input.model || !firstUserText) {
    return current;
  }

  const generatedTitle = await generateSessionTitle({
    model: input.model,
    firstUserText,
  });
  if (!generatedTitle) return current;

  const generatedMeta: SessionHistoryMetaV1 = {
    ...current,
    title: generatedTitle,
  };
  await writeSessionMetadata({
    projectRoot: input.projectRoot,
    agentId: input.agentId,
    sessionId: input.sessionId,
    meta: generatedMeta,
  });
  return generatedMeta;
}
