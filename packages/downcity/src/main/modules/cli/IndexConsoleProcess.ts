/**
 * IndexConsoleProcess：console 命令的 runtime/进程控制辅助。
 *
 * 关键点（中文）
 * - 聚合 console 与受管 agent 的后台进程控制逻辑。
 * - 让 `IndexConsoleCommand` 只保留命令树装配，不再混杂大量进程细节。
 */

import { resolve } from "path";
import fs from "fs-extra";
import { spawn } from "child_process";
import {
  getDaemonLogPath,
  isProcessAlive as isDaemonProcessAlive,
  readDaemonMeta,
  readDaemonPid,
  stopDaemonProcess,
} from "@/main/city/daemon/Manager.js";
import { ensureRuntimeExecutionBindingReady } from "@/main/city/daemon/ProjectSetup.js";
import { allocateAvailablePort } from "@/main/city/daemon/PortAllocator.js";
import {
  ensureConsoleAgentRegistry,
  listConsoleAgents,
  markConsoleAgentStopped,
} from "@/main/city/runtime/CityRegistry.js";
import type { ConsoleAgentProcessView } from "@/shared/types/Console.js";
import {
  getCityLogPath,
  getCityPidPath,
  getCityRuntimeDirPath,
} from "@/main/city/runtime/CityPaths.js";
import {
  isCityProcessAlive,
  isCityRunning,
  readCityPid,
} from "@/main/city/runtime/CityRuntime.js";
import { sweepDetachedCityProcesses } from "@/main/city/runtime/ProcessSweep.js";
import { startCommand } from "./Start.js";
import type { StartOptions } from "@/shared/types/Start.js";
import {
  injectAgentContext,
  sleep,
} from "./IndexSupport.js";
import { stopConsoleCommand } from "./Console.js";
import { ensureConsoleAuthBootstrap } from "./ConsoleAuthBootstrap.js";

/**
 * 启动 city runtime 后台进程。
 */
export async function startCityRuntimeCommand(cliPath: string): Promise<void> {
  const consoleDir = getCityRuntimeDirPath();
  const pidPath = getCityPidPath();
  const logPath = getCityLogPath();
  await fs.ensureDir(consoleDir);
  await ensureConsoleAgentRegistry();

  const existingPid = await readCityPid();
  if (existingPid && isCityProcessAlive(existingPid)) {
    console.log("ℹ️  city runtime is already running");
    console.log(`   pid: ${existingPid}`);
    await ensureConsoleAuthBootstrap();
    return;
  }
  if (existingPid) {
    await fs.remove(pidPath);
  }

  // 关键点（中文）：若 pid 文件已丢失，但旧 city runtime 进程仍在后台存活，这里先清理孤儿进程。
  const sweep = await sweepDetachedCityProcesses({
    includeConsole: true,
  });
  for (const item of sweep.stopped) {
    console.log(`⚠️  cleaned orphan city runtime process: pid=${item.pid}`);
  }
  for (const item of sweep.alive) {
    console.log(`⚠️  orphan city runtime process is still alive: pid=${item.pid}`);
  }

  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [cliPath, "run"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      DOWNCITY_CONSOLE: "1",
    },
  });

  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start console process (missing pid)");
  }

  await fs.writeFile(pidPath, String(child.pid), "utf-8");

  console.log("✅ city runtime started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   log: ${logPath}`);

  await ensureConsoleAuthBootstrap();
}

/**
 * 解析 console 维护的“正在运行” agent 列表。
 */
