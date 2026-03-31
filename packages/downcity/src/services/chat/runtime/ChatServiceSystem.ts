/**
 * ChatServiceSystem：chat service 的 system prompt 组装模块。
 *
 * 关键点（中文）
 * - chat service prompt 与 channel prompt 都属于静态资产。
 * - 当前请求只注入当前 channel 的 prompt，避免平台规则串味。
 * - 该模块只负责 prompt 解析与拼装，不承担运行态控制职责。
 */

import { readFileSync } from "node:fs";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import {
  buildCurrentChatEnvironmentPrompt,
  resolveCurrentChatEnvironmentPromptInput,
} from "@services/chat/runtime/SystemPrompt.js";

const CHAT_DIRECT_PROMPT_FILE_URL = new URL("../PROMPT.direct.txt", import.meta.url);
const TELEGRAM_DIRECT_PROMPT_FILE_URL = new URL(
  "../channels/telegram/PROMPT.direct.txt",
  import.meta.url,
);
const FEISHU_DIRECT_PROMPT_FILE_URL = new URL(
  "../channels/feishu/PROMPT.direct.txt",
  import.meta.url,
);
const QQ_DIRECT_PROMPT_FILE_URL = new URL(
  "../channels/qq/PROMPT.direct.txt",
  import.meta.url,
);

/**
 * 加载 chat service 使用说明提示词。
 *
 * 关键点（中文）
 * - 启动阶段即加载，缺失时直接抛错，避免静默失效。
 */
function loadChatServicePrompt(fileUrl: URL): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load chat service prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_SERVICE_PROMPT = loadChatServicePrompt(CHAT_DIRECT_PROMPT_FILE_URL);

/**
 * 加载单个 channel 提示词。
 *
 * 关键点（中文）
 * - channel 提示词属于强依赖资产，缺失时直接抛错，避免运行时悄悄丢失规则。
 */
function loadChatChannelPrompt(fileUrl: URL, channelName: string): string {
  try {
    return readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load ${channelName} chat channel prompt from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

const CHAT_CHANNEL_PROMPTS: Record<"telegram" | "feishu" | "qq", string> = {
  telegram: loadChatChannelPrompt(
    TELEGRAM_DIRECT_PROMPT_FILE_URL,
    "telegram-direct",
  ),
  feishu: loadChatChannelPrompt(FEISHU_DIRECT_PROMPT_FILE_URL, "feishu-direct"),
  qq: loadChatChannelPrompt(QQ_DIRECT_PROMPT_FILE_URL, "qq-direct"),
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
  context: ExecutionContext,
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
  context: ExecutionContext,
): Promise<string> {
  return [
    CHAT_SERVICE_PROMPT,
    await buildCurrentChatEnvironmentPrompt(context),
    ...(await buildCurrentChannelPrompts(context)),
  ]
    .filter(Boolean)
    .join("\n\n");
}
