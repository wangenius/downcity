import type {
  FeishuAttachmentType,
  ParsedFeishuAttachmentCommand,
} from "@services/chat/types/FeishuAttachment.js";
import { parseChatMessageMarkup } from "@services/chat/runtime/ChatMessageMarkup.js";

/**
 * Feishu channel 公共工具。
 *
 * 关键点（中文）
 * - 解析回复文本中的 `<file ...>` 附件标签。
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
 * 从文本中解析 `<file>` 附件标签。
 *
 * 说明（中文）
 * - `<file>` 标签会从正文中移除并写入 attachments。
 * - 其他自然语言正文保持原样，支持正文与附件混写。
 */
export function parseFeishuAttachments(text: string): {
  text: string;
  attachments: ParsedFeishuAttachmentCommand[];
  segments: Array<
    | {
        kind: "text";
        text: string;
      }
    | {
        kind: "attachment";
        attachment: ParsedFeishuAttachmentCommand;
      }
  >;
} {
  const parsed = parseChatMessageMarkup(text);
  const attachments: ParsedFeishuAttachmentCommand[] = parsed.files.map((file) => ({
    type: normalizeAttachmentType(file.type),
    pathOrUrl: String(file.path || "").trim(),
    ...(typeof file.caption === "string" && file.caption.trim()
      ? { caption: file.caption.trim() }
      : {}),
  })).filter((item) => item.pathOrUrl);

  const segments = parsed.segments.flatMap((segment) => {
    if (segment.kind === "text") {
      return segment.text
        ? [{
            kind: "text" as const,
            text: segment.text,
          }]
        : [];
    }
    const attachment = {
      type: normalizeAttachmentType(segment.file.type),
      pathOrUrl: String(segment.file.path || "").trim(),
      ...(typeof segment.file.caption === "string" && segment.file.caption.trim()
        ? { caption: segment.file.caption.trim() }
        : {}),
    } satisfies ParsedFeishuAttachmentCommand;
    if (!attachment.pathOrUrl) return [];
    return [{
      kind: "attachment" as const,
      attachment,
    }];
  });

  return {
    text: parsed.bodyText,
    attachments,
    segments,
  };
}
