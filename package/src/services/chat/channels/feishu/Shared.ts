import type {
  FeishuAttachmentType,
  ParsedFeishuAttachmentCommand,
} from "@services/chat/types/FeishuAttachment.js";

/**
 * Feishu channel 公共工具。
 *
 * 关键点（中文）
 * - 解析回复文本中的 `@attach ...` 指令。
 * - 返回“净化后的正文 + 附件列表”，便于出站顺序发送。
 */

function normalizeAttachmentType(value: string): FeishuAttachmentType {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "image" || raw === "photo") return "photo";
  if (raw === "file" || raw === "document") return "document";
  if (raw === "video") return "video";
  if (raw === "audio") return "audio";
  return "voice";
}

/**
 * 从文本中解析 `@attach` 指令。
 *
 * 说明（中文）
 * - 匹配行会从正文中移除并写入 attachments。
 * - 未匹配行保持原样，支持普通文本与附件指令混写。
 */
export function parseFeishuAttachments(text: string): {
  text: string;
  attachments: ParsedFeishuAttachmentCommand[];
} {
  const raw = String(text || "");
  const lines = raw.split("\n");
  const attachments: ParsedFeishuAttachmentCommand[] = [];
  const kept: string[] = [];

  for (const line of lines) {
    const matched = line.match(
      /^\s*@attach\s+(photo|image|document|file|voice|audio|video)\s+(.+?)(?:\s*\|\s*(.+))?\s*$/i,
    );
    if (!matched) {
      kept.push(line);
      continue;
    }

    const pathOrUrl = String(matched[2] || "").trim();
    if (!pathOrUrl) continue;
    const caption =
      typeof matched[3] === "string" ? String(matched[3]).trim() : "";
    attachments.push({
      type: normalizeAttachmentType(matched[1] || ""),
      pathOrUrl,
      ...(caption ? { caption } : {}),
    });
  }

  return {
    text: kept.join("\n").trim(),
    attachments,
  };
}
