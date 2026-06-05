/**
 * `town console`：Town gateway 进程管理与前台运行入口。
 *
 * 关键点（中文）
 * - 默认 `town console` 等同于 `town console start`。
 * - `run` 仅供内部使用（真正启动 gateway 进程）。
 * - 这里管理的是 Town gateway，不是单 agent control API。
 */

import fs from "fs-extra";
import { spawn } from "node:child_process";
import {
  getTownRuntimeDirPath,
  getGatewayLogPath,
  getGatewayMetaPath,
  getGatewayPidPath,
} from "../../../process/registry/TownPaths.js";
import {
  isTownProcessAlive,
  isTownRunning,
} from "../../../process/registry/TownRuntime.js";
import {
  findDetachedBayProcesses,
  signalDetachedProcess,
  sweepDetachedBayProcesses,
} from "../../../process/registry/ProcessSweep.js";
import { createGatewayServer } from "../GatewayServer.js";
import type {
  ControlPlaneRuntimeMeta as GatewayRuntimeMeta,
  ControlPlaneRuntimeStatus as GatewayRuntimeStatus,
} from "@downcity/agent";
import { emitCliBlock } from "../../../shared/CliReporter.js";
import { CliError } from "../../../shared/CliError.js";
import { buildGatewayPortFacts } from "../../../shared/PortHints.js";
import { resolveGatewayPublicUrl } from "../../../shared/PublicAccess.js";
import { mergePersistedGatewayStartOptions } from "./GatewayPublicMode.js";

const DEFAULT_GATEWAY_HOST = "127.0.0.1";
const DEFAULT_GATEWAY_PORT = 5315;
const PUBLIC_GATEWAY_HOST = "0.0.0.0";

/**
 * gateway 模块启动参数。
 */
export interface GatewayStartOptions {
  /**
   * 是否以公网模式暴露 Town gateway。
   */
  public?: boolean;

  /**
   * Town gateway 监听端口。
   */
  port?: number;

  /**
   * Town gateway 监听主机。
   */
  host?: string;
}

/**
 * 安全读取 gateway pid。
 */
export async function readGatewayPid(): Promise<number | null> {
  try {
    const raw = await fs.readFile(getGatewayPidPath(), "utf-8");
    const pid = Number.parseInt(String(raw || "").trim(), 10);
    if (!Number.isFinite(pid) || Number.isNaN(pid) || pid < 1) return null;
    return pid;
  } catch {
    return null;
  }
}

/**
 * 安全读取 gateway 元数据。
 */
