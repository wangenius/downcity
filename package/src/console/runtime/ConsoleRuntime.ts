/**
 * ConsoleRuntime：console 进程状态工具。
 *
 * 关键点（中文）
 * - console 是全局控制面：用于统一管理/观测多个 agent daemon。
 * - agent daemon 启动前必须确保 console 已启动（强约束）。
 */

import fs from "fs-extra";
import { getConsolePidPath } from "./ConsolePaths.js";

/**
 * 读取 console pid（读取失败或内容非法返回 null）。
 */
export async function readConsolePid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getConsolePidPath(), "utf-8");
    const pid = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * 判断 console 进程是否存活。
 */
export function isConsoleProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判断 console 是否在运行（基于 pid file + 判活）。
 */
export async function isConsoleRunning(): Promise<boolean> {
  const pid = await readConsolePid();
  if (!pid) return false;
  return isConsoleProcessAlive(pid);
}

