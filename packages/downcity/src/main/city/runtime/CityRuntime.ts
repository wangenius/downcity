/**
 * CityRuntime：city 后台进程状态工具。
 *
 * 关键点（中文）
 * - city 后台负责统一管理/观测多个 agent daemon。
 * - 这里处理的是 city 后台自身的 pid 与判活，不涉及 Console 模块的 UI 进程。
 * - agent daemon 启动前必须确保 city 后台已启动（强约束）。
 */

import fs from "fs-extra";
import { getCityPidPath } from "./CityPaths.js";

/**
 * 读取 city 后台 pid（读取失败或内容非法返回 null）。
 */
export async function readCityPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getCityPidPath(), "utf-8");
    const pid = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * 判断 city 后台进程是否存活。
 */
export function isCityProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 判断 city 后台是否在运行（基于 pid file + 判活）。
 */
export async function isCityRunning(): Promise<boolean> {
  const pid = await readCityPid();
  if (!pid) return false;
  return isCityProcessAlive(pid);
}
