/**
 * StudioPaths：Studio 全局运行态与 control plane 共享的路径规则。
 *
 * 关键点（中文）
 * - Downcity 的全局根目录固定在用户目录 `~/.downcity/`。
 * - `~/.downcity/downcity.db`：全局 SQLite 数据库，保存模型池与平台级配置。
 * - `~/.downcity/main/*`：studio 后台与 control plane 共享的运行文件目录。
 * - 这里定义的是“全局路径约定”，不是单个 agent 项目的 `.downcity/` 路径。
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
 * Studio 全局运行目录（pid/log/registry）。
 */
export function getStudioRuntimeDirPath(): string {
  return path.join(getPlatformRootDirPath(), "main");
}

/**
 * 全局模型存储密钥文件路径。
 */
export function getPlatformStoreKeyPath(): string {
  return path.join(getStudioRuntimeDirPath(), "model-db.key");
}

/**
 * studio 后台 pid 文件路径。
 */
export function getStudioPidPath(): string {
  // 关键点（中文）：暂时保留旧文件名，避免已运行的本机 Studio 状态失联。
  return path.join(getStudioRuntimeDirPath(), "city.pid");
}

/**
 * studio 后台日志路径（stdout/stderr 合并）。
 */
export function getStudioLogPath(): string {
  // 关键点（中文）：暂时保留旧文件名，避免历史日志路径突然断裂。
  return path.join(getStudioRuntimeDirPath(), "city.log");
}

/**
 * control plane pid 文件路径。
 */
export function getControlPlanePidPath(): string {
  return path.join(getStudioRuntimeDirPath(), "control-plane.pid");
}

/**
 * control plane 日志路径（stdout/stderr 合并）。
 */
export function getControlPlaneLogPath(): string {
  return path.join(getStudioRuntimeDirPath(), "control-plane.log");
}

/**
 * control plane 元数据路径。
 */
export function getControlPlaneMetaPath(): string {
  return path.join(getStudioRuntimeDirPath(), "control-plane.json");
}

/**
 * 受管 agent registry 文件路径（Studio 维护的 agent 清单）。
 */
export function getManagedAgentRegistryPath(): string {
  return path.join(getStudioRuntimeDirPath(), "agents.json");
}
