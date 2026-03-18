import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";

/**
 * Telegram channel 鉴权模块。
 *
 * 关键点（中文）
 * - 仅负责 Telegram 的主人身份判定。
 * - 配置优先级：`ship.json` 的 `services.chat.channels.telegram.auth_id` > `TELEGRAM_AUTH_ID`。
 */

function normalizeAuthId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  // init 模板占位值不应参与鉴权
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

function readTelegramAuthId(params: {
  config?: ShipConfig;
  env?: Record<string, string>;
}): string | undefined {
  const configAuthId = normalizeAuthId(
    params.config?.services?.chat?.channels?.telegram?.auth_id,
  );
  const envAuthId = normalizeAuthId(params.env?.TELEGRAM_AUTH_ID);
  return configAuthId || envAuthId;
}

/**
 * 判定 Telegram 用户身份状态。
 */
export function resolveTelegramMasterStatus(params: {
  config?: ShipConfig;
  env?: Record<string, string>;
  userId?: string;
}): ChatMasterStatus {
  const userId = normalizeAuthId(params.userId);
  if (!userId) return "unknown";
  const authId = readTelegramAuthId({
    config: params.config,
    env: params.env,
  });
  if (!authId) return "unknown";
  return userId === authId ? "master" : "guest";
}
