/**
 * `city console`：Console 模块进程管理与前台运行入口。
 *
 * 关键点（中文）
 * - 默认 `city console` 等同于 `city console start`。
 * - `run` 仅供内部使用（真正启动 Console 网关进程）。
 */

import fs from "fs-extra";
import { spawn } from "node:child_process";
import {
  getCityRuntimeDirPath,
  getConsoleLogPath,
  getConsoleMetaPath,
  getConsolePidPath,
} from "@/main/city/runtime/CityPaths.js";
import {
  isCityProcessAlive,
  isCityRunning,
} from "@/main/city/runtime/CityRuntime.js";
import {
  findDetachedCityProcesses,
  sweepDetachedCityProcesses,
} from "@/main/city/runtime/ProcessSweep.js";
import { createConsoleGateway } from "@/main/modules/console/ConsoleGateway.js";
import type {
  ConsoleRuntimeMeta,
  ConsoleRuntimeStatus,
} from "@/shared/types/Console.js";
import { emitCliBlock } from "./CliReporter.js";
import { buildConsolePortFacts } from "./PortHints.js";
import { resolveConsolePublicUrl } from "./PublicAccess.js";

const DEFAULT_CONSOLE_HOST = "127.0.0.1";
const DEFAULT_CONSOLE_PORT = 5315;
const PUBLIC_CONSOLE_HOST = "0.0.0.0";

/**
 * Console 模块启动参数。
 */
export interface ConsoleStartOptions {
  /**
   * 是否以公网模式暴露 Console。
   */
  public?: boolean;

  /**
   * Console 监听端口。
   */
  port?: number;

  /**
   * Console 监听主机。
   */
  host?: string;
}

/**
 * 安全读取 Console 模块 pid。
 */
export async function readConsolePid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getConsolePidPath(), "utf-8");
    const pid = Number.parseInt(String(raw || "").trim(), 10);
    if (!Number.isFinite(pid) || Number.isNaN(pid) || pid < 1) return null;
    return pid;
  } catch {
    return null;
  }
}

/**
 * 安全读取 Console 模块元数据。
 */
