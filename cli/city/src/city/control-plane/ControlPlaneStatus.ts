/**
 * ControlPlaneStatus：city gateway / control plane 命令的状态展示辅助。
 *
 * 关键点（中文）
 * - 聚合 city 后台、gateway/control plane 与受管 agent 的状态面板输出。
 * - 与进程控制逻辑解耦，便于后续继续拆分命令入口文件。
 */

import {
  getControlPlaneRuntimeStatus,
} from "./ControlPlaneRuntime.js";
import { readControlPlanePublicModeSetting } from "./ControlPlanePublicMode.js";
import type { ManagedAgentProcessView } from "@downcity/agent";
import {
  getManagedAgentRegistryPath,
  getCityPidPath,
} from "@/process/registry/CityPaths.js";
import { isCityProcessAlive, readCityPid } from "@/process/registry/CityRuntime.js";
import { emitCliBlock, emitCliList } from "../../shared/CliReporter.js";
import { resolveRunningManagedAgents } from "./ControlPlaneProcess.js";

/**
 * 打印当前受管 agent 面板。
 */
export function printRunningManagedAgents(views: ManagedAgentProcessView[]): void {
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
 * 打印 city 后台、control plane 与受管 agent 的状态面板。
 */
export async function controlPlaneStatusCommand(): Promise<void> {
  const pidPath = getCityPidPath();

  const cityPid = await readCityPid();
  const running = Boolean(cityPid && isCityProcessAlive(cityPid));
  emitCliBlock({
    tone: running ? "success" : cityPid ? "warning" : "info",
    title: "City runtime",
    summary: running ? "running" : cityPid ? "stale" : "stopped",
    facts: [
      {
        label: "registry",
        value: getManagedAgentRegistryPath(),
      },
      ...(cityPid && !running
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

  const ui = await getControlPlaneRuntimeStatus();
  const publicMode = await readControlPlanePublicModeSetting();
  emitCliBlock({
    tone: ui.running ? "success" : "info",
    title: "Console",
    summary: ui.running ? "running" : "stopped",
    facts: [
      ...(ui.url
        ? [
            {
              label: "url",
              value: ui.url,
            },
          ]
        : []),
      {
        label: "public mode",
        value: publicMode.enabled ? "enabled" : "disabled",
      },
      {
        label: "public host",
        value: publicMode.enabled
          ? String(publicMode.host || "0.0.0.0")
          : "127.0.0.1",
      },
    ],
  });

  try {
    const runningAgents = await resolveRunningManagedAgents({
      syncRegistry: false,
    });
    printRunningManagedAgents(runningAgents);
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
 * 打印 control plane 独立状态面板。
 */
export function printControlPlaneStatusPanel(status: {
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
