/**
 * Downcity daemon 管理（PID / 日志 / 启停）。
 *
 * 目标
 * - `city agent start`：后台启动（终端退出后仍运行）
 * - `city agent restart`：重启后台进程
 *
 * 约定
 * - 所有 daemon 相关文件都写入 `.downcity/debug/`，便于排查：
 *   - `downcity.pid`：进程 pid
 *   - `downcity.daemon.log`：stdout/stderr 合并日志
 *   - `downcity.daemon.json`：元数据（启动时间、参数等）
 */

import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { createConnection } from "node:net";
import { getDowncityDebugDirPath } from "@/city/config/Paths.js";
import {
  DAEMON_LOG_FILENAME,
  DAEMON_META_FILENAME,
  DAEMON_PID_FILENAME,
  type DaemonMeta,
  type DaemonStaleReason,
} from "@/city/process/daemon/Types.js";
import {
  markManagedAgentStopped,
  upsertManagedAgentEntry,
} from "@/city/process/registry/CityRegistry.js";
import { signalDetachedProcess } from "@/city/process/registry/ProcessSweep.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "@/city/env/ProcessEnv.js";

/**
 * 异步睡眠工具。
 */
const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const DAEMON_READY_TIMEOUT_MS = 15_000;
const DAEMON_READY_CONNECT_TIMEOUT_MS = 300;
const DAEMON_READY_POLL_INTERVAL_MS = 200;

/**
 * 计算 daemon pid 文件路径。
 */
export const getDaemonPidPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_PID_FILENAME);

/**
 * 计算 daemon 日志文件路径。
 */
export const getDaemonLogPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_LOG_FILENAME);

/**
 * 计算 daemon 元数据文件路径。
 */
export const getDaemonMetaPath = (projectRoot: string): string =>
  path.join(getDowncityDebugDirPath(projectRoot), DAEMON_META_FILENAME);

/**
 * 读取 daemon pid。
 *
 * 关键点（中文）
 * - 读取失败或内容非法统一返回 `null`，调用方走无进程分支。
 */
