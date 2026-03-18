import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";

/**
 * Feishu channel 鉴权模块。
 *
 * 关键点（中文）
 * - 仅负责 Feishu 的主人身份判定。
 * - 配置优先级：`ship.json` 的 `services.chat.channels.feishu.auth_id` > `FEISHU_AUTH_ID`。
 */

function normalizeAuthId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

function readFeishuAuthId(params: {
  config?: ShipConfig;
  env?: Record<string, string>;
}): string | undefined {
  const configAuthId = normalizeAuthId(
    params.config?.services?.chat?.channels?.feishu?.auth_id,
  );
  const envAuthId = normalizeAuthId(params.env?.FEISHU_AUTH_ID);
  return configAuthId || envAuthId;
}

/**
 * 判定 Feishu 用户身份状态。
 */
export function resolveFeishuMasterStatus(params: {
  config?: ShipConfig;
  env?: Record<string, string>;
  userId?: string;
}): ChatMasterStatus {
  const userId = normalizeAuthId(params.userId);
  if (!userId) return "unknown";
  const authId = readFeishuAuthId({
    config: params.config,
    env: params.env,
  });
  if (!authId) return "unknown";
  return userId === authId ? "master" : "guest";
}
