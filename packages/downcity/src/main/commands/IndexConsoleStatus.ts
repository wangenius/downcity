/**
 * IndexConsoleStatus：console 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 console、console UI、受管 agent 的状态面板输出。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */

import {
  getConsoleUiRuntimeStatus,
} from "./UI.js";
import type { ConsoleAgentProcessView } from "@/types/Console.js";
import {
  getConsoleAgentRegistryPath,
  getConsoleLogPath,
  getConsolePidPath,
  getConsoleUiLogPath,
  getConsoleUiPidPath,
} from "@/main/runtime/ConsolePaths.js";
import { isConsoleProcessAlive, readConsolePid } from "@/main/runtime/ConsoleRuntime.js";
import {
  printPanel,
  renderKeyValueLines,
  type StatusTone,
} from "@/utils/cli/PrettyStatus.js";
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
 * 打印 console、console UI 与受管 agent 的状态面板。
 */
export async function consoleStatusCommand(): Promise<void> {
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();

  const consolePid = await readConsolePid();
  const running = Boolean(consolePid && isConsoleProcessAlive(consolePid));
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
    title: "city console status",
    tone,
    lines: renderKeyValueLines(rows, 2),
  });

  const ui = await getConsoleUiRuntimeStatus();
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
    title: "city console ui status",
    tone: ui.running ? "success" : "info",
    lines: renderKeyValueLines(uiRows, 2),
  });

  const runningAgents = await resolveRunningConsoleAgents();
  printRunningConsoleAgents(runningAgents);
}

/**
 * 打印 console UI 独立状态面板。
 */
export function printConsoleUiStatusPanel(status: {
  running: boolean;
  pid?: number;
  pidPath: string;
  logPath: string;
  url?: string;
}): void {
  const panelRows: Array<[string, string]> = [
    ["state", status.running ? "running" : "stopped"],
    ["pid_file", status.pidPath || getConsoleUiPidPath()],
    ["log", status.logPath || getConsoleUiLogPath()],
  ];
  if (status.running) {
    panelRows.splice(1, 0, ["pid", String(status.pid || "-")]);
    if (status.url) panelRows.splice(2, 0, ["url", status.url]);
  }
  printPanel({
    title: "city console ui status",
    tone: status.running ? "success" : "info",
    lines: renderKeyValueLines(panelRows, 2),
  });
}
