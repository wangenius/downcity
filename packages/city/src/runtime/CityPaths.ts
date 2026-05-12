/**
 * CityPaths：city 全局运行态与 Console 模块共享的路径规则。
 *
 * 关键点（中文）
 * - Downcity 的全局根目录固定在用户目录 `~/.downcity/`。
 * - `~/.downcity/downcity.db`：全局 SQLite 数据库，保存模型池与平台级配置。
 * - `~/.downcity/main/*`：city 后台与 Console 模块共享的运行文件目录。
 * - 这里定义的是“全局路径约定”，不是单个 agent 项目的 `.downcity/` 路径。
 */

import os from "node:os";
import path from "node:path";

/**
 * 全局根目录（用户级）。
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
 * 历史兼容：旧版 downcity.json 路径（当前不再使用）。
 */
export function getConsoleShipJsonPath(): string {
  return path.join(getConsoleRootDirPath(), "downcity.json");
}

/**
 * 全局 SQLite 数据库路径（用户级）。
 */
export function getConsoleShipDbPath(): string {
  return path.join(getConsoleRootDirPath(), "downcity.db");
}

/**
 * 历史兼容：旧版 .env 路径（当前不再使用）。
 */
export function getConsoleDotenvPath(): string {
  return path.join(getConsoleRootDirPath(), ".env");
}

/**
 * city 全局运行目录（pid/log/registry）。
 */
export function getCityRuntimeDirPath(): string {
  return path.join(getConsoleRootDirPath(), "main");
}

/**
 * 全局模型存储密钥文件路径。
 */
export function getConsoleModelDbKeyPath(): string {
  return path.join(getCityRuntimeDirPath(), "model-db.key");
}

/**
 * city 后台 pid 文件路径。
 */
export function getCityPidPath(): string {
  return path.join(getCityRuntimeDirPath(), "city.pid");
}

/**
 * city 后台日志路径（stdout/stderr 合并）。
 */
export function getCityLogPath(): string {
  return path.join(getCityRuntimeDirPath(), "city.log");
}

/**
 * Console 模块 pid 文件路径。
 */
export function getConsolePidPath(): string {
  return path.join(getCityRuntimeDirPath(), "console.pid");
}

/**
 * Console 模块日志路径（stdout/stderr 合并）。
 */
export function getConsoleLogPath(): string {
  return path.join(getCityRuntimeDirPath(), "console.log");
}

/**
 * Console 模块元数据路径。
 */
export function getConsoleMetaPath(): string {
  return path.join(getCityRuntimeDirPath(), "console.json");
}

/**
 * agent registry 文件路径（city 维护的运行中 agent 清单）。
 */
export function getConsoleAgentRegistryPath(): string {
  return path.join(getCityRuntimeDirPath(), "agents.json");
}
