/**
 * CityPaths：用户级平台路径规则。
 *
 * 关键点（中文）
 * - Downcity 的用户级根目录固定在 `~/.downcity/`，测试可用 `DC_PLATFORM_ROOT` 覆盖。
 * - `downcity.db` 保存 City 本地加密状态。
 * - `federation.db` 保存 downfed / Federation 管理端加密状态。
 * - Agent 项目列表等全局索引进入数据库，不再写 `main/agents.json`。
 */

import os from "node:os";
import path from "node:path";

/**
 * 全局根目录（用户级）。
 *
 * 关键点（中文）
 * - 测试或多实例隔离场景可通过 `DC_PLATFORM_ROOT` 显式覆盖。
 */
export function getPlatformRootDirPath(): string {
  const explicitRoot = String(process.env.DC_PLATFORM_ROOT || "").trim();
  if (explicitRoot) return path.resolve(explicitRoot);
  return path.join(os.homedir(), ".downcity");
}

/**
 * 全局 SQLite 数据库路径（用户级）。
 */
export function getPlatformStoreDbPath(): string {
  return path.join(getPlatformRootDirPath(), "downcity.db");
}

/**
 * Federation 管理端 SQLite 数据库路径（用户级）。
 */
export function getFederationStoreDbPath(): string {
  return path.join(getPlatformRootDirPath(), "federation.db");
}

/**
 * City 全局运行目录（平台密钥 / 旧运行态文件）。
 */
export function getCityRuntimeDirPath(): string {
  return path.join(getPlatformRootDirPath(), "main");
}

/**
 * 全局加密存储密钥文件路径。
 */
export function getPlatformStoreKeyPath(): string {
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
 * 旧 Console gateway pid 文件路径。
 *
 * 关键点（中文）：仅保留路径约定，便于后续迁移或清理旧安装状态文件。
 */
export function getGatewayPidPath(): string {
  return path.join(getCityRuntimeDirPath(), "gateway.pid");
}

/**
 * 旧 Console gateway 元数据路径。
 *
 * 关键点（中文）：仅保留路径约定，便于后续迁移或清理旧安装状态文件。
 */
export function getGatewayMetaPath(): string {
  return path.join(getCityRuntimeDirPath(), "gateway.json");
}
