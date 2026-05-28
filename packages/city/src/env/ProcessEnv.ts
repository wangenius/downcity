/**
 * 平台全局环境变量注入模块。
 *
 * 职责说明（中文）
 * - 从平台 store 读取 global env，并注入到当前进程或待启动子进程环境。
 * - 让 `@downcity/agent` 只需要读取 `process.env`，不再感知平台 store 细节。
 *
 * 边界说明（中文）
 * - 这里只处理 global env，不处理项目 `.env`。
 * - 不负责 session 级运行时元信息（例如 `DC_SESSION_ID`）。
 */

import { PlatformStore } from "@/platform/store/index.js";

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
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    ...readPlatformGlobalEnv(),
  };
}

/**
 * 把平台 global env 注入当前进程。
 *
 * 关键点（中文）
 * - 仅在 `@downcity/city` 宿主启动链路中调用。
 * - 这样后续 `@downcity/agent` 内部读取到的 `process.env` 就已经包含平台 global env。
 */
export function applyPlatformGlobalEnvToProcess(): void {
  const merged = mergeProcessEnvWithPlatformGlobalEnv(process.env);
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue;
    process.env[key] = String(value);
  }
}