export async function resolveRunningConsoleAgents(params?: {
  /**
   * 是否在扫描过程中回写 registry。
   *
   * 关键点（中文）
   * - `status` 等纯观测命令应关闭该开关，避免只读操作因为目录不可写而失败。
   * - stop/restart 等运维命令仍保留默认同步行为，确保 registry 最终状态收敛。
   */
  syncRegistry?: boolean;
}): Promise<ConsoleAgentProcessView[]> {
  const syncRegistry = params?.syncRegistry !== false;
  const entries = await listConsoleAgents();
  const views: ConsoleAgentProcessView[] = [];

  for (const entry of entries) {
    const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
    const daemonPid = await readDaemonPid(projectRoot);
    if (!daemonPid || !isDaemonProcessAlive(daemonPid)) {
      if (syncRegistry) {
        await markConsoleAgentStopped(projectRoot);
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
 * 停止 city runtime 后台进程（先停 Console，再停受管 agent，最后停 city runtime）。
 */
export async function stopCityRuntimeCommand(params?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 10_000;
  const consoleDir = getCityRuntimeDirPath();
  const pidPath = getCityPidPath();
  const logPath = getCityLogPath();
  await fs.ensureDir(consoleDir);

  await stopConsoleCommand();

  const views = await resolveRunningConsoleAgents();
  if (views.length > 0) {
    console.log(`Stopping ${views.length} console agents...`);
    for (const item of views) {
      try {
        const result = await stopDaemonProcess({ projectRoot: item.projectRoot });
        if (result.stopped) {
          console.log(`✅ stopped: ${item.projectRoot} (pid=${item.daemonPid})`);
        } else {
          console.log(`ℹ️  already stopped: ${item.projectRoot}`);
        }
        await markConsoleAgentStopped(item.projectRoot);
      } catch (error) {
        console.log(`❌ stop failed: ${item.projectRoot}`);
        console.log(`   error: ${String(error)}`);
      }
    }
  }

  const sweepOrphans = async (): Promise<void> => {
    const orphanSweep = await sweepDetachedCityProcesses({
      includeConsole: true,
      includeUi: true,
      includeAgent: true,
      timeoutMs,
    });
    for (const item of orphanSweep.stopped) {
      console.log("✅ orphan process stopped");
      console.log(`   pid: ${item.pid}`);
      console.log(`   command: ${item.command}`);
    }
    for (const item of orphanSweep.alive) {
      console.log("⚠️  orphan process may still be running");
      console.log(`   pid: ${item.pid}`);
      console.log(`   command: ${item.command}`);
    }
  };

  const consolePid = await readCityPid();
  if (!consolePid) {
    console.log("ℹ️  city runtime is not running");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    await sweepOrphans();
    return;
  }

  if (!isCityProcessAlive(consolePid)) {
    await fs.remove(pidPath);
    console.log("⚠️  Stale city runtime pid file detected; cleaned up");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    await sweepOrphans();
    return;
  }

  process.kill(consolePid, "SIGTERM");

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (!isCityProcessAlive(consolePid)) break;
    await sleep(200);
  }

  if (isCityProcessAlive(consolePid)) {
    process.kill(consolePid, "SIGKILL");
    const forceStartAt = Date.now();
    while (Date.now() - forceStartAt < 2_000) {
      if (!isCityProcessAlive(consolePid)) break;
      await sleep(100);
    }
  }

  await fs.remove(pidPath);

  if (isCityProcessAlive(consolePid)) {
    console.log("⚠️  city runtime may still be running");
    console.log(`   pid: ${consolePid}`);
  } else {
    console.log("✅ city runtime stopped");
    console.log(`   pid: ${consolePid}`);
  }
  console.log(`   pidFile: ${pidPath}`);
  console.log(`   log: ${logPath}`);

  await sweepOrphans();
}

/**
 * 从 daemon meta 中提取可恢复的启动参数。
 */
async function resolveRestartOptionsFromProjectRoot(
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
export async function restartManagedConsoleAgents(cliPath: string): Promise<void> {
  const runningAgents = await resolveRunningConsoleAgents();
  const restartOptionsMap = new Map<string, StartOptions>();
  for (const item of runningAgents) {
    restartOptionsMap.set(
      item.projectRoot,
      await resolveRestartOptionsFromProjectRoot(item.projectRoot),
    );
  }

  await stopCityRuntimeCommand();
  await startCityRuntimeCommand(cliPath);

  if (runningAgents.length === 0) {
    return;
  }

  console.log(`Restarting ${runningAgents.length} managed agents...`);
  for (const item of runningAgents) {
    try {
      await startCommand(
        item.projectRoot,
        restartOptionsMap.get(item.projectRoot) || {},
      );
    } catch (error) {
      console.log(`❌ restart failed: ${item.projectRoot}`);
      console.log(`   error: ${String(error)}`);
    }
  }
}

/**
 * 重启 console 主进程。
 */
export async function restartCityRuntimeCommand(cliPath: string): Promise<void> {
  await restartManagedConsoleAgents(cliPath);
}

/**
 * 执行 city runtime 常驻进程。
 */
export async function runCityRuntimeCommand(): Promise<void> {
  const consoleDir = getCityRuntimeDirPath();
  const pidPath = getCityPidPath();
  await fs.ensureDir(consoleDir);
  await ensureConsoleAgentRegistry();
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
 * 解析并校验目标 agent 是否已登记在 console registry。
 */
async function resolveRegisteredAgentProjectRoot(
  cwd: string,
): Promise<string | null> {
  const projectRoot = resolve(String(cwd || "."));
  const entries = await listConsoleAgents();
  const matched = entries.some(
    (entry) =>
      resolve(String(entry.projectRoot || "").trim() || ".") === projectRoot,
  );
  if (matched) return projectRoot;

  console.error("❌ agent is not registered in console registry");
  console.error(`   project: ${projectRoot}`);
  console.error("   fix: start agent first (`city agent start <path>`) or run `city agents`");
  return null;
}

/**
 * 注册 `agent doctor` 对 console registry 的依赖校验。
 */
export async function ensureRegisteredAgentProjectRoot(
  cwd: string,
): Promise<string | null> {
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
  if (!(await isCityRunning())) {
    console.error(
      "❌ city runtime is not running. Please run `city start` first.",
    );
    process.exit(1);
  }

  injectAgentContext(cwd);
  const projectRoot = resolve(String(cwd || "."));
    ensureRuntimeExecutionBindingReady(projectRoot);

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
