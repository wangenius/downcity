/**
 * ChatServiceSystem：chat service 的 system prompt 组装模块。
 *
 * 关键点（中文）
 * - chat service prompt 与 channel prompt 都属于静态资产。
 * - 当前请求只注入当前 channel 的 prompt，避免平台规则串味。
 * - 该模块只负责 prompt 解析与拼装，不承担运行态控制职责。
 */
import type { AgentContext } from "@/agent/AgentContextTypes.js";
import {
  buildCurrentChatEnvironmentPrompt,
  resolveCurrentChatEnvironmentPromptInput,
} from "@/service/builtins/chat/runtime/SystemPrompt.js";
import {
  CHAT_SERVICE_PROMPT,
  FEISHU_CHAT_CHANNEL_PROMPT,
  QQ_CHAT_CHANNEL_PROMPT,
  TELEGRAM_CHAT_CHANNEL_PROMPT,
} from "@/service/builtins/chat/runtime/ChatPromptAssets.js";

const CHAT_CHANNEL_PROMPTS: Record<"telegram" | "feishu" | "qq", string> = {
  telegram: TELEGRAM_CHAT_CHANNEL_PROMPT,
  feishu: FEISHU_CHAT_CHANNEL_PROMPT,
  qq: QQ_CHAT_CHANNEL_PROMPT,
};

function resolveCurrentChatPromptChannel(
  channel: string,
): "telegram" | "feishu" | "qq" | null {
  if (channel === "telegram" || channel === "feishu" || channel === "qq") {
    return channel;
  }
  return null;
}

/**
 * 构建当前请求所属 channel 的提示词片段。
 *
 * 关键点（中文）
 * - 仅注入当前 context 对应的 channel prompt，避免把其他平台规则混入本轮会话。
 * - 若当前 context 不是 chat channel（如 consoleui）或尚无路由元信息，则不注入 channel prompt。
 */
export async function buildCurrentChannelPrompts(
  context: AgentContext,
): Promise<string[]> {
  const chatEnvironment = await resolveCurrentChatEnvironmentPromptInput(context);
  if (!chatEnvironment) return [];
  const channel = resolveCurrentChatPromptChannel(
    String(chatEnvironment.channel || "")
      .trim()
      .toLowerCase(),
  );
  if (!channel) return [];
  return [CHAT_CHANNEL_PROMPTS[channel]].filter(Boolean);
}

/**
 * 构建 chat service 注入到 session 的 system 文本。
 */
export async function buildChatServiceSystem(
  context: AgentContext,
): Promise<string> {
  return [
    CHAT_SERVICE_PROMPT,
    await buildCurrentChatEnvironmentPrompt(context),
    ...(await buildCurrentChannelPrompts(context)),
  ]
    .filter(Boolean)
    .join("\n\n");
}
