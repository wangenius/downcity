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
} from "@/city/runtime/daemon/Manager.js";
import { ensureRuntimeExecutionBindingReady } from "@/city/runtime/daemon/ProjectSetup.js";
import { allocateAvailablePort } from "@/city/runtime/daemon/PortAllocator.js";
import {
  ensureConsoleAgentRegistry,
  listConsoleAgents,
  markConsoleAgentStopped,
} from "@/city/runtime/console/ConsoleRegistry.js";
import type { ConsoleAgentProcessView } from "@/shared/types/Console.js";
import {
  getConsoleLogPath,
  getConsolePidPath,
  getConsoleRuntimeDirPath,
} from "@/city/runtime/console/ConsolePaths.js";
import {
  isConsoleProcessAlive,
  isConsoleRunning,
  readConsolePid,
} from "@/city/runtime/console/ConsoleRuntime.js";
import { sweepDetachedCityProcesses } from "@/city/runtime/console/ProcessSweep.js";
import { startCommand } from "./Start.js";
import type { StartOptions } from "@/shared/types/Start.js";
import {
  injectAgentContext,
  sleep,
} from "./IndexSupport.js";
import { stopConsoleUiCommand } from "./UI.js";
import { ensureConsoleAuthBootstrap } from "./ConsoleAuthBootstrap.js";

/**
 * 启动 console 后台进程。
 */
export async function startConsoleCommand(cliPath: string): Promise<void> {
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();
  await fs.ensureDir(consoleDir);
  await ensureConsoleAgentRegistry();

  const existingPid = await readConsolePid();
  if (existingPid && isConsoleProcessAlive(existingPid)) {
    console.log("ℹ️  DC console is already running");
    console.log(`   pid: ${existingPid}`);
    await ensureConsoleAuthBootstrap();
    return;
  }
  if (existingPid) {
    await fs.remove(pidPath);
  }

  // 关键点（中文）：若 pid 文件已丢失，但旧 console 进程仍在后台存活，这里先清理孤儿进程。
  const sweep = await sweepDetachedCityProcesses({
    includeConsole: true,
  });
  for (const item of sweep.stopped) {
    console.log(`⚠️  cleaned orphan DC console process: pid=${item.pid}`);
  }
  for (const item of sweep.alive) {
    console.log(`⚠️  orphan DC console process is still alive: pid=${item.pid}`);
  }

  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [cliPath, "console", "run"], {
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

  console.log("✅ DC console started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   log: ${logPath}`);

  await ensureConsoleAuthBootstrap();
}

/**
 * 解析 console 维护的“正在运行” agent 列表。
 */
export async function resolveRunningConsoleAgents(): Promise<ConsoleAgentProcessView[]> {
  const entries = await listConsoleAgents();
  const views: ConsoleAgentProcessView[] = [];

  for (const entry of entries) {
    const projectRoot = resolve(String(entry.projectRoot || "").trim() || ".");
    const daemonPid = await readDaemonPid(projectRoot);
    if (!daemonPid || !isDaemonProcessAlive(daemonPid)) {
      await markConsoleAgentStopped(projectRoot);
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
 * 停止 console 后台进程（先停子 agent，再停 console）。
 */
export async function stopConsoleCommand(params?: { timeoutMs?: number }): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 10_000;
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();
  await fs.ensureDir(consoleDir);

  await stopConsoleUiCommand();

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

  const consolePid = await readConsolePid();
  if (!consolePid) {
    console.log("ℹ️  DC console is not running");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    await sweepOrphans();
    return;
  }

  if (!isConsoleProcessAlive(consolePid)) {
    await fs.remove(pidPath);
    console.log("⚠️  Stale console pid file detected; cleaned up");
    console.log(`   pidFile: ${pidPath}`);
    console.log(`   log: ${logPath}`);
    await sweepOrphans();
    return;
  }

  process.kill(consolePid, "SIGTERM");

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutMs) {
    if (!isConsoleProcessAlive(consolePid)) break;
    await sleep(200);
  }

  if (isConsoleProcessAlive(consolePid)) {
    process.kill(consolePid, "SIGKILL");
    const forceStartAt = Date.now();
    while (Date.now() - forceStartAt < 2_000) {
      if (!isConsoleProcessAlive(consolePid)) break;
      await sleep(100);
    }
  }

  await fs.remove(pidPath);

  if (isConsoleProcessAlive(consolePid)) {
    console.log("⚠️  DC console may still be running");
    console.log(`   pid: ${consolePid}`);
  } else {
    console.log("✅ DC console stopped");
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

  await stopConsoleCommand();
  await startConsoleCommand(cliPath);

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
export async function restartConsoleCommand(cliPath: string): Promise<void> {
  await restartManagedConsoleAgents(cliPath);
}

/**
 * 执行 console runtime 常驻进程。
 */
export async function runConsoleRuntimeCommand(): Promise<void> {
  const consoleDir = getConsoleRuntimeDirPath();
  const pidPath = getConsolePidPath();
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
  console.error("   fix: start agent first (`city agent start <path>`) or run `city console agents`");
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
  if (!(await isConsoleRunning())) {
    console.error(
      "❌ console is not running. Please run `city console start` first.",
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
