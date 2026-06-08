/**
 * Linux Bubblewrap sandbox backend。
 *
 * 关键点（中文）
 * - 基于 `bwrap` 提供 Linux 本机 shell sandbox。
 * - 继续保持“shell 命令必须进入 sandbox”的安全语义，不提供宿主机裸跑回退。
 * - 边界与 macOS backend 对齐：路径、环境变量、网络、agent 级共享 HOME/TMPDIR/cache。
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import type {
  SandboxSpawnParams,
  SandboxSpawnResult,
} from "@/sandbox/types/SandboxRuntime.js";

const DEFAULT_PATH_VALUE =
  "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin";

function dedupeExistingPaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = path.resolve(String(value || "").trim());
    if (!normalized || seen.has(normalized)) continue;
    if (!fs.existsSync(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildReadablePaths(params: {
  rootPath: string;
  shellPath: string;
  sandboxDir: string;
  tmpDir: string;
  cacheDir: string;
}): string[] {
  return dedupeExistingPaths([
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/etc",
    params.rootPath,
    params.sandboxDir,
    params.tmpDir,
    params.cacheDir,
    path.dirname(params.shellPath),
  ]);
}

function buildWritablePaths(params: SandboxSpawnParams): string[] {
  return dedupeExistingPaths([
    ...params.config.writablePaths,
    params.executionDir,
    params.config.sandboxDir,
    params.config.tmpDir,
    params.config.cacheDir,
  ]);
}

function isPathCoveredBy(paths: string[], targetPath: string): boolean {
  const normalizedTarget = path.resolve(targetPath);
  return paths.some((value) => {
    const normalizedValue = path.resolve(value);
    if (normalizedValue === normalizedTarget) return true;
    const relative = path.relative(normalizedValue, normalizedTarget);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function buildSandboxEnv(params: SandboxSpawnParams): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of params.config.envAllowlist) {
    const value = params.baseEnv[key];
    if (typeof value !== "string" || !value.trim()) continue;
    env[key] = value;
  }

  for (const [key, value] of Object.entries(params.baseEnv)) {
    if (!key.startsWith("DC_")) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    env[key] = value;
  }

  env.PATH = String(env.PATH || params.baseEnv.PATH || DEFAULT_PATH_VALUE);
  env.HOME = params.config.homeDir;
  env.TMPDIR = params.config.tmpDir;
  env.XDG_CACHE_HOME = params.config.cacheDir;
  env.DC_SANDBOX = "1";
  env.DC_SANDBOX_DIR = params.config.sandboxDir;
  env.DC_SANDBOX_HOME = params.config.homeDir;
  env.DC_SANDBOX_CACHE = params.config.cacheDir;
  env.SHELL = params.shellPath;

  return env;
}

function addReadOnlyBind(args: string[], sourcePath: string): void {
  args.push("--ro-bind", sourcePath, sourcePath);
}

function addWritableBind(args: string[], sourcePath: string): void {
  args.push("--bind", sourcePath, sourcePath);
}

function addParentDirs(args: string[], targetPath: string, createdDirs: Set<string>): void {
  const parts = path.resolve(targetPath).split(path.sep).filter(Boolean);
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = `${current}/${parts[index]}`;
    if (createdDirs.has(current)) continue;
    createdDirs.add(current);
    args.push("--dir", current);
  }
}

export function buildLinuxBubblewrapArgs(params: SandboxSpawnParams & {
  actualCwd: string;
}): string[] {
  const readablePaths = buildReadablePaths({
    rootPath: params.config.rootPath,
    shellPath: params.shellPath,
    sandboxDir: params.config.sandboxDir,
    tmpDir: params.config.tmpDir,
    cacheDir: params.config.cacheDir,
  });
  const writablePaths = buildWritablePaths(params);
  const writableSet = new Set(writablePaths);
  const createdDirs = new Set<string>();
  const mountedPaths: string[] = [];
  const args = [
    "--die-with-parent",
    "--unshare-pid",
    "--proc",
    "/proc",
    "--dev",
    "/dev",
  ];

  if (params.config.networkMode === "off") {
    args.push("--unshare-net");
  }

  for (const readablePath of readablePaths) {
    if (writableSet.has(readablePath)) continue;
    if (!isPathCoveredBy(mountedPaths, readablePath)) {
      addParentDirs(args, readablePath, createdDirs);
    }
    addReadOnlyBind(args, readablePath);
    mountedPaths.push(readablePath);
  }

  for (const writablePath of writablePaths) {
    if (isPathCoveredBy(mountedPaths, writablePath)) continue;
    addParentDirs(args, writablePath, createdDirs);
    addWritableBind(args, writablePath);
    mountedPaths.push(writablePath);
  }

  if (
    !isPathCoveredBy(readablePaths, params.actualCwd) &&
    !isPathCoveredBy(writablePaths, params.actualCwd)
  ) {
    if (!isPathCoveredBy(mountedPaths, params.actualCwd)) {
      addParentDirs(args, params.actualCwd, createdDirs);
    }
    addReadOnlyBind(args, params.actualCwd);
  }

  args.push(
    "--chdir",
    params.actualCwd,
    params.shellPath,
    params.login ? "-lc" : "-c",
    params.cmd,
  );
  return args;
}

/**
 * 在 Linux bubblewrap sandbox 中启动 shell 子进程。
 */
export async function spawnLinuxBubblewrapSandbox(
  params: SandboxSpawnParams & { actualCwd: string },
): Promise<SandboxSpawnResult> {
  await fs.ensureDir(params.config.sandboxDir);
  await fs.ensureDir(params.config.tmpDir);
  await fs.ensureDir(params.config.cacheDir);
  await fs.ensureDir(params.executionDir);
  for (const writablePath of params.config.writablePaths) {
    await fs.ensureDir(writablePath);
  }

  const child = spawn("bwrap", buildLinuxBubblewrapArgs({
    ...params,
  }), {
    cwd: params.actualCwd,
    stdio: "pipe",
    env: buildSandboxEnv(params),
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  return {
    child,
    cwd: params.actualCwd,
    sandboxed: true,
    backend: "linux-bubblewrap",
    networkMode: params.config.networkMode,
    sandboxDir: params.config.sandboxDir,
    homeDir: params.config.homeDir,
    tmpDir: params.config.tmpDir,
    cacheDir: params.config.cacheDir,
  };
}
