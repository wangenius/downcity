/**
 * GatewayProcess：Town runtime 命令的进程控制辅助。
 *
 * 关键点（中文）
 * - 聚合 Town runtime 与受管 agent 的后台进程控制逻辑。
 * - 停止流程仍会清理旧 Console UI 进程，避免历史版本留下孤儿进程。
 * - 让 `GatewayCommand` 只保留命令树装配，不再混杂大量进程细节。
 */

import { resolve } from "path";
import fs from "fs-extra";
import { spawn } from "child_process";
import {
  getDaemonLogPath,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonMeta,
  readDaemonPid,
  startDaemonProcess,
  stopDaemonProcess,
} from "../../../process/daemon/Manager.js";
import { buildRunArgsFromOptions } from "../../../process/daemon/CliArgs.js";
import { assertProjectExecutionModelReady } from "../../city-model/ExecutionModelBinding.js";
import { allocateAvailablePort } from "../../../process/daemon/PortAllocator.js";
import {
  ensureManagedAgentRegistry,
  listManagedAgentEntries,
  markManagedAgentStopped,
} from "../../../process/registry/TownRegistry.js";
import type { ManagedAgentProcessView } from "@downcity/agent";
import {
  getGatewayMetaPath,
  getGatewayPidPath,
  getTownLogPath,
  getTownPidPath,
  getTownRuntimeDirPath,
} from "../../../process/registry/TownPaths.js";
import {
  isTownProcessAlive,
  isTownRunning,
  readTownPid,
} from "../../../process/registry/TownRuntime.js";
import {
  signalDetachedProcess,
  sweepDetachedBayProcesses,
} from "../../../process/registry/ProcessSweep.js";
import type { AgentStartOptions } from "../../../types/AgentStartOptions.js";
import {
  injectAgentContext,
  resolveAgentId,
  sleep,
} from "../../../shared/IndexSupport.js";
import { buildRuntimePortFacts } from "../../../shared/PortHints.js";
import { ensureGatewayAuthBootstrap } from "./GatewayAuthBootstrap.js";
import { emitCliBlock, emitCliList } from "../../../shared/CliReporter.js";
import { runWithSpinner } from "../../../utils/cli/Spinner.js";
import { CliError } from "../../../shared/CliError.js";
import { ensureBayPublicHostEnv } from "../../../shared/PublicHostEnv.js";
import { resolveTownCliPath } from "../../../shared/TownCliPath.js";

/**
 * 启动 town runtime 后台进程。
 */
export async function startTownRuntimeCommand(cliPath: string): Promise<void> {
  const runtimeDir = getTownRuntimeDirPath();
  const pidPath = getTownPidPath();
  const logPath = getTownLogPath();
  await fs.ensureDir(runtimeDir);
  await ensureManagedAgentRegistry();

  const existingPid = await readTownPid();
  if (existingPid && isTownProcessAlive(existingPid)) {
    emitCliBlock({
      tone: "info",
      title: "Town runtime already running",
    });
    await ensureGatewayAuthBootstrap();
    return;
  }
  if (existingPid) {
    await fs.remove(pidPath);
  }

  // 关键点（中文）：若 pid 文件已丢失，但旧 town runtime 进程仍在后台存活，这里先清理孤儿进程。
  const sweep = await sweepDetachedBayProcesses({
    include_town_runtime: true,
  });
  for (const item of sweep.stopped) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan town runtime cleaned",
    });
  }
  for (const item of sweep.alive) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan town runtime still alive",
    });
  }

  const logFd = fs.openSync(logPath, "a");
  const publicHost = await ensureBayPublicHostEnv();
  const child = spawn(process.execPath, [cliPath, "run"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      DOWNCITY_GATEWAY: "1",
    },
  });

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start town runtime process (missing pid)");
  }

  await fs.writeFile(pidPath, String(child.pid), "utf-8");

  emitCliBlock({
    tone: "success",
    title: "Town runtime started",
    facts: [
      ...buildRuntimePortFacts(),
      ...(publicHost.changed
        ? [
            {
              label: "Public Host",
              value: publicHost.value,
            },
          ]
        : []),
    ],
  });

  await ensureGatewayAuthBootstrap();
}

/**
 * 解析 gateway 维护的“正在运行” managed agent 列表。
 */
export async function resolveRunningManagedAgents(params?: {
  /**
   * 是否在扫描过程中回写 registry。
   *
   * 关键点（中文）
   * - `status` 等纯观测命令应关闭该开关，避免只读操作因为目录不可写而失败。
   * - stop/restart 等运维命令仍保留默认同步行为，确保 registry 最终状态收敛。
   */
  syncRegistry?: boolean;
}): Promise<ManagedAgentProcessView[]> {
  const syncRegistry = params?.syncRegistry !== false;
  const entries = await listManagedAgentEntries();
  const views: ManagedAgentProcessView[] = [];

  for (const entry of entries) {
    const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
    const daemonPid = await readDaemonPid(projectRoot);
    if (!daemonPid || !isDaemonProcessAlive(daemonPid)) {
      if (syncRegistry) {
        await markManagedAgentStopped(projectRoot);
      }
      continue;
    }

    views.push({
      projectRoot,
      registeredPid: entry.pid,
      daemonPid,
      running: true,
      startedAt: entry.startedAt,
      updatedAt: entry.updatedAt,
      logPath: getDaemonLogPath(projectRoot),
    });
  }

  return views.sort((a, b) => a.projectRoot.localeCompare(b.projectRoot));
}

