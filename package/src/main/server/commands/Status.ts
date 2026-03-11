/**
 * 查询后台 Agent Runtime（daemon）状态。
 *
 * 对应命令：
 * - `sma status [path]`
 * - `sma agent status [path]`
 */

import path from "path";
import fs from "fs-extra";
import {
  cleanupStaleDaemonFiles,
  getDaemonLogPath,
  getDaemonMetaPath,
  isProcessAlive,
  readDaemonPid,
} from "@/main/server/daemon/Manager.js";
import { getProfileMdPath, getShipJsonPath } from "@/main/server/env/Paths.js";
import type { DaemonMeta } from "@main/types/Daemon.js";

/**
 * 安全读取 daemon 元数据。
 */
async function readDaemonMeta(projectRoot: string): Promise<DaemonMeta | null> {
  try {
    const value = await fs.readJson(getDaemonMetaPath(projectRoot));
    const pid = Number((value as { pid?: unknown })?.pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const startedAt = String(
      (value as { startedAt?: unknown })?.startedAt || "",
    ).trim();
    if (!startedAt) return null;
    return value as DaemonMeta;
  } catch {
    return null;
  }
}

/**
 * daemon 状态查询入口。
 *
 * 状态规则（中文）
 * - 运行中：输出 pid / log / startedAt
 * - 已初始化但未运行：输出 not running
 * - 未初始化：提示执行 `shipmyagent init`
 */
export async function statusCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(cwd);
  const missingInitFiles: string[] = [];

  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    missingInitFiles.push("PROFILE.md");
  }
  if (!fs.existsSync(getShipJsonPath(projectRoot))) {
    missingInitFiles.push("ship.json");
  }

  const pid = await readDaemonPid(projectRoot);
  if (pid && isProcessAlive(pid)) {
    const meta = await readDaemonMeta(projectRoot);

    console.log("✅ ShipMyAgent daemon is running");
    console.log(`   project: ${projectRoot}`);
    console.log(`   pid: ${pid}`);
    console.log(`   log: ${getDaemonLogPath(projectRoot)}`);
    if (meta?.startedAt) {
      console.log(`   startedAt: ${meta.startedAt}`);
    }
    if (missingInitFiles.length > 0) {
      // 关键点（中文）：运行中但初始化文件不完整时仍给出告警，便于排查异常目录变更。
      console.log(`⚠️  Missing init files: ${missingInitFiles.join(", ")}`);
    }
    return;
  }

  if (pid) {
    await cleanupStaleDaemonFiles(projectRoot);
    console.log("⚠️  Daemon pid file exists but process is not running; cleaned up");
  }

  if (missingInitFiles.length > 0) {
    console.error(
      '❌ Project not initialized. Please run "shipmyagent init" first',
    );
    console.log(`   project: ${projectRoot}`);
    console.log(`   missing: ${missingInitFiles.join(", ")}`);
    return;
  }

  console.log("ℹ️  ShipMyAgent daemon is not running");
  console.log(`   project: ${projectRoot}`);
  console.log(`   log: ${getDaemonLogPath(projectRoot)}`);
}
