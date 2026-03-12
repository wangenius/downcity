/**
 * `sma console ui`：console UI 进程管理与前台运行入口。
 *
 * 关键点（中文）
 * - 默认 `sma console ui` 等同于 `sma console ui start`。
 * - `run` 仅供内部使用（真正启动 UI 网关进程）。
 */

import fs from "fs-extra";
import { spawn } from "node:child_process";
import {
  getConsoleRuntimeDirPath,
  getConsoleUiLogPath,
  getConsoleUiMetaPath,
  getConsoleUiPidPath,
} from "@/console/runtime/ConsolePaths.js";
import {
  isConsoleProcessAlive,
  isConsoleRunning,
} from "@/console/runtime/ConsoleRuntime.js";
import { createConsoleUIGateway } from "@console/ui/ConsoleUIGateway.js";
import type {
  ConsoleUiRuntimeMeta,
  ConsoleUiRuntimeStatus,
} from "@/types/ConsoleUI.js";

const DEFAULT_UI_HOST = "127.0.0.1";
const DEFAULT_UI_PORT = 3001;

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
 * 获取 UI 当前运行状态。
 */
export async function getConsoleUiRuntimeStatus(): Promise<ConsoleUiRuntimeStatus> {
  const pidPath = getConsoleUiPidPath();
  const logPath = getConsoleUiLogPath();
  const pid = await readConsoleUiPid();
  if (!pid) {
    return {
      running: false,
      logPath,
      pidPath,
    };
  }

  if (!isConsoleProcessAlive(pid)) {
    await cleanupConsoleUiStateFiles();
    return {
      running: false,
      logPath,
      pidPath,
    };
  }

  const meta = await readConsoleUiMeta();
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
      "❌ console is not running. Please run `sma console start` first.",
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
        SHIPMYAGENT_CONSOLE_UI: "1",
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

  console.log("✅ Console UI started");
  console.log(`   pid: ${child.pid}`);
  console.log(`   url: http://${normalizeHost(host)}:${port}`);
  console.log(`   log: ${logPath}`);
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

