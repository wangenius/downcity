/**
 * SessionAttachmentMapper：把 `<file>` 附件描述映射为模型可消费的 file parts。
 *
 * 关键点（中文）
 * - 兼容 Telegram / Feishu / TUI 等统一的 `<file>` 协议入口。
 * - 仅在本轮执行的内存消息上追加 file parts，不修改持久化历史。
 * - 当前只为图片与 PDF 注入 file part，保持多模态模型可直接消费。
 */

import fs from "fs-extra";
import path from "node:path";
import {
  isFileUIPart,
  isTextUIPart,
  type FileUIPart,
} from "ai";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import { parseChatMessageMarkup } from "../../services/chat/runtime/ChatMessageMarkup.js";

/**
 * 从 `<file>` 标签中解析附件描述。
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
 */
export async function injectFilePartsFromAttachments(
  messages: SessionMessageV1[],
): Promise<SessionMessageV1[]> {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const cwd = process.cwd();
  const out: SessionMessageV1[] = [];

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