async function readGatewayMeta(): Promise<GatewayRuntimeMeta | null> {
  try {
    const raw = (await fs.readJson(getGatewayMetaPath())) as Partial<GatewayRuntimeMeta>;
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
 * 清理 gateway 状态文件。
 */
async function cleanupGatewayStateFiles(): Promise<void> {
  try {
    await fs.remove(getGatewayPidPath());
  } catch {
    // ignore
  }
  try {
    await fs.remove(getGatewayMetaPath());
  } catch {
    // ignore
  }
}

/**
 * 规范化 host，避免展示通配地址。
 */
function normalizeHost(host: string): string {
  const value = String(host || "").trim();
  if (!value) return DEFAULT_GATEWAY_HOST;
  if (value === "0.0.0.0" || value === "::") return "127.0.0.1";
  return value;
}

/**
 * 规范化真实绑定 host。
 */
function normalizeBindHost(host: string): string {
  const value = String(host || "").trim();
  return value || DEFAULT_GATEWAY_HOST;
}

/**
 * 判断两个 Console 绑定端点是否一致。
 *
 * 关键点（中文）
 * - `127.0.0.1` 和 `0.0.0.0` 不能视为同一个绑定端点。
 * - 这是 `start -p` 是否已经生效的核心判断，避免本机监听被误报成公网监听。
 */
export function isGatewayBindingMatch(actualHost: string, expectedHost: string): boolean {
  return normalizeBindHost(actualHost).toLowerCase() ===
    normalizeBindHost(expectedHost).toLowerCase();
}

/**
 * 生成重新绑定 Console 的命令提示。
 */
function formatGatewayRestartHint(
  options: GatewayStartOptions | undefined,
  port: number,
): string {
  const parts = ["town", "console", "restart"];
  if (options?.public === true) parts.push("-p");
  const explicitHost = String(options?.host || "").trim();
  if (explicitHost) parts.push("--host", explicitHost);
  if (port !== DEFAULT_GATEWAY_PORT) parts.push("--port", String(port));
  return parts.join(" ");
}

/**
 * 解析 Console 实际监听 host。
 *
 * 关键点（中文）
 * - 用户显式传 `--host` 时，始终尊重显式值。
 * - 传 `--public` 时，默认切到 `0.0.0.0`，方便服务器直接对外暴露。
 * - 未传 host/public 时，仍保持本机模式 `127.0.0.1`。
 */
export function resolveGatewayHostForBinding(
  options?: GatewayStartOptions,
): string {
  const explicitHost = String(options?.host || "").trim();
  if (explicitHost) return explicitHost;
  if (options?.public === true) return PUBLIC_GATEWAY_HOST;
  return DEFAULT_GATEWAY_HOST;
}

/**
 * 解析 detached Console 命令行中的 host/port。
 */
export function parseGatewayProcessCommand(command: string): {
  host: string;
  port: number;
} | null {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  if (!/\bconsole run\b/.test(normalized)) return null;

  const hostMatch = normalized.match(/(?:^|\s)--host\s+(\S+)/);
  const portMatch = normalized.match(/(?:^|\s)--port\s+(\d+)/);
  const host = normalizeBindHost(hostMatch?.[1] || DEFAULT_GATEWAY_HOST);
  const port = Number.parseInt(portMatch?.[1] || String(DEFAULT_GATEWAY_PORT), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  return {
    host,
    port,
  };
}

/**
 * 从 detached 进程列表中挑选可复用的 Console 进程。
 */
export function findReusableGatewayProcess(
  processes: Array<{ pid: number; command: string }>,
  expected: {
    host?: string;
    port: number;
  },
): {
  pid: number;
  host: string;
  port: number;
} | null {
  const expectedHost = String(expected.host || "").trim()
    ? normalizeBindHost(String(expected.host))
    : "";
  const expectedPort = expected.port;

  for (const item of processes) {
    const parsed = parseGatewayProcessCommand(item.command);
    if (!parsed) continue;
    if (parsed.port !== expectedPort) continue;
    if (expectedHost && !isGatewayBindingMatch(parsed.host, expectedHost)) continue;
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
): Promise<GatewayRuntimeStatus | null> {
  const host = String(expected?.host || "").trim()
    ? normalizeBindHost(String(expected?.host))
    : "";
  const port =
    typeof expected?.port === "number" && Number.isInteger(expected.port)
      ? expected.port
      : DEFAULT_GATEWAY_PORT;

  const processes = await findDetachedBayProcesses({
    includeUi: true,
  });
  const reusable = findReusableGatewayProcess(processes, { host, port });
  if (!reusable) return null;

  const meta: GatewayRuntimeMeta = {
    pid: reusable.pid,
    host: reusable.host,
    port: reusable.port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getGatewayPidPath(), String(reusable.pid), "utf-8");
  await fs.writeJson(getGatewayMetaPath(), meta, { spaces: 2 });

  return {
    running: true,
    pid: reusable.pid,
    host: normalizeHost(reusable.host),
    bindHost: reusable.host,
    port: reusable.port,
    url: `http://${normalizeHost(reusable.host)}:${reusable.port}`,
    logPath: getGatewayLogPath(),
    pidPath: getGatewayPidPath(),
  };
}

/**
 * 获取 Console 当前运行状态。
 */
export async function getGatewayRuntimeStatus(): Promise<GatewayRuntimeStatus> {
  const pidPath = getGatewayPidPath();
  const logPath = getGatewayLogPath();
  const meta = await readGatewayMeta();
  const pid = await readGatewayPid();
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

  if (!isTownProcessAlive(pid)) {
    await cleanupGatewayStateFiles();
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

  const bindHost = normalizeBindHost(meta?.host || DEFAULT_GATEWAY_HOST);
  const host = normalizeHost(bindHost);
  const port =
    meta && Number.isInteger(meta.port) ? meta.port : DEFAULT_GATEWAY_PORT;
  return {
    running: true,
    pid,
    host,
    bindHost,
    port,
    url: `http://${host}:${port}`,
    logPath,
    pidPath,
  };
}

/**
 * 前台运行 Console 网关（内部 run 命令）。
 */
export async function runGatewayRuntimeCommand(
  options?: GatewayStartOptions,
): Promise<void> {
  const host = resolveGatewayHostForBinding(options);
  const port =
    typeof options?.port === "number" && Number.isInteger(options.port)
      ? options.port
      : DEFAULT_GATEWAY_PORT;

  const gateway = createGatewayServer();
  await gateway.start({ host, port });

  const visibleHost = normalizeHost(host);
  const publicUrl = resolveGatewayPublicUrl({
    bindHost: host,
    port,
    publicMode: options?.public === true,
  });
  emitCliBlock({
    tone: "success",
    title: "Gateway started",
    summary: "foreground",
    facts: buildGatewayPortFacts(`http://${visibleHost}:${port}`, {
      publicUrl,
    }),
    note: "单个 Console 实例可切换查看多个已运行 agent。",
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, stopping gateway...`);
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
/**
 * 轮询 HTTP health endpoint，直到成功或超时。
 */
async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) return true;
    } catch {
      // 继续轮询
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export async function startGatewayRuntimeCommand(params: {
  options?: GatewayStartOptions;
  cliPath: string;
}): Promise<void> {
  if (!(await isTownRunning())) {
    throw new CliError({
      title: "town runtime is not running",
      fix: "town start",
    });
  }

  const effectiveOptions = await mergePersistedGatewayStartOptions(params.options);
  const host = resolveGatewayHostForBinding(effectiveOptions);
  const port =
    typeof effectiveOptions.port === "number" && Number.isInteger(effectiveOptions.port)
      ? effectiveOptions.port
      : DEFAULT_GATEWAY_PORT;

  const status = await getGatewayRuntimeStatus();
  if (status.running) {
    const statusUrl = String(status.url || "").trim();
    const currentBindHost = normalizeBindHost(
      status.bindHost || status.host || DEFAULT_GATEWAY_HOST,
    );
    const currentPort = status.port || DEFAULT_GATEWAY_PORT;
    const sameEndpoint =
      isGatewayBindingMatch(currentBindHost, host) && currentPort === port;
    const restartHint = formatGatewayRestartHint(effectiveOptions, port);
    const publicUrl = sameEndpoint
      ? resolveGatewayPublicUrl({
          bindHost: currentBindHost,
          port: currentPort,
          publicMode: effectiveOptions.public === true,
        })
      : null;
    emitCliBlock({
      tone: sameEndpoint ? "info" : "warning",
      title: "Gateway already running",
      summary: sameEndpoint ? undefined : "different binding",
      facts: statusUrl
        ? buildGatewayPortFacts(statusUrl, {
            publicUrl,
          })
        : [
            {
              label: "URL",
              value: `http://${normalizeHost(currentBindHost)}:${currentPort}`,
            },
          ],
      note: sameEndpoint
        ? undefined
        : `当前 Console 绑定 ${currentBindHost}:${currentPort}；如需改为 ${host}:${port}，请运行 \`${restartHint}\`。`,
    });
    return;
  }

  // 关键点（中文）：没有 pid 文件但可能还有旧版 UI 孤儿进程占着端口，先做一次兜底清扫。
  const sweep = await sweepDetachedBayProcesses({
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

  await fs.ensureDir(getTownRuntimeDirPath());
  const logPath = getGatewayLogPath();
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
        DOWNCITY_GATEWAY_UI: "1",
      },
    },
  );
  child.unref();
  if (!child.pid) {
    throw new Error("Failed to start console process (missing pid)");
  }

  const meta: GatewayRuntimeMeta = {
    pid: child.pid,
    host,
    port,
    startedAt: new Date().toISOString(),
  };
  await fs.writeFile(getGatewayPidPath(), String(child.pid), "utf-8");
  await fs.writeJson(getGatewayMetaPath(), meta, { spaces: 2 });

  // 关键点（中文）：等待子进程完成实际监听，避免“启动命令成功但端口已被占用导致秒退”时误报成功。
  const startedAt = Date.now();
  let childAlive = true;
  while (Date.now() - startedAt < 1_500) {
    if (!isTownProcessAlive(child.pid)) {
      childAlive = false;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!childAlive) {
    await cleanupGatewayStateFiles();
    throw new CliError({
      title: "Console exited before becoming ready",
      note: `Check log: ${logPath}`,
    });
  }

  // 关键点（中文）：进程存活后，再确认 HTTP 端口真正可用。
  const healthUrl = `http://${normalizeHost(host)}:${port}/health`;
  const healthOk = await waitForHttp(healthUrl, 5_000);
  if (!healthOk) {
    await cleanupGatewayStateFiles();
    throw new CliError({
      title: "Console health check failed",
      note: `Process is alive but ${healthUrl} is not responding. Check log: ${logPath}`,
    });
  }

  emitCliBlock({
    tone: "success",
    title: "Gateway started",
    facts: buildGatewayPortFacts(`http://${normalizeHost(host)}:${port}`, {
      publicUrl: resolveGatewayPublicUrl({
        bindHost: host,
        port,
        publicMode: effectiveOptions.public === true,
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
export async function restartGatewayRuntimeCommand(params: {
  options?: GatewayStartOptions;
  cliPath: string;
}): Promise<void> {
  await stopGatewayRuntimeCommand();
  await startGatewayRuntimeCommand(params);
}

/**
 * 停止后台 Console。
 */
export async function stopGatewayRuntimeCommand(params?: {
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params?.timeoutMs ?? 8000;
  const status = await getGatewayRuntimeStatus();
  if (!status.running || !status.pid) {
    const sweep = await sweepDetachedBayProcesses({
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
      title: "Gateway not running",
    });
    return;
  }

  const pid = status.pid;
  signalDetachedProcess(pid, "SIGTERM");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isTownProcessAlive(pid)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (isTownProcessAlive(pid)) {
    try {
      signalDetachedProcess(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await cleanupGatewayStateFiles();

  emitCliBlock({
    tone: isTownProcessAlive(pid) ? "warning" : "success",
    title: isTownProcessAlive(pid)
      ? "Console may still be running"
      : "Console stopped",
  });
}
