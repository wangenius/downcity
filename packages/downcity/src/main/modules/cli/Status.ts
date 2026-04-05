/**
 * 查询后台 Agent 进程（daemon）状态。
 *
 * 对应命令：
 * - `city agent status [path]`
 */

import path from "path";
import fs from "fs-extra";
import {
  diagnoseDaemonStaleReasons,
  isProcessAlive,
  readDaemonMeta,
  readDaemonPid,
} from "@/main/city/daemon/Manager.js";
import { getProfileMdPath, getDowncityJsonPath } from "@/main/city/env/Paths.js";
import { emitCliBlock } from "./CliReporter.js";

/**
 * daemon 状态查询入口。
 *
 * 状态规则（中文）
 * - 运行中：输出 pid / log / startedAt
 * - 已初始化但未运行：输出 not running
 * - 未初始化：提示执行 `city agent create`
 */
export async function statusCommand(cwd: string = "."): Promise<void> {
  const projectRoot = path.resolve(cwd);
  const missingInitFiles: string[] = [];

  if (!fs.existsSync(getProfileMdPath(projectRoot))) {
    missingInitFiles.push("PROFILE.md");
  }
  if (!fs.existsSync(getDowncityJsonPath(projectRoot))) {
    missingInitFiles.push("downcity.json");
  }

  const pid = await readDaemonPid(projectRoot);

  if (pid && isProcessAlive(pid)) {
    const meta = await readDaemonMeta(projectRoot);

    emitCliBlock({
      tone: "success",
      title: "Agent status",
      summary: "running",
      facts: [
        ["project", projectRoot],
        ...(meta?.startedAt ? [["started at", meta.startedAt]] : []),
        ...(missingInitFiles.length > 0
          ? [["warning", `missing init files: ${missingInitFiles.join(", ")}`]]
          : []),
      ].map(([label, value]) => ({ label, value })),
    });
    return;
  }

  if (pid) {
    const reasons = await diagnoseDaemonStaleReasons(projectRoot, pid);
    emitCliBlock({
      tone: "warning",
      title: "Agent status",
      summary: "stale",
      facts: [
        {
          label: "project",
          value: projectRoot,
        },
        {
          label: "reason",
          value: reasons.map((item) => item.message).join("; "),
        },
        {
          label: "fix",
          value: `city agent doctor ${projectRoot} --fix`,
        },
      ],
    });
    return;
  }

  if (missingInitFiles.length > 0) {
    emitCliBlock({
      tone: "error",
      title: "Agent status",
      summary: "not initialized",
      facts: [
        {
          label: "project",
          value: projectRoot,
        },
        {
          label: "missing",
          value: missingInitFiles.join(", "),
        },
        {
          label: "fix",
          value: 'run "city agent create" first',
        },
      ],
    });
    return;
  }

  emitCliBlock({
    tone: "info",
    title: "Agent status",
    summary: "stopped",
    facts: [
      {
        label: "project",
        value: projectRoot,
      },
    ],
  });
}
