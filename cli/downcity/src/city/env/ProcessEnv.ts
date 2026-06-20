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
 * 合并平台 global env 到目标环境变量映射。
 *
 * 关键点（中文）
 * - 平台 global env 视为宿主层统一真相，应覆盖基础进程环境中的同名键。
 * - 返回新对象，不直接修改传入参数。
 */
export function mergeProcessEnvWithPlatformGlobalEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  return {
    ...merged,
    ...readPlatformGlobalEnv(),
  };
}
