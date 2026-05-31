/**
 * ControlPlaneProcess：Bay gateway / control plane 命令的 runtime/进程控制辅助。
 *
 * 关键点（中文）
 * - 聚合 control plane 与受管 agent 的后台进程控制逻辑。
 * - 让 `ControlPlaneCommand` 只保留命令树装配，不再混杂大量进程细节。
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
} from "@/process/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/process/daemon/CliArgs.js";
import { assertProjectExecutionModelReady } from "@/model/runtime/ExecutionModelBinding.js";
import { allocateAvailablePort } from "@/process/daemon/PortAllocator.js";
import {
  ensureManagedAgentRegistry,
  listManagedAgentEntries,
  markManagedAgentStopped,
} from "@/process/registry/StudioRegistry.js";
import type { ManagedAgentProcessView } from "@downcity/agent";
import {
  getStudioLogPath,
  getStudioPidPath,
  getStudioRuntimeDirPath,
} from "@/process/registry/StudioPaths.js";
import {
  isStudioProcessAlive,
  isStudioRunning,
  readStudioPid,
} from "@/process/registry/StudioRuntime.js";
import {
  signalDetachedProcess,
  sweepDetachedStudioProcesses,
} from "@/process/registry/ProcessSweep.js";
import type { StartOptions } from "@downcity/agent";
import {
  injectAgentContext,
  resolveAgentId,
  sleep,
} from "../shared/IndexSupport.js";
import { buildRuntimePortFacts } from "../shared/PortHints.js";
import { stopControlPlaneCommand } from "./ControlPlaneRuntime.js";
import { ensureControlPlaneAuthBootstrap } from "./ControlPlaneAuthBootstrap.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";
import { runWithSpinner } from "@/utils/cli/Spinner.js";
import { CliError } from "../shared/CliError.js";
import { ensureStudioPublicHostEnv } from "../shared/PublicHostEnv.js";
import { resolveStudioCliPath } from "../shared/StudioCliPath.js";

/**
 * 启动 bay runtime 后台进程。
 */
