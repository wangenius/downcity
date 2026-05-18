/**
 * CityPaths：city 全局运行态与 control plane 共享的路径规则。
 *
 * 关键点（中文）
 * - Downcity 的全局根目录固定在用户目录 `~/.downcity/`。
 * - `~/.downcity/downcity.db`：全局 SQLite 数据库，保存模型池与平台级配置。
 * - `~/.downcity/main/*`：city 后台与 control plane 共享的运行文件目录。
 * - 这里定义的是“全局路径约定”，不是单个 agent 项目的 `.downcity/` 路径。
 */

import os from "node:os";
import path from "node:path";

/**
 * 全局根目录（用户级）。
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
 * city 全局运行目录（pid/log/registry）。
 */
export function getCityRuntimeDirPath(): string {
  return path.join(getPlatformRootDirPath(), "main");
}

/**
 * 全局模型存储密钥文件路径。
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
 * control plane pid 文件路径。
 */
export function getControlPlanePidPath(): string {
  return path.join(getCityRuntimeDirPath(), "control-plane.pid");
}

/**
 * control plane 日志路径（stdout/stderr 合并）。
 */
export function getControlPlaneLogPath(): string {
  return path.join(getCityRuntimeDirPath(), "control-plane.log");
}

/**
 * control plane 元数据路径。
 */
export function getControlPlaneMetaPath(): string {
  return path.join(getCityRuntimeDirPath(), "control-plane.json");
}

/**
 * 受管 agent registry 文件路径（city 维护的 agent 清单）。
 */
export function getManagedAgentRegistryPath(): string {
  return path.join(getCityRuntimeDirPath(), "agents.json");
}