export const readDaemonPid = async (
  projectRoot: string,
): Promise<number | null> => {
  try {
    const raw = await fs.readFile(getDaemonPidPath(projectRoot), "utf-8");
    const pid = Number.parseInt(String(raw).trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
};

/**
 * 检查进程是否存活。
 */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * 读取 daemon meta（宽松模式）。
 *
 * 关键点（中文）
 * - 返回 null 表示文件缺失、解析失败或结构非法。
 * - 该函数用于状态展示，不抛异常。
 */
export const readDaemonMeta = async (
  projectRoot: string,
): Promise<DaemonMeta | null> => {
  try {
    const value = await fs.readJson(getDaemonMetaPath(projectRoot));
    const pid = Number((value as { pid?: unknown })?.pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const startedAt = String(
      (value as { startedAt?: unknown })?.startedAt || "",
    ).trim();
    if (!startedAt) return null;
    const command = String(
      (value as { command?: unknown })?.command || "",
    ).trim();
    const project = String(
      (value as { projectRoot?: unknown })?.projectRoot || "",
    ).trim();
    if (!command || !project) return null;
    return value as DaemonMeta;
  } catch {
    return null;
  }
};

/**
 * 诊断 stale 原因。
 */
export const diagnoseDaemonStaleReasons = async (
  projectRoot: string,
  pid: number,
): Promise<DaemonStaleReason[]> => {
  const reasons: DaemonStaleReason[] = [];
  reasons.push({
    code: "process_not_alive",
    message: "pid file exists but process is not alive",
  });

  const metaPath = getDaemonMetaPath(projectRoot);
  const metaExists = await fs.pathExists(metaPath);
  if (!metaExists) {
    reasons.push({
      code: "meta_missing",
      message: "daemon meta file is missing",
    });
    return reasons;
  }

  try {
    await fs.readJson(metaPath);
  } catch {
    reasons.push({
      code: "meta_invalid",
      message: "daemon meta file is invalid JSON",
    });
    return reasons;
  }

  const parsedMeta = await readDaemonMeta(projectRoot);
  if (!parsedMeta) {
    reasons.push({
      code: "meta_invalid",
      message: "daemon meta file has invalid structure",
    });
    return reasons;
  }

  if (parsedMeta.pid !== pid) {
    reasons.push({
      code: "meta_pid_mismatch",
      message: `meta pid (${parsedMeta.pid}) does not match pid file (${pid})`,
    });
  }

  const metaProjectRoot = path.resolve(String(parsedMeta.projectRoot || ""));
  const expectedProjectRoot = path.resolve(projectRoot);
  if (metaProjectRoot !== expectedProjectRoot) {
    reasons.push({
      code: "meta_project_mismatch",
      message: `meta project root mismatch (${metaProjectRoot})`,
    });
  }

  return reasons;
};

/**
 * 清理僵尸 daemon 标记文件。
 *
 * 算法（中文）
 * - 若 pid 文件存在但进程不存在，移除 pid/meta，恢复可重启状态。
 */
export const cleanupStaleDaemonFiles = async (
  projectRoot: string,
): Promise<void> => {
  const pid = await readDaemonPid(projectRoot);
  if (!pid) return;
  if (isProcessAlive(pid)) return;

  // 关键注释：pid 文件存在但进程已退出，属于“脏状态”，这里直接清理。
  await fs.remove(getDaemonPidPath(projectRoot));
  await fs.remove(getDaemonMetaPath(projectRoot));
  // 关键点（中文）：僵尸 daemon 清理时标记 stopped，保留历史记录。
  try {
    await markManagedAgentStopped(projectRoot);
  } catch {
    // ignore registry sync errors
  }
};

/**
 * 写入 daemon pid 与元数据文件。
 */
export const writeDaemonFiles = async (
  projectRoot: string,
  meta: DaemonMeta,
): Promise<void> => {
  await fs.ensureDir(getDowncityDebugDirPath(projectRoot));
  await fs.writeFile(getDaemonPidPath(projectRoot), String(meta.pid), "utf-8");
  await fs.writeJson(getDaemonMetaPath(projectRoot), meta, { spaces: 2 });
};

/**
 * 读取 CLI 参数值。
 *
 * 关键点（中文）
 * - 支持 `--key value` 与 `--key=value` 两种形态，便于后续 CLI 参数格式演进。
 */
function pickArgValue(args: string[], key: string): string | undefined {
  const inlinePrefix = `${key}=`;
  const inlineValue = args
    .map((item) => String(item).trim())
    .find((item) => item.startsWith(inlinePrefix));
  if (inlineValue) {
    const value = inlineValue.slice(inlinePrefix.length).trim();
    return value || undefined;
  }

  const idx = args.findIndex((item) => String(item).trim() === key);
  if (idx < 0) return undefined;
  const next = String(args[idx + 1] || "").trim();
  return next || undefined;
}

/**
 * 解析端口值。
 */
function parsePortLike(input: string | number | undefined): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const raw =
    typeof input === "number" ? input : Number.parseInt(String(input), 10);
  if (!Number.isFinite(raw) || Number.isNaN(raw)) return undefined;
  if (!Number.isInteger(raw) || raw <= 0 || raw > 65535) return undefined;
  return raw;
}

/**
 * 尝试建立 TCP 连接。
 *
 * 关键点（中文）
 * - 这里只验证 RPC 端口已监听，不耦合 `@downcity/agent` 的具体协议实现。
 */
async function canConnectTcp(params: {
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(success);
    };

    const socket = createConnection({
      host: params.host,
      port: params.port,
    });
    socket.setTimeout(params.timeoutMs ?? DAEMON_READY_CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

/**
 * 等待 daemon RPC 进入可连接状态。
 */
async function waitForDaemonReady(params: {
  pid: number;
  args: string[];
  timeoutMs?: number;
}): Promise<void> {
  const rpc_port = parsePortLike(pickArgValue(params.args, "--rpc-port"));
  if (!rpc_port) {
    throw new Error("Daemon RPC port is missing from startup arguments");
  }

  // 关键点（中文）：Agent RPC 在前台运行入口固定监听本机地址，不能复用 HTTP gateway host。
  const rpc_host = "127.0.0.1";
  const timeout_ms = params.timeoutMs ?? DAEMON_READY_TIMEOUT_MS;
  const started_at = Date.now();

  while (Date.now() - started_at < timeout_ms) {
    if (!isProcessAlive(params.pid)) {
      throw new Error(
        `Daemon process exited before RPC became ready (${rpc_host}:${rpc_port})`,
      );
    }

    if (
      await canConnectTcp({
        host: rpc_host,
        port: rpc_port,
      })
    ) {
      return;
    }

    await sleep(DAEMON_READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Daemon RPC did not become ready at ${rpc_host}:${rpc_port} within ${timeout_ms}ms`,
  );
}

/**
 * 回滚启动失败状态。
 */
async function rollbackDaemonStartup(params: {
  projectRoot: string;
  pid: number;
}): Promise<void> {
  signalDetachedProcess(params.pid, "SIGTERM");
  await sleep(300);
  try {
    if (isProcessAlive(params.pid)) signalDetachedProcess(params.pid, "SIGKILL");
  } catch {
    // ignore
  }
  await fs.remove(getDaemonPidPath(params.projectRoot));
  await fs.remove(getDaemonMetaPath(params.projectRoot));
  try {
    await markManagedAgentStopped(params.projectRoot);
  } catch {
    // ignore registry sync errors
  }
}

/**
 * 启动 daemon 子进程。
 *
 * 流程（中文）
 * 1) 清理脏 pid/meta
 * 2) 检查是否已有存活 daemon
 * 3) detached + unref 拉起 `node cli.js run ...`
 * 4) 写入 pid/meta 供 stop/restart 使用
 */
export const startDaemonProcess = async (params: {
  projectRoot: string;
  cliPath: string;
  args: string[];
}): Promise<{ pid: number; logPath: string }> => {
  const { projectRoot, cliPath, args } = params;

  await fs.ensureDir(getDowncityDebugDirPath(projectRoot));
  await cleanupStaleDaemonFiles(projectRoot);

  const existingPid = await readDaemonPid(projectRoot);
  if (existingPid && isProcessAlive(existingPid)) {
    throw new Error(`Daemon already running (pid: ${existingPid})`);
  }

  const logPath = getDaemonLogPath(projectRoot);
  const logFd = fs.openSync(logPath, "a");

  const childEnv: NodeJS.ProcessEnv = {
    ...mergeProcessEnvWithPlatformGlobalEnv(process.env),
    DOWNCITY_DAEMON: "1",
  };

  // 关键注释：daemon 进程必须 detached + unref 才能在父进程退出后继续运行。
  const child = spawn(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: childEnv,
  });

  child.unref();

  if (!child.pid) {
    fs.closeSync(logFd);
    throw new Error("Failed to start daemon process (missing pid)");
  }

  await writeDaemonFiles(projectRoot, {
    pid: child.pid,
    projectRoot,
    startedAt: new Date().toISOString(),
    command: process.execPath,
    args: [cliPath, ...args],
    node: process.version,
    platform: process.platform,
  });

  // 关键点（中文）：只有 RPC 端口可连接后，才把 daemon 视为真正启动成功。
  try {
    await waitForDaemonReady({
      pid: child.pid,
      args,
    });

    // 关键点（中文）：启动成功后必须登记到 managed agent registry，否则该 daemon 视为“无效启动”。
    await upsertManagedAgentEntry({
      projectRoot,
      pid: child.pid,
      status: "running",
    });
  } catch (error) {
    // 回滚：无法 ready 或无法登记时立即停止 daemon 并清理状态文件。
    await rollbackDaemonStartup({
      projectRoot,
      pid: child.pid,
    });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}. Check daemon log: ${logPath}`);
  }

  return { pid: child.pid, logPath };
};

/**
 * 停止 daemon 子进程。
 *
 * 策略（中文）
 * - 先发 `SIGTERM` 做优雅退出；超时后回退 `SIGKILL`。
 * - 无论 stop 结果如何，最终清理 pid/meta，避免状态残留。
 */
export const stopDaemonProcess = async (params: {
  projectRoot: string;
  timeoutMs?: number;
}): Promise<{ stopped: boolean; pid?: number }> => {
  const { projectRoot, timeoutMs = 10_000 } = params;

  await cleanupStaleDaemonFiles(projectRoot);
  const pid = await readDaemonPid(projectRoot);
  if (!pid) return { stopped: false };

  if (!isProcessAlive(pid)) {
    await fs.remove(getDaemonPidPath(projectRoot));
    await fs.remove(getDaemonMetaPath(projectRoot));
    return { stopped: false, pid };
  }

  signalDetachedProcess(pid, "SIGTERM");

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) break;
    await sleep(200);
  }

  if (isProcessAlive(pid)) {
    // 关键注释：尽量优雅停止，超时后再强杀，避免后台进程“卡死”。
    try {
      signalDetachedProcess(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  await fs.remove(getDaemonPidPath(projectRoot));
  await fs.remove(getDaemonMetaPath(projectRoot));
  // 关键点（中文）：停止后标记为 stopped，保留历史记录。
  try {
    await markManagedAgentStopped(projectRoot);
  } catch {
    // ignore registry sync errors
  }

  return { stopped: true, pid };
};