export async function startStudioRuntimeCommand(cliPath: string): Promise<void> {
  const consoleDir = getStudioRuntimeDirPath();
  const pidPath = getStudioPidPath();
  const logPath = getStudioLogPath();
  await fs.ensureDir(consoleDir);
  await ensureManagedAgentRegistry();

  const existingPid = await readStudioPid();
  if (existingPid && isStudioProcessAlive(existingPid)) {
    emitCliBlock({
      tone: "info",
      title: "Bay runtime already running",
    });
    await ensureControlPlaneAuthBootstrap();
    return;
  }
  if (existingPid) {
    await fs.remove(pidPath);
  }

  // 关键点（中文）：若 pid 文件已丢失，但旧 bay runtime 进程仍在后台存活，这里先清理孤儿进程。
  const sweep = await sweepDetachedStudioProcesses({
    includeConsole: true,
  });
  for (const item of sweep.stopped) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan bay runtime cleaned",
    });
  }
  for (const item of sweep.alive) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan bay runtime still alive",
    });
  }

  const logFd = fs.openSync(logPath, "a");
  const publicHost = await ensureStudioPublicHostEnv();
  const child = spawn(process.execPath, [cliPath, "run"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      DOWNCITY_CONTROL_PLANE: "1",
    },
  });

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start console process (missing pid)");
  }

  await fs.writeFile(pidPath, String(child.pid), "utf-8");

  emitCliBlock({
    tone: "success",
    title: "Bay runtime started",
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

  await ensureControlPlaneAuthBootstrap();
}

/**
 * 解析 control plane 维护的“正在运行” managed agent 列表。
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
 * 停止 bay runtime 后台进程（先停 Console，再停受管 agent，最后停 bay runtime）。
 */
export async function stopStudioRuntimeCommand(params?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 10_000;
  const consoleDir = getStudioRuntimeDirPath();
  const pidPath = getStudioPidPath();
  await fs.ensureDir(consoleDir);

  // Phase 1: Stop Console
  emitCliBlock({
    tone: "info",
    title: "Bay runtime",
    summary: "stopping",
  });
  await stopControlPlaneCommand();

  // Phase 2: Stop managed agents
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

  // Phase 3: Stop bay runtime process
  const sweepOrphans = async (): Promise<void> => {
    const orphanSweep = await sweepDetachedStudioProcesses({
      includeConsole: true,
      includeUi: true,
      includeAgent: true,
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

  const consolePid = await readStudioPid();
  if (!consolePid) {
    emitCliBlock({
      tone: "info",
      title: "Bay runtime process",
      summary: "not running",
    });
    await sweepOrphans();
    emitCliBlock({
      tone: "success",
      title: "Bay runtime",
      summary: "stopped",
    });
    return;
  }

  if (!isStudioProcessAlive(consolePid)) {
    await fs.remove(pidPath);
    emitCliBlock({
      tone: "warning",
      title: "Bay runtime process",
      summary: "stale state cleaned",
    });
    await sweepOrphans();
    emitCliBlock({
      tone: "success",
      title: "Bay runtime",
      summary: "stopped",
    });
    return;
  }

  signalDetachedProcess(consolePid, "SIGTERM");

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (!isStudioProcessAlive(consolePid)) break;
    await sleep(200);
  }

  if (isStudioProcessAlive(consolePid)) {
    signalDetachedProcess(consolePid, "SIGKILL");
    const forceStartAt = Date.now();
    while (Date.now() - forceStartAt < 2_000) {
      if (!isStudioProcessAlive(consolePid)) break;
      await sleep(100);
    }
  }

  await fs.remove(pidPath);

  const stillAlive = isStudioProcessAlive(consolePid);
  emitCliBlock({
    tone: stillAlive ? "warning" : "success",
    title: "Bay runtime process",
    summary: stillAlive ? "may still be running" : "stopped",
  });

  await sweepOrphans();

  emitCliBlock({
    tone: "success",
    title: "Bay runtime",
    summary: "stopped",
  });
}async function resolveRestartOptionsFromProjectRoot(
  projectRoot: string,
): Promise<StartOptions> {
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
  const studioCliPath = resolveStudioCliPath();
  const restartOptionsMap = new Map<string, StartOptions>();
  for (const item of runningAgents) {
    restartOptionsMap.set(
      item.projectRoot,
      await resolveRestartOptionsFromProjectRoot(item.projectRoot),
    );
  }

  await stopStudioRuntimeCommand();
  await startStudioRuntimeCommand(cliPath);

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
      assertProjectExecutionModelReady(item.projectRoot);
      const args = await buildRunArgsFromOptions(
        item.projectRoot,
        restartOptionsMap.get(item.projectRoot) || {},
      );
      await startDaemonProcess({
        projectRoot: item.projectRoot,
        cliPath: studioCliPath,
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
 * 重启 control plane 主进程。
 */
export async function restartStudioRuntimeCommand(cliPath: string): Promise<void> {
  await restartManagedAgents(cliPath);
}

/**
 * 执行 bay runtime 常驻进程。
 */
export async function runStudioRuntimeCommand(): Promise<void> {
  const consoleDir = getStudioRuntimeDirPath();
  const pidPath = getStudioPidPath();
  await fs.ensureDir(consoleDir);
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
    fix: "bay agent start <path>",
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
  options: StartOptions & { foreground?: boolean },
): Promise<{
  projectRoot: string;
  options: StartOptions & { foreground?: boolean };
  shouldForeground: boolean;
}> {
  if (!(await isStudioRunning())) {
    throw new CliError({
      title: "bay runtime is not running",
      fix: "bay start",
    });
  }

  injectAgentContext(cwd);
  const projectRoot = resolve(String(cwd || "."));
    assertProjectExecutionModelReady(projectRoot);

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