/**
 * 清理旧版本可能留下的 Console UI 运行态。
 *
 * 关键点（中文）
 * - 当前 Town 不再启动 Console UI，也不再依赖 Console runtime 模块。
 * - 这里只按旧 `town console run` 的 detached 命令形态做兜底清扫。
 * - 清扫完成后删除旧 gateway pid/meta 文件，避免后续状态读取误判。
 */
async function cleanupLegacyConsoleUiRuntime(timeoutMs: number): Promise<void> {
  const sweep = await sweepDetachedBayProcesses({
    include_legacy_console_ui: true,
    timeoutMs,
  });

  for (const item of sweep.stopped) {
    emitCliBlock({
      tone: "success",
      title: "Legacy Console UI process stopped",
    });
  }
  for (const item of sweep.alive) {
    emitCliBlock({
      tone: "warning",
      title: "Legacy Console UI process may still be running",
    });
  }

  await fs.remove(getGatewayPidPath());
  await fs.remove(getGatewayMetaPath());
}

/**
 * 停止 town runtime 后台进程（先清理旧 Console，再停受管 agent，最后停 town runtime）。
 */
export async function stopTownRuntimeCommand(params?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 10_000;
  const runtimeDir = getTownRuntimeDirPath();
  const pidPath = getTownPidPath();
  await fs.ensureDir(runtimeDir);

  // 关键点（中文）：兼容清理旧版本可能留下的 Console UI 进程；当前 Town 不再启动它。
  emitCliBlock({
    tone: "info",
    title: "Town runtime",
    summary: "stopping",
  });
  await cleanupLegacyConsoleUiRuntime(timeoutMs);

  // 关键点（中文）：受管 agent 由 Town 统一停机，避免遗留 daemon 占用项目端口。
  const views = await resolveRunningManagedAgents();
  if (views.length > 0) {
    emitCliBlock({
      tone: "info",
      title: "Managed agents",
      summary: `stopping · ${views.length} item${views.length > 1 ? "s" : ""}`,
    });

    for (const item of views) {
      try {
        const result = await runWithSpinner(
          () => stopDaemonProcess({ projectRoot: item.projectRoot }),
          { text: `Stopping ${resolveAgentId(item.projectRoot)}...` },
        );
        emitCliBlock({
          tone: result.stopped ? "success" : "info",
          title: resolveAgentId(item.projectRoot),
          summary: result.stopped ? "stopped" : "already stopped",
          facts: [{ label: "project", value: item.projectRoot }],
        });
        await markManagedAgentStopped(item.projectRoot);
      } catch (error) {
        emitCliBlock({
          tone: "error",
          title: resolveAgentId(item.projectRoot),
          summary: "failed",
          facts: [
            { label: "project", value: item.projectRoot },
            { label: "error", value: String(error) },
          ],
        });
      }
    }
  }

  // 关键点（中文）：最后停止 Town runtime 自身，并顺手清扫失联进程。
  const sweepOrphans = async (): Promise<void> => {
    const orphanSweep = await sweepDetachedBayProcesses({
      include_town_runtime: true,
      include_legacy_console_ui: true,
      include_agent: true,
      timeoutMs,
    });
    for (const item of orphanSweep.stopped) {
      emitCliBlock({
        tone: "success",
        title: "Orphan process stopped",
      });
    }
    for (const item of orphanSweep.alive) {
      emitCliBlock({
        tone: "warning",
        title: "Orphan process may still be running",
      });
    }
  };

  const runtimePid = await readTownPid();
  if (!runtimePid) {
    emitCliBlock({
      tone: "info",
      title: "Town runtime process",
      summary: "not running",
    });
    await sweepOrphans();
    emitCliBlock({
      tone: "success",
      title: "Town runtime",
      summary: "stopped",
    });
    return;
  }

  if (!isTownProcessAlive(runtimePid)) {
    await fs.remove(pidPath);
    emitCliBlock({
      tone: "warning",
      title: "Town runtime process",
      summary: "stale state cleaned",
    });
    await sweepOrphans();
    emitCliBlock({
      tone: "success",
      title: "Town runtime",
      summary: "stopped",
    });
    return;
  }

  signalDetachedProcess(runtimePid, "SIGTERM");

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (!isTownProcessAlive(runtimePid)) break;
    await sleep(200);
  }

  if (isTownProcessAlive(runtimePid)) {
    signalDetachedProcess(runtimePid, "SIGKILL");
    const forceStartAt = Date.now();
    while (Date.now() - forceStartAt < 2_000) {
      if (!isTownProcessAlive(runtimePid)) break;
      await sleep(100);
    }
  }

  await fs.remove(pidPath);

  const stillAlive = isTownProcessAlive(runtimePid);
  emitCliBlock({
    tone: stillAlive ? "warning" : "success",
    title: "Town runtime process",
    summary: stillAlive ? "may still be running" : "stopped",
  });

  await sweepOrphans();

  emitCliBlock({
    tone: "success",
    title: "Town runtime",
    summary: "stopped",
  });
}async function resolveRestartOptionsFromProjectRoot(
  projectRoot: string,
): Promise<AgentStartOptions> {
  const meta = await readDaemonMeta(projectRoot);
  if (!meta || !Array.isArray(meta.args)) {
    return {};
  }

  const hostIndex = meta.args.findIndex((item) => item === "--host");
  if (hostIndex < 0) {
    return {};
  }

  const host = String(meta.args[hostIndex + 1] || "").trim();
  if (!host) {
    return {};
  }

  return { host };
}

