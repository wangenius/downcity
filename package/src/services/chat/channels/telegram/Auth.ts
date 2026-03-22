import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import { resolveOwnerMatch } from "@services/chat/runtime/AuthorizationPolicy.js";
import { readChatAuthorizationConfigSync } from "@services/chat/runtime/AuthorizationConfig.js";

/**
 * Telegram channel 鉴权模块。
 *
 * 关键点（中文）
 * - 仅负责 Telegram 的主人身份判定。
 * - 仅依赖运行时环境变量 `TELEGRAM_AUTH_ID`（通常由 channel account 注入）。
 */

function normalizeAuthId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  // init 模板占位值不应参与鉴权
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

function readTelegramAuthId(params: {
  env?: Record<string, string>;
}): string | undefined {
  const envAuthId = normalizeAuthId(params.env?.TELEGRAM_AUTH_ID);
  return envAuthId;
}

/**
 * 判定 Telegram 用户身份状态。
 */
export function resolveTelegramMasterStatus(params: {
  config: ShipConfig;
  env?: Record<string, string>;
  userId?: string;
  rootPath?: string;
}): ChatMasterStatus {
  const legacyAuthId = readTelegramAuthId({
    env: params.env,
  });
  const authorizationConfig = params.rootPath
    ? readChatAuthorizationConfigSync(params.rootPath)
    : undefined;
  return resolveOwnerMatch({
    config: params.config,
    channel: "telegram",
    env: legacyAuthId ? { TELEGRAM_AUTH_ID: legacyAuthId } : params.env,
    userId: params.userId,
    authorizationConfig,
  });
}
