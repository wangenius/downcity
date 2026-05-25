/**
 * Voice 入站消息增强 hook。
 *
 * 关键点（中文）
 * - 只处理 voice/audio 附件，转写结果作为 plugin section 注入。
 * - 转写失败不阻塞主链路，保持 best-effort。
 */

import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { ChatInboundAugmentInput } from "@/plugin/builtins/chat/types/ChatPlugin.js";
import type { JsonValue } from "@/types/common/Json.js";
import { transcribeWithVoiceDependency } from "@/plugin/builtins/voice/Dependency.js";

/**
 * 自动转写入站语音附件。
 */
export async function augmentVoiceInboundMessage(params: {
  context: AgentContext;
  value: JsonValue;
}): Promise<JsonValue> {
  const input = params.value as unknown as ChatInboundAugmentInput;
  const voiceAttachments = (Array.isArray(input.attachments) ? input.attachments : []).filter(
    (item) =>
      (item.kind === "voice" || item.kind === "audio") &&
      typeof item.path === "string" &&
      item.path.trim(),
  );
  if (voiceAttachments.length === 0) {
    return input as unknown as JsonValue;
  }

  const pluginSections = Array.isArray(input.pluginSections)
    ? [...input.pluginSections]
    : [];

  for (const attachment of voiceAttachments) {
    try {
      const result = await transcribeWithVoiceDependency({
        context: params.context,
        audioPath: String(attachment.path || "").trim(),
      });
      const text = typeof result.text === "string" ? result.text.trim() : "";
      if (!text) continue;

      const absPath = String(attachment.path || "").trim();
      const rel = absPath.startsWith(`${params.context.rootPath}/`)
        ? absPath.slice(params.context.rootPath.length + 1)
        : absPath;
      pluginSections.push(`【语音转写 ${attachment.kind}: ${rel}】\n${text}`);
    } catch {
      // 关键点（中文）：转写失败不阻塞主链路，保持 best-effort。
    }
  }

  return {
    ...input,
    pluginSections,
  } as unknown as JsonValue;
}
