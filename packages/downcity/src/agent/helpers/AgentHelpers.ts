/**
 * AgentHelpers：Agent 辅助函数集合。
 *
 * 关键点（中文）
 * - 这个文件只放“无状态函数”，不持有运行态。
 * - 每个函数都可以被 Agent 主流程直接复用。
 * - 目标是让 Agent 类本身只看得到主流程，不被细节淹没。
 *
 * 职责分组（中文）
 * 1) 消息筛选：pickMergedUserMessages
 * 2) 消息转换：toModelMessages（含多模态附件注入）
 * 3) 日志输出：extractAssistantTextForLog / logAssistantMessageNow
 * 4) 平台参数：buildOpenAIResponsesProviderOptions
 */

import fs from "fs-extra";
import path from "node:path";
import {
  convertToModelMessages,
  isFileUIPart,
  isTextUIPart,
  type FileUIPart,
  type ModelMessage,
  type Tool,
  type ToolSet,
} from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import type { ContextMessageV1 } from "@agent/types/ContextMessage.js";
import { parseChatMessageMarkup } from "../../services/chat/runtime/ChatMessageMarkup.js";

/**
 * 过滤回调返回值中的 user 文本消息。
 *
 * 关键点（中文）
 * - 用途：从 onStepCallback 返回的消息里挑出可并入推理上下文的 user 文本。
 * - 输入：任意 ContextMessageV1[]（可能混有 assistant/tool/空消息）。
 * - 输出：只包含“非空 user 文本”的消息数组。
 */
export function pickMergedUserMessages(
  messages: ContextMessageV1[],
): ContextMessageV1[] {
  // 如果不是数组，直接返回空数组，避免后续 filter 报错。
  if (!Array.isArray(messages)) return [];

  // 逐条过滤消息。
  return messages.filter((message) => {
    // 防御 1：消息必须是对象。
    if (!message || typeof message !== "object") return false;

    // 防御 2：只接受 user 角色。
    if (message.role !== "user") return false;

    // 防御 3：parts 必须是数组。
    if (!Array.isArray(message.parts)) return false;

    // 把所有 text part 拼接为一个字符串用于判空。
    const text = message.parts
      // 只保留 text 类型 part。
      .filter(isTextUIPart)
      // 提取 text 字段并规整为字符串。
      .map((part) => String(part.text ?? ""))
      // 多段文本按换行拼接。
      .join("\n")
      // 去除首尾空白。
      .trim();

    // 只有非空文本才视为有效消息。
    return Boolean(text);
  });
}

/**
 * 将 context 消息转换为模型消息。
 *
 * 关键点（中文）
 * - 用途：把 UIMessage 语义层数据转成模型可消费的 ModelMessage[]。
 * - 输入：context 消息数组 + 可用工具集合。
 * - 输出：可直接喂给 streamText 的 messages。
 */
export async function toModelMessages(
  messages: ContextMessageV1[],
  tools: Record<string, Tool>,
): Promise<ModelMessage[]> {
  // 空输入快速返回，避免调用转换器的额外开销。
  if (!Array.isArray(messages) || messages.length === 0) return [];

  // 第一步（中文）：在 user 消息上注入 file parts（多模态附件）。
  const enrichedMessages = await injectFilePartsFromAttachments(messages);

  // 第二步（中文）：转换前先剔除 UI 层 id 字段，仅保留模型需要的数据结构。
  const input = enrichedMessages.map((message) => {
    // 解构去掉 id。
    const { id: _id, ...rest } = message;

    // 返回剩余字段。
    return rest;
  });

  // 调用 ai-sdk 的转换函数。
  return await convertToModelMessages(input, {
    // 如果当前轮有工具，就把工具注入转换选项。
    ...(tools && Object.keys(tools).length > 0 ? { tools: tools as ToolSet } : {}),
    // 忽略历史里的不完整工具调用，提升容错性。
    ignoreIncompleteToolCalls: true,
  });
}

/**
 * 从 `<file>` 标签中解析附件描述。
 *
 * 关键点（中文）
 * - 兼容 Telegram/Feishu/TUI 等所有注入 `<file>` 的入口。
 * - 仅返回当前 Agent 关心的字段：类型/路径/说明。
 */
function parseAttachmentLinesFromText(text: string): Array<{
  type: "photo" | "document" | "voice" | "audio" | "video";
  path: string;
  caption?: string;
}> {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  return parseChatMessageMarkup(raw).files.map((file) => ({
    type: file.type,
    path: file.path,
    ...(typeof file.caption === "string" && file.caption.trim()
      ? { caption: file.caption.trim() }
      : {}),
  }));
}

function guessAttachmentMediaTypeFromPath(filePath: string): string | undefined {
  const ext = (path.extname(filePath) || "").toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".zip") return "application/zip";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".opus") return "audio/opus";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".m4v") return "video/x-m4v";
  return undefined;
}

function buildDataUrl(mediaType: string, buffer: Buffer): string {
  const base64 = buffer.toString("base64");
  const safeType = mediaType || "application/octet-stream";
  return `data:${safeType};base64,${base64}`;
}

