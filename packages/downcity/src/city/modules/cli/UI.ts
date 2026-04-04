/**
 * `city console ui`：console UI 进程管理与前台运行入口。
 *
 * 关键点（中文）
 * - 默认 `city console ui` 等同于 `city console ui start`。
 * - `run` 仅供内部使用（真正启动 UI 网关进程）。
 */

import fs from "fs-extra";
import { spawn } from "node:child_process";
import {
  getConsoleRuntimeDirPath,
  getConsoleUiLogPath,
  getConsoleUiMetaPath,
  getConsoleUiPidPath,
} from "@/city/runtime/console/ConsolePaths.js";
import {
  isConsoleProcessAlive,
  isConsoleRunning,
} from "@/city/runtime/console/ConsoleRuntime.js";
import {
  findDetachedCityProcesses,
  sweepDetachedCityProcesses,
} from "@/city/runtime/console/ProcessSweep.js";
import { createConsoleUIGateway } from "@/city/modules/console-ui/ConsoleUIGateway.js";
import type {
  ConsoleUiRuntimeMeta,
  ConsoleUiRuntimeStatus,
} from "@/shared/types/ConsoleUI.js";

const DEFAULT_UI_HOST = "127.0.0.1";
const DEFAULT_UI_PORT = 5315;

/**
 * console ui 启动参数。
 */
export interface ConsoleUiStartOptions {
  /**
   * UI 监听端口。
   */
  port?: number;

  /**
   * UI 监听主机。
   */
  host?: string;
}

/**
 * 安全读取 UI pid。
 */
export async function readConsoleUiPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getConsoleUiPidPath(), "utf-8");
    const pid = Number.parseInt(String(raw || "").trim(), 10);
    if (!Number.isFinite(pid) || Number.isNaN(pid) || pid < 1) return null;
    return pid;
  } catch {
    return null;
  }
}

/**
 * 安全读取 UI 元数据。
 */
async function readConsoleUiMeta(): Promise<ConsoleUiRuntimeMeta | null> {
  try {
    const raw = (await fs.readJson(getConsoleUiMetaPath())) as Partial<ConsoleUiRuntimeMeta>;
    const pid = Number(raw.pid);
    const host = String(raw.host || "").trim();
    const port = Number(raw.port);
    const startedAt = String(raw.startedAt || "").trim();
    if (!Number.isInteger(pid) || pid < 1) return null;
    if (!host) return null;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (!startedAt) return null;
    return { pid, host, port, startedAt };
  } catch {
    return null;
  }
}

/**
 * 清理 UI 状态文件。
 */
async function cleanupConsoleUiStateFiles(): Promise<void> {
  await fs.remove(getConsoleUiPidPath());
  await fs.remove(getConsoleUiMetaPath());
}

/**
 * 规范化 host，避免展示通配地址。
 */
function normalizeHost(host: string): string {
  const value = String(host || "").trim();
  if (!value) return DEFAULT_UI_HOST;
  if (value === "0.0.0.0" || value === "::") return "127.0.0.1";
  return value;
}

/**
 * 解析 detached Console UI 命令行中的 host/port。
 */
