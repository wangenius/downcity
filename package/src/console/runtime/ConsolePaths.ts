/**
 * ConsolePaths：Console（全局控制面）相关路径规则。
 *
 * 关键点（中文）
 * - console 运行在用户目录 `~/.ship/` 下，作为“全局中台”。
 * - `~/.ship/ship.json`：console 的默认配置（模型、插件等全局配置）。
 * - `~/.ship/ship.db`：console 的 SQLite 模型池（providers/models）。
 * - `~/.ship/.env`：console 的默认环境变量（例如 API Key）。
 * - `~/.ship/console/*`：console 进程与 registry 的运行文件（pid/log/agents）。
 */

import os from "node:os";
import path from "node:path";

/**
 * console 根目录（用户级）。
 */
export function getConsoleRootDirPath(): string {
  return path.join(os.homedir(), ".ship");
}

/**
 * console 默认 ship.json 路径（用户级）。
 */
export function getConsoleShipJsonPath(): string {
  return path.join(getConsoleRootDirPath(), "ship.json");
}

/**
 * console 默认 SQLite 数据库路径（用户级）。
 */
export function getConsoleShipDbPath(): string {
  return path.join(getConsoleRootDirPath(), "ship.db");
}

/**
 * console 默认 .env 路径（用户级）。
 */
export function getConsoleDotenvPath(): string {
  return path.join(getConsoleRootDirPath(), ".env");
}

/**
 * console 运行目录（pid/log/registry）。
 */
export function getConsoleRuntimeDirPath(): string {
  return path.join(getConsoleRootDirPath(), "console");
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
