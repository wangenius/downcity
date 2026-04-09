/**
 * macOS Seatbelt sandbox backend。
 *
 * 关键点（中文）
 * - 当前最小实现直接基于系统自带 `sandbox-exec`。
 * - 目标不是抽象完整 provider 体系，而是先把 shell 命令从“宿主机直跑”收敛成“带边界执行”。
 * - 边界只保留四类：路径、环境变量、网络、隔离后的 HOME/TMPDIR。
 */

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "fs-extra";
import type {
  SandboxSpawnParams,
  SandboxSpawnResult,
} from "@/types/sandbox/SandboxRuntime.js";

const DEFAULT_PATH_VALUE =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

function escapeSeatbeltString(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function dedupePaths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = path.resolve(String(value || "").trim());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildReadablePaths(params: {
  rootPath: string;
  shellPath: string;
  shellHomeDir: string;
  shellTmpDir: string;
}): string[] {
  return dedupePaths([
    "/bin",
    "/usr",
    "/System",
    "/etc",
    "/dev",
    "/Library",
    "/opt/homebrew",
    "/usr/local",
    params.rootPath,
    params.shellHomeDir,
    params.shellTmpDir,
    path.dirname(params.shellPath),
  ]);
}

function buildWritablePaths(params: SandboxSpawnParams & {
  shellHomeDir: string;
  shellTmpDir: string;
}): string[] {
  return dedupePaths([
    ...params.config.writablePaths,
    params.shellDir,
    params.shellHomeDir,
    params.shellTmpDir,
  ]);
}

function buildNetworkRules(networkMode: SandboxSpawnParams["config"]["networkMode"]): string[] {
  if (networkMode === "restricted" || networkMode === "full") {
    return ["(allow network-outbound)", "(allow network-inbound)"];
  }
  return [];
}

function buildSeatbeltProfile(params: SandboxSpawnParams & {
  actualCwd: string;
  shellHomeDir: string;
  shellTmpDir: string;
}): string {
  const readablePaths = buildReadablePaths({
    rootPath: params.config.rootPath,
    shellPath: params.shellPath,
    shellHomeDir: params.shellHomeDir,
    shellTmpDir: params.shellTmpDir,
  });
  const writablePaths = buildWritablePaths({
    ...params,
    shellHomeDir: params.shellHomeDir,
    shellTmpDir: params.shellTmpDir,
  });
  const lines = [
    "(version 1)",
    "(deny default)",
    '(import "system.sb")',
    "(allow process*)",
    "(allow sysctl-read)",
    "(allow file-read-metadata)",
    ...readablePaths.map(
      (value) => `(allow file-read* (subpath "${escapeSeatbeltString(value)}"))`,
    ),
    ...writablePaths.map(
      (value) => `(allow file-write* (subpath "${escapeSeatbeltString(value)}"))`,
    ),
    ...buildNetworkRules(params.config.networkMode),
  ];

  // 关键点（中文）
  // - `cwd` 需要显式出现在读集合里，否则很多命令刚启动时就会因为工作目录不可见而失败。
  // - 这里单独追加，避免未来 rootPath 与 cwd 的关系变化时被遗漏。
  if (!readablePaths.includes(params.actualCwd)) {
    lines.push(`(allow file-read* (subpath "${escapeSeatbeltString(params.actualCwd)}"))`);
  }
  return `${lines.join("\n")}\n`;
}

function buildSandboxEnv(params: SandboxSpawnParams & {
  shellHomeDir: string;
  shellTmpDir: string;
}): NodeJS.ProcessEnv {
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
  env.HOME = params.shellHomeDir;
  env.ZDOTDIR = params.shellHomeDir;
  env.TMPDIR = params.shellTmpDir;
  env.SHELL = params.shellPath;

  return env;
}

/**
 * 在 macOS seatbelt sandbox 中启动 shell 子进程。
 */
export async function spawnMacOsSeatbeltSandbox(
  params: SandboxSpawnParams & { actualCwd: string },
): Promise<SandboxSpawnResult> {
  const sandboxRootDir = path.join(params.shellDir, "sandbox");
  const shellHomeDir = path.join(sandboxRootDir, "home");
  const shellTmpDir = path.join(sandboxRootDir, "tmp");
  const profilePath = path.join(sandboxRootDir, "profile.sb");

  await fs.ensureDir(shellHomeDir);
  await fs.ensureDir(shellTmpDir);

  const profile = buildSeatbeltProfile({
    ...params,
    shellHomeDir,
    shellTmpDir,
  });
  await fs.writeFile(profilePath, profile, "utf-8");

  const child = spawn(
    "sandbox-exec",
    [
      "-f",
      profilePath,
      params.shellPath,
      params.login ? "-lc" : "-c",
      params.cmd,
    ],
    {
      cwd: params.actualCwd,
      stdio: "pipe",
      env: buildSandboxEnv({
        ...params,
        shellHomeDir,
        shellTmpDir,
      }),
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  return {
    child,
    cwd: params.actualCwd,
    sandboxed: true,
    backend: "macos-seatbelt",
    networkMode: params.config.networkMode,
  };
}