/**
 * 重启后恢复此前仍在运行的 agent daemon。
 */
export async function restartManagedAgents(cliPath: string): Promise<void> {
  const runningAgents = await resolveRunningManagedAgents();
  const townCliPath = resolveTownCliPath();
  const restartOptionsMap = new Map<string, AgentStartOptions>();
  for (const item of runningAgents) {
    restartOptionsMap.set(
      item.projectRoot,
      await resolveRestartOptionsFromProjectRoot(item.projectRoot),
    );
  }

  await stopTownRuntimeCommand();
  await startTownRuntimeCommand(cliPath);

  if (runningAgents.length === 0) {
    return;
  }

  emitCliBlock({
    tone: "accent",
    title: "Managed agents",
    summary: `restarting · ${runningAgents.length} item${runningAgents.length > 1 ? "s" : ""}`,
  });
  for (const item of runningAgents) {
    try {
      await assertProjectExecutionModelReady(item.projectRoot);
      const args = await buildRunArgsFromOptions(
        item.projectRoot,
        restartOptionsMap.get(item.projectRoot) || {},
      );
      await startDaemonProcess({
        projectRoot: item.projectRoot,
        cliPath: townCliPath,
        args,
      });
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Managed agent restart failed",
        summary: resolveAgentId(item.projectRoot),
        facts: [
          {
            label: "Project",
            value: item.projectRoot,
          },
          {
            label: "Error",
            value: String(error),
          },
        ],
      });
    }
  }
}

/**
 * 重启 gateway 主进程。
 */
export async function restartTownRuntimeCommand(cliPath: string): Promise<void> {
  await restartManagedAgents(cliPath);
}

/**
 * 执行 town runtime 常驻进程。
 */
export async function runTownRuntimeCommand(): Promise<void> {
  const runtimeDir = getTownRuntimeDirPath();
  const pidPath = getTownPidPath();
  await fs.ensureDir(runtimeDir);
  await ensureManagedAgentRegistry();
  await fs.writeFile(pidPath, String(process.pid), "utf-8");

  const shutdown = async (): Promise<void> => {
    await fs.remove(pidPath);
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  setInterval(() => {
    // keep alive
  }, 60_000);
}

/**
 * 解析并校验目标 agent 是否已登记在 managed agent registry。
 */
async function resolveRegisteredAgentProjectRoot(
  cwd: string,
): Promise<string> {
  const projectRoot = resolve(String(cwd || "."));
  const entries = await listManagedAgentEntries();
  const matched = entries.some(
    (entry) =>
      resolve(String(entry.projectRoot || "").trim() || ".") === projectRoot,
  );
  if (matched) return projectRoot;

  throw new CliError({
    title: "Agent is not registered in managed agent registry",
    note: `project: ${projectRoot}`,
    fix: "town agent start <path>",
  });
}

/**
 * 注册 `agent doctor` 对 managed agent registry 的依赖校验。
 */
export async function ensureRegisteredAgentProjectRoot(
  cwd: string,
): Promise<string> {
  return await resolveRegisteredAgentProjectRoot(cwd);
}

/**
 * 为前台 agent 运行补齐上下文与模型绑定。
 */
export async function prepareForegroundAgent(
  cwd: string,
  options: AgentStartOptions & { foreground?: boolean },
): Promise<{
  projectRoot: string;
  options: AgentStartOptions & { foreground?: boolean };
  shouldForeground: boolean;
}> {
  if (!(await isTownRunning())) {
    throw new CliError({
      title: "town runtime is not running",
      fix: "town start",
    });
  }

  injectAgentContext(cwd);
  const projectRoot = resolve(String(cwd || "."));
  await assertProjectExecutionModelReady(projectRoot);

  const shouldForeground = options.foreground === true;
  if (!shouldForeground) {
    return {
      projectRoot,
      options,
      shouldForeground,
    };
  }

  const host = String(options.host || "0.0.0.0").trim() || "0.0.0.0";
  const foregroundPort =
    options.port !== undefined && options.port !== null && options.port !== ""
      ? options.port
      : await allocateAvailablePort({ host });

  return {
    projectRoot,
    shouldForeground,
    options: {
      ...options,
      host,
      port: foregroundPort,
    },
  };
}
