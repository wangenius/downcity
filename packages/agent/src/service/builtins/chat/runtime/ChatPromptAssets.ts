/**
 * ChatPromptAssets：chat service 静态提示词资产。
 *
 * 关键点（中文）
 * - prompt 文本真实来源是 `*.ts.txt` 文本文件。
 * - 这里统一做 `trim()`，避免多渠道 prompt 行为不一致。
 */

import chatServicePromptText from "@/service/builtins/chat/PROMPT.direct.js";
import feishuChatPromptText from "@/service/builtins/chat/channels/feishu/PROMPT.direct.js";
import qqChatPromptText from "@/service/builtins/chat/channels/qq/PROMPT.direct.js";
import telegramChatPromptText from "@/service/builtins/chat/channels/telegram/PROMPT.direct.js";

/**
 * chat service 基础 prompt。
 */
export const CHAT_SERVICE_PROMPT = chatServicePromptText.trim();

/**
 * 飞书 channel prompt。
 */
export const FEISHU_CHAT_CHANNEL_PROMPT = feishuChatPromptText.trim();

/**
 * QQ channel prompt。
 */
export const QQ_CHAT_CHANNEL_PROMPT = qqChatPromptText.trim();

/**
 * Telegram channel prompt。
 */
export const TELEGRAM_CHAT_CHANNEL_PROMPT = telegramChatPromptText.trim();
