import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";

/**
 * QQ channel 鉴权模块。
 *
 * 关键点（中文）
 * - 仅负责 QQ 的主人身份判定。
 * - 配置优先级：`ship.json` 的 `services.chat.channels.qq.auth_id` > `QQ_AUTH_ID`。
 */

function normalizeAuthId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

function readQqAuthId(config?: ShipConfig): string | undefined {
  const configAuthId = normalizeAuthId(config?.services?.chat?.channels?.qq?.auth_id);
  const envAuthId = normalizeAuthId(process.env.QQ_AUTH_ID);
  return configAuthId || envAuthId;
}

/**
 * 判定 QQ 用户身份状态。
 */
export function resolveQqMasterStatus(params: {
  config?: ShipConfig;
  userId?: string;
}): ChatMasterStatus {
  const userId = normalizeAuthId(params.userId);
  if (!userId) return "unknown";
  const authId = readQqAuthId(params.config);
  if (!authId) return "unknown";
  return userId === authId ? "master" : "guest";
}