/**
 * 在 user 消息上注入 FileUIPart，以便多模态模型直接消费本地附件。
 *
 * 设计（中文）
 * - 当前处理图片与 PDF，便于多模态模型直接理解截图和文档。
 * - 附件仍然保留原始 `<file>` 标签文本，兼容纯文本模型。
 * - 不修改持久化历史，仅在本轮执行的内存消息上注入 file parts。
 */
async function injectFilePartsFromAttachments(
  messages: ContextMessageV1[],
): Promise<ContextMessageV1[]> {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const cwd = process.cwd();

  const out: ContextMessageV1[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object" || message.role !== "user") {
      out.push(message);
      continue;
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    if (parts.length === 0) {
      out.push(message);
      continue;
    }

    // 如果已有 file parts，则认为上游已经注入过，直接跳过，避免重复。
    if (parts.some((part) => isFileUIPart(part as FileUIPart))) {
      out.push(message);
      continue;
    }

    const fullText = parts
      .map((part) => {
        const candidate = part as unknown;
        if (!isTextUIPart(candidate as any)) return "";
        const value = (candidate as { text?: unknown }).text;
        return typeof value === "string" ? value : "";
      })
      .filter((text) => text)
      .join("\n");
    if (!fullText.trim()) {
      out.push(message);
      continue;
    }

    const attachments = parseAttachmentLinesFromText(fullText);
    if (attachments.length === 0) {
      out.push(message);
      continue;
    }

    const fileParts: FileUIPart[] = [];

    for (const attachment of attachments) {
      // 当前阶段：对图片与 PDF 注入 file part。
      const mediaTypeGuess = guessAttachmentMediaTypeFromPath(attachment.path);
      if (
        !mediaTypeGuess ||
        (!mediaTypeGuess.startsWith("image/") && mediaTypeGuess !== "application/pdf")
      ) {
        continue;
      }

      const absPath = path.isAbsolute(attachment.path)
        ? attachment.path
        : path.resolve(cwd, attachment.path);
      try {
        const exists = await fs.pathExists(absPath);
        if (!exists) continue;
        const buffer = await fs.readFile(absPath);
        const dataUrl = buildDataUrl(mediaTypeGuess, buffer);
        const filename = path.basename(absPath) || "image";

        fileParts.push({
          type: "file",
          mediaType: mediaTypeGuess,
          filename,
          url: dataUrl,
        });
      } catch {
        // 忽略单个附件错误，保持主流程可用。
        continue;
      }
    }

    if (fileParts.length === 0) {
      out.push(message);
      continue;
    }

    out.push({
      ...message,
      parts: [...parts, ...fileParts],
    });
  }

  return out;
}

/**
 * 从 UI message 中提取 assistant 文本部分。
 *
 * 关键点（中文）
 * - 用途：给日志层提供纯文本输出。
 * - 输入：完整 UIMessage（可能含非 text parts）。
 * - 输出：拼接后的文本字符串。
 */
export function extractAssistantTextForLog(message: ContextMessageV1): string {
  // 没有 parts 时直接返回空串。
  if (!Array.isArray(message.parts)) return "";

  // 抽取所有 text part 并拼接。
  return message.parts
    // 只保留 text part。
    .filter(isTextUIPart)
    // 提取 text 并规整。
    .map((part) => String(part.text ?? ""))
    // 多段文本按换行拼接。
    .join("\n")
    // 去掉首尾空白。
    .trim();
}

/**
 * 立即输出 assistant 文本日志。
 *
 * 关键点（中文）
 * - 用途：把 assistant 最终文本稳定写入 logger。
 * - 输入：logger + assistant message。
 * - 输出：无返回值（副作用为日志输出）。
 */
export async function logAssistantMessageNow(
  logger: Logger,
  message: ContextMessageV1,
): Promise<void> {
  // 先提取可读文本；如果为空则用 `-` 占位。
  const text = extractAssistantTextForLog(message) || "-";

  // 统一换行符为 `\n`，避免不同平台混杂 CRLF。
  const normalized = text.replace(/\r\n/g, "\n");

  // 按行拆分，第一行加前缀，后续行保留原文。
  const lines = normalized.split("\n");

  // 第一行固定前缀 `[assistant]`。
  const out = [`[assistant] ${lines[0] || "-"}`];

  // 如果有多行，追加后续行。
  if (lines.length > 1) out.push(...lines.slice(1));

  // 输出最终日志文本。
  await logger.log("info", out.join("\n"));
}

/**
 * 构建 OpenAI Responses providerOptions。
 *
 * 关键点（中文）
 * - 用途：集中声明 provider 级运行选项，避免在主流程内硬编码。
 * - 当前策略：`store=false`，不在 provider 侧持久化响应。
 */
export function buildOpenAIResponsesProviderOptions(): {
  openai: {
    store: boolean;
  };
} {
  // 返回固定 provider 参数对象。
  return {
    openai: {
      // 禁用 provider 侧存储。
      store: false,
    },
  };
}
