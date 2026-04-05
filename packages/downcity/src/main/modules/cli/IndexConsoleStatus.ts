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
  getCityPidPath,
} from "@/main/city/runtime/CityPaths.js";
import { isCityProcessAlive, readCityPid } from "@/main/city/runtime/CityRuntime.js";
import { emitCliBlock, emitCliList } from "./CliReporter.js";
import { resolveRunningConsoleAgents } from "./IndexConsoleProcess.js";

/**
 * 打印当前受管 agent 面板。
 */
export function printRunningConsoleAgents(views: ConsoleAgentProcessView[]): void {
  if (views.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "Managed agents",
      summary: "0 active",
      note: "no running agent daemon",
    });
    return;
  }
  emitCliList({
    tone: "accent",
    title: "Managed agents",
    summary: `${views.length} active`,
    items: views.map((item) => ({
      title: item.projectRoot.split("/").filter(Boolean).at(-1) || item.projectRoot,
      facts: [
        {
          label: "project",
          value: item.projectRoot,
        },
        {
          label: "started at",
          value: item.startedAt,
        },
        {
          label: "updated at",
          value: item.updatedAt,
        },
      ],
    })),
  });
}

/**
 * 打印 city 后台、Console 与受管 agent 的状态面板。
 */
export async function consoleStatusCommand(): Promise<void> {
  const pidPath = getCityPidPath();

  const consolePid = await readCityPid();
  const running = Boolean(consolePid && isCityProcessAlive(consolePid));
  emitCliBlock({
    tone: running ? "success" : consolePid ? "warning" : "info",
    title: "City runtime",
    summary: running ? "running" : consolePid ? "stale" : "stopped",
    facts: [
      {
        label: "registry",
        value: getConsoleAgentRegistryPath(),
      },
      ...(consolePid && !running
        ? [
            {
              label: "warning",
              value: "stale pid file detected",
            },
          ]
        : []),
      ...(pidPath
        ? [
            {
              label: "pid file",
              value: pidPath,
            },
          ]
        : []),
    ],
  });

  const ui = await getConsoleRuntimeStatus();
  emitCliBlock({
    tone: ui.running ? "success" : "info",
    title: "Console",
    summary: ui.running ? "running" : "stopped",
    facts: ui.url
      ? [
          {
            label: "url",
            value: ui.url,
          },
        ]
      : [],
  });

  try {
    const runningAgents = await resolveRunningConsoleAgents({
      syncRegistry: false,
    });
    printRunningConsoleAgents(runningAgents);
  } catch (error) {
    emitCliBlock({
      tone: "warning",
      title: "Managed agents",
      summary: "unavailable",
      facts: [
        {
          label: "detail",
          value: String(error),
        },
      ],
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
  emitCliBlock({
    tone: status.running ? "success" : "info",
    title: "Console",
    summary: status.running ? "running" : "stopped",
    facts: status.url
      ? [
          {
            label: "url",
            value: status.url,
          },
        ]
      : [],
  });
}
