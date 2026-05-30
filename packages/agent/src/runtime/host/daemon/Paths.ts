/**
 * Agent daemon 路径模块。
 *
 * 关键点（中文）
 * - 这里只保留 agent 侧访问 daemon meta 所需的项目级路径。
 * - daemon 进程启停、pid 清理、registry 同步属于 `downcity`，不放在 agent 包内。
 */

import path from "node:path";
import { getDowncityDebugDirPath } from "@/config/Paths.js";
import {
  DAEMON_LOG_FILENAME,
  DAEMON_META_FILENAME,
  DAEMON_PID_FILENAME,
} from "@/types/runtime/daemon/Daemon.js";

/**
 * 计算 daemon pid 文件路径。
 */
export const getDaemonPidPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_PID_FILENAME);

/**
 * 计算 daemon 日志文件路径。
 */
export const getDaemonLogPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_LOG_FILENAME);

/**
 * 计算 daemon 元数据文件路径。
 */
export const getDaemonMetaPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_META_FILENAME);