export function parseConsoleUiProcessCommand(command: string): {
  host: string;
  port: number;
} | null {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  if (!/\bconsole ui run\b/.test(normalized)) return null;

  const hostMatch = normalized.match(/(?:^|\s)--host\s+(\S+)/);
  const portMatch = normalized.match(/(?:^|\s)--port\s+(\d+)/);
  const host = normalizeHost(hostMatch?.[1] || DEFAULT_UI_HOST);
  const port = Number.parseInt(portMatch?.[1] || String(DEFAULT_UI_PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return {
    host,
    port,
  };
}

/**
 * 从 detached 进程列表中挑选可复用的 Console UI 进程。
 */
export function findReusableConsoleUiProcess(
  processes: Array<{ pid: number; command: string }>,
  expected: {
    host: string;
    port: number;
  },
): {
  pid: number;
  host: string;
  port: number;
} | null {
  const expectedHost = normalizeHost(expected.host);
  const expectedPort = expected.port;

  for (const item of processes) {
    const parsed = parseConsoleUiProcessCommand(item.command);
    if (!parsed) continue;
    if (parsed.host !== expectedHost || parsed.port !== expectedPort) continue;
    return {
      pid: item.pid,
      host: parsed.host,
      port: parsed.port,
    };
  }

  return null;
}

/**
 * 尝试从 detached UI 进程恢复 pid/meta 状态文件。
 */
async function recoverDetachedConsoleUiStatus(
  expected?: {
    host?: string;
    port?: number;
  },
): Promise<ConsoleUiRuntimeStatus | null> {
  const host = normalizeHost(expected?.host || DEFAULT_UI_HOST);
  const port =
    typeof expected?.port === "number" && Number.isInteger(expected.port)
      ? expected.port
      : DEFAULT_UI_PORT;

  const processes = await findDetachedCityProcesses({
    includeUi: true,
  });
  const reusable = findReusableConsoleUiProcess(processes, { host, port });
  if (!reusable) return null;

  const meta: ConsoleUiRuntimeMeta = {
    pid: reusable.pid,
    host: reusable.host,
    port: reusable.port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getConsoleUiPidPath(), String(reusable.pid), "utf-8");
  await fs.writeJson(getConsoleUiMetaPath(), meta, { spaces: 2 });

  return {
    running: true,
    pid: reusable.pid,
    host: reusable.host,
    port: reusable.port,
    url: `http://${reusable.host}:${reusable.port}`,
    logPath: getConsoleUiLogPath(),
    pidPath: getConsoleUiPidPath(),
  };
}

/**
 * 获取 UI 当前运行状态。
 */
export async function getConsoleUiRuntimeStatus(): Promise<ConsoleUiRuntimeStatus> {
  const pidPath = getConsoleUiPidPath();
  const logPath = getConsoleUiLogPath();
  const meta = await readConsoleUiMeta();
  const pid = await readConsoleUiPid();
  if (!pid) {
    const recovered = await recoverDetachedConsoleUiStatus({
      host: meta?.host,
      port: meta?.port,
    });
    if (recovered) return recovered;
    return {
      running: false,
      logPath,
      pidPath,
    };
  }

  if (!isConsoleProcessAlive(pid)) {
    await cleanupConsoleUiStateFiles();
    const recovered = await recoverDetachedConsoleUiStatus({
      host: meta?.host,
      port: meta?.port,
    });
    if (recovered) return recovered;
    return {
      running: false,
      logPath,
      pidPath,
    };
  }

  const host = normalizeHost(meta?.host || DEFAULT_UI_HOST);
  const port =
    meta && Number.isInteger(meta.port) ? meta.port : DEFAULT_UI_PORT;
  return {
    running: true,
    pid,
    host,
    port,
    url: `http://${host}:${port}`,
    logPath,
    pidPath,
  };
}

/**
 * 前台运行 UI 网关（内部 run 命令）。
 */
export async function runConsoleUiRuntimeCommand(
  options?: ConsoleUiStartOptions,
): Promise<void> {
  const host = String(options?.host || DEFAULT_UI_HOST).trim() || DEFAULT_UI_HOST;
  const port =
    typeof options?.port === "number" && Number.isInteger(options.port)
      ? options.port
      : DEFAULT_UI_PORT;

  const gateway = createConsoleUIGateway();
  await gateway.start({ host, port });

  const visibleHost = normalizeHost(host);
  console.log(`🌐 Console UI started: http://${visibleHost}:${port}`);
  console.log("📌 单 UI 实例可切换查看多个已运行 agent。");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, stopping console UI...`);
    await gateway.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

/**
 * 后台启动 UI。
 */
export async function startConsoleUiCommand(params: {
  options?: ConsoleUiStartOptions;
  cliPath: string;
}): Promise<void> {
  if (!(await isConsoleRunning())) {
    console.error(
      "❌ console is not running. Please run `city console start` first.",
    );
    process.exit(1);
  }

  const status = await getConsoleUiRuntimeStatus();
  if (status.running) {
    console.log("ℹ️  Console UI is already running");
    console.log(`   pid: ${status.pid}`);
    if (status.url) console.log(`   url: ${status.url}`);
    console.log(`   log: ${status.logPath}`);
    return;
  }

  // 关键点（中文）：没有 pid 文件但可能还有旧版 UI 孤儿进程占着端口，先做一次兜底清扫。
  const sweep = await sweepDetachedCityProcesses({
    includeUi: true,
  });
  for (const item of sweep.stopped) {
    console.log(`⚠️  cleaned orphan Console UI process: pid=${item.pid}`);
  }
  for (const item of sweep.alive) {
    console.log(`⚠️  orphan Console UI process is still alive: pid=${item.pid}`);
  }

  const host = String(params.options?.host || DEFAULT_UI_HOST).trim() || DEFAULT_UI_HOST;
  const port =
    typeof params.options?.port === "number" && Number.isInteger(params.options.port)
      ? params.options.port
      : DEFAULT_UI_PORT;

  await fs.ensureDir(getConsoleRuntimeDirPath());
  const logPath = getConsoleUiLogPath();
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(
    process.execPath,
    [params.cliPath, "console", "ui", "run", "--host", host, "--port", String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        DOWNCITY_CONSOLE_UI: "1",
      },
    },
  );
  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start console UI process (missing pid)");
  }

  const meta: ConsoleUiRuntimeMeta = {
    pid: child.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getConsoleUiPidPath(), String(child.pid), "utf-8");
  await fs.writeJson(getConsoleUiMetaPath(), meta, { spaces: 2 });

  // 关键点（中文）：等待子进程完成实际监听，避免“启动命令成功但端口已被占用导致秒退”时误报成功。
  const startedAt = Date.now();
  let childAlive = true;
  while (Date.now() - startedAt < 1_500) {
    if (!isConsoleProcessAlive(child.pid)) {
      childAlive = false;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!childAlive) {
    await cleanupConsoleUiStateFiles();
    throw new Error(
      `Console UI exited before becoming ready. Please check log: ${logPath}`,
    );
  }

  console.log("✅ Console UI started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   url: http://${normalizeHost(host)}:${port}`);
  console.log(`   log: ${logPath}`);
}

/**
 * 重启后台 UI。
 *
 * 关键点（中文）
 * - 先 stop 再 start，保证加载最新代码与路由。
 * - 支持通过 options 覆盖 host/port。
 */
export async function restartConsoleUiCommand(params: {
  options?: ConsoleUiStartOptions;
  cliPath: string;
}): Promise<void> {
  await stopConsoleUiCommand();
  await startConsoleUiCommand(params);
}

/**
 * 停止后台 UI。
 */
export async function stopConsoleUiCommand(params?: {
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 8000;
  const status = await getConsoleUiRuntimeStatus();
  if (!status.running || !status.pid) {
    const sweep = await sweepDetachedCityProcesses({
      includeUi: true,
      timeoutMs,
    });
    if (sweep.stopped.length > 0 || sweep.alive.length > 0) {
      for (const item of sweep.stopped) {
        console.log(`✅ orphan Console UI stopped`);
        console.log(`   pid: ${item.pid}`);
      }
      for (const item of sweep.alive) {
        console.log("⚠️  orphan Console UI may still be running");
        console.log(`   pid: ${item.pid}`);
      }
      console.log(`   pidFile: ${status.pidPath}`);
      console.log(`   log: ${status.logPath}`);
      return;
    }
    console.log("ℹ️  Console UI is not running");
    console.log(`   pidFile: ${status.pidPath}`);
    console.log(`   log: ${status.logPath}`);
    return;
  }

  const pid = status.pid;
  process.kill(pid, "SIGTERM");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isConsoleProcessAlive(pid)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (isConsoleProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await cleanupConsoleUiStateFiles();

  if (isConsoleProcessAlive(pid)) {
    console.log("⚠️  Console UI may still be running");
    console.log(`   pid: ${pid}`);
  } else {
    console.log("✅ Console UI stopped");
    console.log(`   pid: ${pid}`);
  }
  console.log(`   pidFile: ${getConsoleUiPidPath()}`);
  console.log(`   log: ${getConsoleUiLogPath()}`);
}
