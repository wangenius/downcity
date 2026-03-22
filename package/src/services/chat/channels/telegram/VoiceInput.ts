import path from "node:path";
import type { Logger } from "@utils/logger/Logger.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { TelegramAttachmentType } from "./Shared.js";

/**
 * Telegram 语音附件信息。
 */
export type TelegramIncomingAttachment = {
  /**
   * 附件类型。
   */
  type: TelegramAttachmentType;
  /**
   * 附件本地绝对路径。
   */
  path: string;
  /**
   * 附件描述（可选）。
   */
  desc?: string;
};

function toTranscriptText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const text = (data as { text?: unknown }).text;
  if (typeof text !== "string") return "";
  return text.trim();
}

async function invokeAudioTranscribe(params: {
  context: ServiceRuntime;
  audioPath: string;
}): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  if (!params.context.capabilities?.has("audio.transcribe")) {
    return {
      success: false,
      error: "audio.transcribe capability is not available",
    };
  }
  return params.context.capabilities.invoke({
    capability: "audio.transcribe",
    payload: {
      audioPath: params.audioPath,
    },
  });
}

/**
 * 调用语音转写能力对 Telegram voice/audio 附件进行转写。
 *
 * 关键点（中文）
 * - 仅处理 `voice` / `audio` 类型附件。
 * - 任一附件转写失败不会中断主流程（best-effort）。
 */
export async function buildTelegramVoiceTranscriptionInstruction(params: {
  context: ServiceRuntime;
  logger: Logger;
  rootPath: string;
  chatId: string;
  messageId?: string;
  chatKey: string;
  attachments: TelegramIncomingAttachment[];
}): Promise<string> {
  const voiceItems = params.attachments.filter(
    (item) => item.type === "voice" || item.type === "audio",
  );
  if (voiceItems.length === 0) return "";

  const transcriptBlocks: string[] = [];
  for (const item of voiceItems) {
    const invoke = await invokeAudioTranscribe({
      context: params.context,
      audioPath: item.path,
    });

    if (!invoke.success) {
      params.logger.warn("Voice transcription capability failed", {
        chatId: params.chatId,
        messageId: params.messageId,
        chatKey: params.chatKey,
        attachmentType: item.type,
        attachmentPath: item.path,
        error: invoke.error,
      });
      continue;
    }

    const transcript = toTranscriptText(invoke.data);
    if (!transcript) continue;

    const rel = path.relative(params.rootPath, item.path);
    transcriptBlocks.push([
      `【语音转写 ${item.type}: ${rel}】`,
      transcript,
    ].join("\n"));
  }

  return transcriptBlocks.join("\n\n").trim();
}
