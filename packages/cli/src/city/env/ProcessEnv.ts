/**
 * 平台全局环境变量读取与合并模块。
 *
 * 职责说明（中文）
 * - 从平台 store 读取 global env。
 * - 为 City 宿主提供显式 env 合并能力，避免让 `@downcity/agent` 直接依赖 `process.env`。
 *
 * 边界说明（中文）
 * - 这里只处理 global env，不处理项目 `.env`。
 * - 不负责 session 级运行时元信息（例如 `DC_SESSION_ID`）。
 */

import { PlatformStore } from "@/city/runtime/store/index.js";

const PLATFORM_SESSION_ENV_KEYS = new Set([
  "CITY_ID",
  "CITY_ADMIN_SECRET_KEY",
  "CITY_URL",
  "CITY_USER_TOKEN",
  "DC_AUTH_TOKEN",
  "DC_AGENT_TOKEN",
  "DOWNCITY_CITY_ID",
  "DOWNCITY_CITY_ADMIN_SECRET_KEY",
  "DOWNCITY_CITY_URL",
  "DOWNCITY_CITY_USER_TOKEN",
]);

/**
 * 读取平台 global env 映射。
 */
export function readPlatformGlobalEnv(): Record<string, string> {
  const store = new PlatformStore();
  try {
    return store.getEnvMapSync();
  } catch {
    return {};
  } finally {
    store.close();
  }
}

/**
 * 移除不允许由平台 global env 注入的会话/身份变量。
 */
export function stripPlatformSessionEnv(
  env: Record<string, string>,
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (PLATFORM_SESSION_ENV_KEYS.has(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

/**
 * 合并平台 global env 到目标环境变量映射。
 *
 * 关键点（中文）
 * - 平台 global env 视为运行配置，只补充当前进程缺失的变量。
 * - 平台 global env 不能覆盖当前 CLI 登录态、本机控制 token 或 admin secret。
 * - 显式 shell env 仍保留最高优先级，便于脚本化调试。
 * - 返回新对象，不直接修改传入参数。
 */
export function mergeProcessEnvWithPlatformGlobalEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  const platformEnv = stripPlatformSessionEnv(readPlatformGlobalEnv());
  return {
    ...platformEnv,
    ...merged,
  };
}
