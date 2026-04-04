/**
 * IndexConsoleStatus：console 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 city 后台、Console 与受管 agent 的状态面板输出。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */

import {
  getConsoleRuntimeStatus,
} from "./Console.js";
import type { ConsoleAgentProcessView } from "@/shared/types/Console.js";
import {
  getConsoleAgentRegistryPath,
  getCityLogPath,
  getCityPidPath,
  getConsoleLogPath,
  getConsolePidPath,
} from "@/main/city/runtime/CityPaths.js";
import { isCityProcessAlive, readCityPid } from "@/main/city/runtime/CityRuntime.js";
import {
  printPanel,
  renderKeyValueLines,
  type StatusTone,
} from "@/shared/utils/cli/PrettyStatus.js";
import { resolveRunningConsoleAgents } from "./IndexConsoleProcess.js";

/**
 * 打印当前受管 agent 面板。
 */
export function printRunningConsoleAgents(views: ConsoleAgentProcessView[]): void {
  const lines: string[] = [];
  lines.push(...renderKeyValueLines([["agents", String(views.length)]], 2));
  if (views.length === 0) {
    lines.push(...renderKeyValueLines([["detail", "no running agent daemon"]], 2));
    printPanel({
      title: "managed agents",
      tone: "info",
      lines,
    });
    return;
  }

  for (const [index, item] of views.entries()) {
    const seq = String(index + 1).padStart(2, "0");
    lines.push(`  - agent ${seq}`);
    lines.push(
      ...renderKeyValueLines(
        [
          ["project", item.projectRoot],
          ["pid", String(item.daemonPid)],
          ["started_at", item.startedAt],
          ["updated_at", item.updatedAt],
          ["log", item.logPath],
        ],
        4,
      ),
    );
  }

  printPanel({
    title: "managed agents",
    tone: "success",
    lines,
  });
}

/**
 * 打印 city 后台、Console 与受管 agent 的状态面板。
 */
export async function consoleStatusCommand(): Promise<void> {
  const pidPath = getCityPidPath();
  const logPath = getCityLogPath();

  const consolePid = await readCityPid();
  const running = Boolean(consolePid && isCityProcessAlive(consolePid));
  const tone: StatusTone = running ? "success" : consolePid ? "warning" : "info";
  const rows: Array<[string, string]> = [
    ["state", running ? "running" : "stopped"],
    ["pid_file", pidPath],
    ["log", logPath],
    ["registry", getConsoleAgentRegistryPath()],
  ];
  if (running) {
    rows.splice(1, 0, ["pid", String(consolePid)]);
  } else if (consolePid) {
    rows.splice(1, 0, ["warning", "stale pid file detected"]);
  }
  printPanel({
    title: "city status",
    tone,
    lines: renderKeyValueLines(rows, 2),
  });

  const ui = await getConsoleRuntimeStatus();
  const uiRows: Array<[string, string]> = [
    ["state", ui.running ? "running" : "stopped"],
    ["pid_file", ui.pidPath],
    ["log", ui.logPath],
  ];
  if (ui.running) {
    uiRows.splice(1, 0, ["pid", String(ui.pid || "-")]);
    if (ui.url) uiRows.splice(2, 0, ["url", ui.url]);
  }
  printPanel({
    title: "console status",
    tone: ui.running ? "success" : "info",
    lines: renderKeyValueLines(uiRows, 2),
  });

  try {
    const runningAgents = await resolveRunningConsoleAgents({
      syncRegistry: false,
    });
    printRunningConsoleAgents(runningAgents);
  } catch (error) {
    printPanel({
      title: "managed agents",
      tone: "warning",
      lines: renderKeyValueLines(
        [
          ["agents", "-"],
          ["warning", "registry unavailable"],
          ["detail", String(error)],
        ],
        2,
      ),
    });
  }
}

/**
 * 打印 Console 独立状态面板。
 */
export function printConsoleStatusPanel(status: {
  running: boolean;
  pid?: number;
  pidPath: string;
  logPath: string;
  url?: string;
}): void {
  const panelRows: Array<[string, string]> = [
    ["state", status.running ? "running" : "stopped"],
    ["pid_file", status.pidPath || getConsolePidPath()],
    ["log", status.logPath || getConsoleLogPath()],
  ];
  if (status.running) {
    panelRows.splice(1, 0, ["pid", String(status.pid || "-")]);
    if (status.url) panelRows.splice(2, 0, ["url", status.url]);
  }
  printPanel({
    title: "console status",
    tone: status.running ? "success" : "info",
    lines: renderKeyValueLines(panelRows, 2),
  });
}