async function readConsoleMeta(): Promise<ConsoleRuntimeMeta | null> {
  try {
    const raw = (await fs.readJson(getConsoleMetaPath())) as Partial<ConsoleRuntimeMeta>;
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
 * 清理 Console 模块状态文件。
 */
async function cleanupConsoleStateFiles(): Promise<void> {
  try {
    await fs.remove(getConsolePidPath());
  } catch {
    // ignore
  }
  try {
    await fs.remove(getConsoleMetaPath());
  } catch {
    // ignore
  }
}

/**
 * 规范化 host，避免展示通配地址。
 */
function normalizeHost(host: string): string {
  const value = String(host || "").trim();
  if (!value) return DEFAULT_CONSOLE_HOST;
  if (value === "0.0.0.0" || value === "::") return "127.0.0.1";
  return value;
}

/**
 * 解析 Console 实际监听 host。
 *
 * 关键点（中文）
 * - 用户显式传 `--host` 时，始终尊重显式值。
 * - 传 `--public` 时，默认切到 `0.0.0.0`，方便服务器直接对外暴露。
 * - 未传 host/public 时，仍保持本机模式 `127.0.0.1`。
 */
export function resolveConsoleHostForBinding(
  options?: ConsoleStartOptions,
): string {
  const explicitHost = String(options?.host || "").trim();
  if (explicitHost) return explicitHost;
  if (options?.public === true) return PUBLIC_CONSOLE_HOST;
  return DEFAULT_CONSOLE_HOST;
}

/**
 * 解析 detached Console 命令行中的 host/port。
 */
export function parseConsoleProcessCommand(command: string): {
  host: string;
  port: number;
} | null {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  if (!/\bconsole run\b/.test(normalized)) return null;

  const hostMatch = normalized.match(/(?:^|\s)--host\s+(\S+)/);
  const portMatch = normalized.match(/(?:^|\s)--port\s+(\d+)/);
  const host = normalizeHost(hostMatch?.[1] || DEFAULT_CONSOLE_HOST);
  const port = Number.parseInt(portMatch?.[1] || String(DEFAULT_CONSOLE_PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return {
    host,
    port,
  };
}

/**
 * 从 detached 进程列表中挑选可复用的 Console 进程。
 */
export function findReusableConsoleProcess(
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
    const parsed = parseConsoleProcessCommand(item.command);
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
 * 尝试从 detached Console 进程恢复 pid/meta 状态文件。
 */
async function recoverDetachedConsoleStatus(
  expected?: {
    host?: string;
    port?: number;
  },
): Promise<ConsoleRuntimeStatus | null> {
  const host = normalizeHost(expected?.host || DEFAULT_CONSOLE_HOST);
  const port =
    typeof expected?.port === "number" && Number.isInteger(expected.port)
      ? expected.port
      : DEFAULT_CONSOLE_PORT;

  const processes = await findDetachedCityProcesses({
    includeUi: true,
  });
  const reusable = findReusableConsoleProcess(processes, { host, port });
  if (!reusable) return null;

  const meta: ConsoleRuntimeMeta = {
    pid: reusable.pid,
    host: reusable.host,
    port: reusable.port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getConsolePidPath(), String(reusable.pid), "utf-8");
  await fs.writeJson(getConsoleMetaPath(), meta, { spaces: 2 });

  return {
    running: true,
    pid: reusable.pid,
    host: reusable.host,
    port: reusable.port,
    url: `http://${reusable.host}:${reusable.port}`,
    logPath: getConsoleLogPath(),
    pidPath: getConsolePidPath(),
  };
}

/**
 * 获取 Console 当前运行状态。
 */
export async function getConsoleRuntimeStatus(): Promise<ConsoleRuntimeStatus> {
  const pidPath = getConsolePidPath();
  const logPath = getConsoleLogPath();
  const meta = await readConsoleMeta();
  const pid = await readConsolePid();
  if (!pid) {
    const recovered = await recoverDetachedConsoleStatus({
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

  if (!isCityProcessAlive(pid)) {
    await cleanupConsoleStateFiles();
    const recovered = await recoverDetachedConsoleStatus({
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

  const host = normalizeHost(meta?.host || DEFAULT_CONSOLE_HOST);
  const port =
    meta && Number.isInteger(meta.port) ? meta.port : DEFAULT_CONSOLE_PORT;
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
 * 前台运行 Console 网关（内部 run 命令）。
 */
export async function runConsoleRuntimeCommand(
  options?: ConsoleStartOptions,
): Promise<void> {
  const host = resolveConsoleHostForBinding(options);
  const port =
    typeof options?.port === "number" && Number.isInteger(options.port)
      ? options.port
      : DEFAULT_CONSOLE_PORT;

  const gateway = createConsoleGateway();
  await gateway.start({ host, port });

  const visibleHost = normalizeHost(host);
  const publicUrl = resolveConsolePublicUrl({
    bindHost: host,
    port,
    publicMode: options?.public === true,
  });
  emitCliBlock({
    tone: "success",
    title: "Console started",
    summary: "foreground",
    facts: buildConsolePortFacts(`http://${visibleHost}:${port}`, {
      publicUrl,
    }),
    note: "单个 Console 实例可切换查看多个已运行 agent。",
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, stopping console...`);
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
 * 后台启动 Console。
 */
export async function startConsoleCommand(params: {
  options?: ConsoleStartOptions;
  cliPath: string;
}): Promise<void> {
  if (!(await isCityRunning())) {
    console.error(
      "❌ city runtime is not running. Please run `city start` first.",
    );
    process.exit(1);
  }

  const status = await getConsoleRuntimeStatus();
  if (status.running) {
    const statusUrl = String(status.url || "").trim();
    const publicUrl = resolveConsolePublicUrl({
      bindHost: params.options?.host || "",
      port: status.port || DEFAULT_CONSOLE_PORT,
      publicMode: params.options?.public === true,
    });
    emitCliBlock({
      tone: "info",
      title: "Console already running",
      facts: statusUrl
        ? buildConsolePortFacts(statusUrl, {
            publicUrl,
          })
        : [],
    });
    return;
  }

  // 关键点（中文）：没有 pid 文件但可能还有旧版 UI 孤儿进程占着端口，先做一次兜底清扫。
  const sweep = await sweepDetachedCityProcesses({
    includeUi: true,
  });
  for (const item of sweep.stopped) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan Console process cleaned",
    });
  }
  for (const item of sweep.alive) {
    emitCliBlock({
      tone: "warning",
      title: "Orphan Console process still alive",
    });
  }

  const host = resolveConsoleHostForBinding(params.options);
  const port =
    typeof params.options?.port === "number" && Number.isInteger(params.options.port)
      ? params.options.port
      : DEFAULT_CONSOLE_PORT;

  await fs.ensureDir(getCityRuntimeDirPath());
  const logPath = getConsoleLogPath();
  const logFd = fs.openSync(logPath, "a");

  const child = spawn(
    process.execPath,
    [params.cliPath, "console", "run", "--host", host, "--port", String(port)],
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
    throw new Error("Failed to start console process (missing pid)");
  }

  const meta: ConsoleRuntimeMeta = {
    pid: child.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getConsolePidPath(), String(child.pid), "utf-8");
  await fs.writeJson(getConsoleMetaPath(), meta, { spaces: 2 });

  // 关键点（中文）：等待子进程完成实际监听，避免“启动命令成功但端口已被占用导致秒退”时误报成功。
  const startedAt = Date.now();
  let childAlive = true;
  while (Date.now() - startedAt < 1_500) {
    if (!isCityProcessAlive(child.pid)) {
      childAlive = false;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!childAlive) {
    await cleanupConsoleStateFiles();
    throw new Error(
      `Console exited before becoming ready. Please check log: ${logPath}`,
    );
  }

  emitCliBlock({
    tone: "success",
    title: "Console started",
    facts: buildConsolePortFacts(`http://${normalizeHost(host)}:${port}`, {
      publicUrl: resolveConsolePublicUrl({
        bindHost: host,
        port,
        publicMode: params.options?.public === true,
      }),
    }),
  });
}

/**
 * 重启后台 Console。
 *
 * 关键点（中文）
 * - 先 stop 再 start，保证加载最新代码与路由。
 * - 支持通过 options 覆盖 host/port。
 */
export async function restartConsoleCommand(params: {
  options?: ConsoleStartOptions;
  cliPath: string;
}): Promise<void> {
  await stopConsoleCommand();
  await startConsoleCommand(params);
}

/**
 * 停止后台 Console。
 */
export async function stopConsoleCommand(params?: {
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 8000;
  const status = await getConsoleRuntimeStatus();
  if (!status.running || !status.pid) {
    const sweep = await sweepDetachedCityProcesses({
      includeUi: true,
      timeoutMs,
    });
    if (sweep.stopped.length > 0 || sweep.alive.length > 0) {
      for (const item of sweep.stopped) {
        emitCliBlock({
          tone: "success",
          title: "Orphan Console stopped",
        });
      }
      for (const item of sweep.alive) {
        emitCliBlock({
          tone: "warning",
          title: "Orphan Console may still be running",
        });
      }
      return;
    }
    emitCliBlock({
      tone: "info",
      title: "Console not running",
    });
    return;
  }

  const pid = status.pid;
  process.kill(pid, "SIGTERM");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isCityProcessAlive(pid)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (isCityProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await cleanupConsoleStateFiles();

  emitCliBlock({
    tone: isCityProcessAlive(pid) ? "warning" : "success",
    title: isCityProcessAlive(pid)
      ? "Console may still be running"
      : "Console stopped",
  });
}
