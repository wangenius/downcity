/**
 * ConsolePaths：Console（全局控制面）相关路径规则。
 *
 * 关键点（中文）
 * - console 运行在用户目录 `~/.downcity/` 下，作为“全局中台”。
 * - `~/.downcity/downcity.db`：console 的 SQLite 数据库（模型池 + 全局配置）。
 * - `~/.downcity/main/*`：控制面进程与 registry 的运行文件（pid/log/agents）。
 */

import os from "node:os";
import path from "node:path";

/**
 * console 根目录（用户级）。
 *
 * 关键点（中文）
 * - 测试或多实例隔离场景可通过 `DC_CONSOLE_ROOT` 显式覆盖。
 */
export function getConsoleRootDirPath(): string {
  const explicitRoot = String(process.env.DC_CONSOLE_ROOT || "").trim();
  if (explicitRoot) return path.resolve(explicitRoot);
  return path.join(os.homedir(), ".downcity");
}

/**
 * 历史兼容：console 旧版 downcity.json 路径（当前不再使用）。
 */
export function getConsoleShipJsonPath(): string {
  return path.join(getConsoleRootDirPath(), "downcity.json");
}

/**
 * console 默认 SQLite 数据库路径（用户级）。
 */
export function getConsoleShipDbPath(): string {
  return path.join(getConsoleRootDirPath(), "downcity.db");
}

/**
 * 历史兼容：console 旧版 .env 路径（当前不再使用）。
 */
export function getConsoleDotenvPath(): string {
  return path.join(getConsoleRootDirPath(), ".env");
}

/**
 * console 运行目录（pid/log/registry）。
 */
export function getConsoleRuntimeDirPath(): string {
  return path.join(getConsoleRootDirPath(), "main");
}

/**
 * console pid 文件路径。
 */
export function getConsolePidPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "console.pid");
}

/**
 * console 日志路径（stdout/stderr 合并）。
 */
export function getConsoleLogPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "console.log");
}

/**
 * console ui pid 文件路径。
 */
export function getConsoleUiPidPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "ui.pid");
}

/**
 * console ui 日志路径（stdout/stderr 合并）。
 */
export function getConsoleUiLogPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "ui.log");
}

/**
 * console ui 元数据路径。
 */
export function getConsoleUiMetaPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "ui.json");
}

/**
 * console agent registry 文件路径（运行中 agent 清单）。
 */
export function getConsoleAgentRegistryPath(): string {
  return path.join(getConsoleRuntimeDirPath(), "agents.json");
}
