/**
 * 查询后台 Agent Runtime（daemon）状态。
 *
 * 对应命令：
 * - `sma agent status [path]`
 */

import path from "path";
import fs from "fs-extra";
import {
  diagnoseDaemonStaleReasons,
  getDaemonLogPath,
  isProcessAlive,
  readDaemonMeta,
  readDaemonPid,
} from "@/console/daemon/Manager.js";
import { getProfileMdPath, getShipJsonPath } from "@/console/env/Paths.js";
import {
  printPanel,
  renderKeyValueLines,
  type StatusTone,
} from "@/utils/cli/PrettyStatus.js";

/**
 * daemon 状态查询入口。
 *
 * 状态规则（中文）
 * - 运行中：输出 pid / log / startedAt
 * - 已初始化但未运行：输出 not running
 * - 未初始化：提示执行 `sma agent create`
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
  const logPath = getDaemonLogPath(projectRoot);

  const rows: Array<[string, string]> = [
    ["project", projectRoot],
    ["log", logPath],
  ];
  let tone: StatusTone = "neutral";

  if (pid && isProcessAlive(pid)) {
    const meta = await readDaemonMeta(projectRoot);

    tone = "success";
    rows.push(["state", "running"]);
    rows.push(["pid", String(pid)]);
    if (meta?.startedAt) {
      rows.push(["started_at", meta.startedAt]);
    }
    if (missingInitFiles.length > 0) {
      // 关键点（中文）：运行中但初始化文件不完整时仍给出告警，便于排查异常目录变更。
      rows.push(["warning", `missing init files: ${missingInitFiles.join(", ")}`]);
    }
    printPanel({
      title: "sma agent status",
      tone,
      lines: renderKeyValueLines(rows),
    });
    return;
  }

  if (pid) {
    tone = "warning";
    rows.push(["state", "stale"]);
    rows.push(["stale_pid", String(pid)]);
    const reasons = await diagnoseDaemonStaleReasons(projectRoot, pid);
    rows.push(["stale_reason", reasons.map((item) => item.message).join("; ")]);
    rows.push(["fix", `sma agent doctor ${projectRoot} --fix`]);
    printPanel({
      title: "sma agent status",
      tone,
      lines: renderKeyValueLines(rows),
    });
    return;
  }

  if (missingInitFiles.length > 0) {
    tone = "error";
    rows.push(["state", "not_initialized"]);
    rows.push(["missing", missingInitFiles.join(", ")]);
    rows.push(["fix", 'run "sma agent create" first']);
    printPanel({
      title: "sma agent status",
      tone,
      lines: renderKeyValueLines(rows),
    });
    return;
  }

  tone = "info";
  rows.push(["state", "stopped"]);
  printPanel({
    title: "sma agent status",
    tone,
    lines: renderKeyValueLines(rows),
  });
}
