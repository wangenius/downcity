import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";

/**
 * QQ channel 鉴权模块。
 *
 * 关键点（中文）
 * - 仅负责 QQ 的主人身份判定。
 * - 仅依赖运行时环境变量 `QQ_AUTH_ID`（通常由 channel account 注入）。
 */

function normalizeAuthId(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\$\{[^}]+\}$/.test(text)) return undefined;
  return text;
}

function readQqAuthId(params: {
  env?: Record<string, string>;
}): string | undefined {
  const envAuthId = normalizeAuthId(params.env?.QQ_AUTH_ID);
  return envAuthId;
}

/**
 * 判定 QQ 用户身份状态。
 */
export function resolveQqMasterStatus(params: {
  env?: Record<string, string>;
  userId?: string;
}): ChatMasterStatus {
  const userId = normalizeAuthId(params.userId);
  if (!userId) return "unknown";
  const authId = readQqAuthId({
    env: params.env,
  });
  if (!authId) return "unknown";
  return userId === authId ? "master" : "guest";
}
