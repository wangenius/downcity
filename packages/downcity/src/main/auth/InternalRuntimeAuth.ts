/**
 * Agent runtime 内部鉴权辅助模块。
 *
 * 关键点（中文）
 * - 这条链只服务 agent 自己在 shell/task 等内部运行时里回调本机 HTTP API。
 * - 不复用统一账户 `auth_tokens` 表，也不要求用户手动登录 CLI。
 * - server 进程持有 `DC_INTERNAL_AUTH_TOKEN`，shell 子进程拿到的是映射后的 `DC_AUTH_TOKEN`。
 */

import { randomBytes } from "node:crypto";
import { AUTH_PERMISSION_KEYS, type AuthPermissionKey } from "@/types/auth/AuthPermission.js";
import type { AuthPrincipal } from "@/types/auth/AuthTypes.js";
import { extractBearerToken } from "./TokenService.js";

/**
 * agent runtime 内部 token 的环境变量名。
 */
export const INTERNAL_RUNTIME_AUTH_ENV_KEY = "DC_INTERNAL_AUTH_TOKEN";

/**
 * 读取当前 runtime 内部 token。
 */
export function readInternalRuntimeAuthToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = String(env[INTERNAL_RUNTIME_AUTH_ENV_KEY] || "").trim();
  return token || null;
}

/**
 * 确保当前进程拥有一枚 runtime 内部 token。
 */
export function ensureInternalRuntimeAuthToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const existing = readInternalRuntimeAuthToken(env);
  if (existing) return existing;
  const next = `dci_${randomBytes(24).toString("hex")}`;
  env[INTERNAL_RUNTIME_AUTH_ENV_KEY] = next;
  return next;
}

/**
 * 判断 Authorization 头是否匹配当前 runtime 内部 token。
 */
export function isInternalRuntimeBearerHeader(
  headerValue: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const token = extractBearerToken(headerValue);
  const internal = readInternalRuntimeAuthToken(env);
  if (!token || !internal) return false;
  return token === internal;
}

/**
 * 创建 runtime 内部 principal。
 */
export function createInternalRuntimeAuthPrincipal(): AuthPrincipal {
  return {
    userId: "internal-runtime",
    username: "internal-runtime",
    displayName: "Internal Runtime",
    status: "active",
    tokenId: "internal-runtime-token",
    tokenName: "internal-runtime",
    roles: ["internal-runtime"],
    permissions: [...AUTH_PERMISSION_KEYS] as AuthPermissionKey[],
  };
}
