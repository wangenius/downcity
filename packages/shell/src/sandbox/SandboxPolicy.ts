/**
 * Safe Sandbox 策略解析。
 *
 * 关键点（中文）
 * - 系统运行目录、workspace 写目录和宿主只读目录在这里合成为唯一策略。
 * - 宿主只读目录必须通过 realpath 与权限校验，不能与 workspace 写边界重叠。
 * - macOS 会自动加入当前 `xcode-select` 指向的 Developer 目录，保证系统 Git 可用。
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import fs from "fs-extra";
import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type {
  ResolvedSandboxPolicy,
  SandboxBackend,
} from "@/types/Sandbox.js";

const exec_file = promisify(execFile);

const DEFAULT_ENV_ALLOWLIST = [
  "PATH",
  "LANG",
  "TERM",
  "COLORTERM",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "USER",
  "LOGNAME",
  "ComSpec",
  "COMSPEC",
  "PATHEXT",
  "SystemDrive",
  "SystemRoot",
  "WINDIR",
];

const MACOS_READ_ONLY_PATHS = [
  "/bin",
  "/usr",
  "/System",
  "/etc",
  "/private/etc",
  "/dev",
  "/Library",
  "/opt/homebrew",
  "/usr/local",
];

const LINUX_READ_ONLY_PATHS = [
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib64",
  "/etc",
];

/** 判断目标路径是否位于根目录内。 */
export function is_path_inside_root(root_path: string, target_path: string): boolean {
  const normalized_root = path.resolve(root_path);
  const normalized_target = path.resolve(target_path);
  if (normalized_root === normalized_target) return true;
  const relative = path.relative(normalized_root, normalized_target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function dedupe_paths(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = path.resolve(String(value || "").trim());
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.sort((left, right) => left.localeCompare(right));
}

function resolve_windows_read_only_paths(base_env: NodeJS.ProcessEnv): string[] {
  const path_entries = String(base_env.PATH || "")
    .split(path.delimiter)
    .map((value) => value.trim().replace(/^"|"$/gu, ""))
    .filter((value) => path.isAbsolute(value) && fs.existsSync(value));
  const comspec = String(base_env.ComSpec || base_env.COMSPEC || "").trim();
  return dedupe_paths([
    ...path_entries,
    path.dirname(process.execPath),
    ...(path.isAbsolute(comspec) ? [path.dirname(comspec)] : []),
  ]);
}

function resolve_backend(): Exclude<SandboxBackend, "unrestricted-host"> {
  if (process.platform === "darwin") return "macos-seatbelt";
  if (process.platform === "linux") return "linux-bubblewrap";
  if (process.platform === "win32") return "windows-mxc-dev";
  throw new Error(
    `sandbox backend is required for shell execution, but current platform is unsupported: ${process.platform}`,
  );
}

function resolve_env_allowlist(context: ShellHostContext): string[] {
  return Array.from(new Set([
    ...DEFAULT_ENV_ALLOWLIST,
    ...Object.keys(context.env || {}),
  ])).sort((left, right) => left.localeCompare(right));
}

async function normalize_host_read_only_paths(
  context: ShellHostContext,
  read_write_paths: string[],
): Promise<string[]> {
  const result: string[] = [];
  for (const configured_path of context.safe_read_only_paths || []) {
    const raw_path = String(configured_path || "").trim();
    if (!raw_path) continue;
    if (!path.isAbsolute(raw_path)) {
      throw new Error(`safe sandbox read-only path must be absolute: ${raw_path}`);
    }
    const real_path = await fs.realpath(raw_path).catch(() => "");
    if (!real_path) {
      throw new Error(`safe sandbox read-only path does not exist: ${raw_path}`);
    }
    const stat = await fs.stat(real_path);
    if (!stat.isDirectory()) {
      throw new Error(`safe sandbox read-only path must be a directory: ${raw_path}`);
    }
    if (process.platform !== "win32" && (stat.mode & 0o022) !== 0) {
      throw new Error(`safe sandbox read-only path must not be group/world writable: ${raw_path}`);
    }
    const overlaps_write_path = read_write_paths.some((write_path) =>
      is_path_inside_root(write_path, real_path) || is_path_inside_root(real_path, write_path)
    );
    if (overlaps_write_path) {
      throw new Error(`safe sandbox read-only path overlaps a writable path: ${raw_path}`);
    }
    result.push(real_path);
  }
  return dedupe_paths(result);
}

/**
 * 解析当前 macOS 选中的 Xcode 只读运行目录。
 *
 * 关键点（中文）
 * - 完整 Xcode 的工具会从 `Contents/SharedFrameworks` 加载依赖，因此授权边界提升到
 *   `Xcode.app/Contents`，但不会开放整个 `/Applications`。
 * - Command Line Tools 位于 `/Library` 时保留其 Developer 目录；`/Library` 本身已只读。
 */
export async function resolve_macos_developer_path(
  base_env: NodeJS.ProcessEnv,
): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  let developer_path = String(base_env.DEVELOPER_DIR || "").trim();
  if (!developer_path) {
    const result = await exec_file("/usr/bin/xcode-select", ["-p"], {
      timeout: 5_000,
      encoding: "utf8",
    }).catch(() => null);
    developer_path = String(result?.stdout || "").trim();
  }
  if (!developer_path) return null;
  const real_path = await fs.realpath(developer_path).catch(() => "");
  if (!real_path) return null;
  const stat = await fs.stat(real_path).catch(() => null);
  if (!stat?.isDirectory()) return null;
  const xcode_suffix = `${path.sep}Contents${path.sep}Developer`;
  if (real_path.endsWith(xcode_suffix)) {
    return path.dirname(real_path);
  }
  return real_path;
}

function create_policy_fingerprint(
  policy: Omit<ResolvedSandboxPolicy, "fingerprint">,
): string {
  return createHash("sha256")
    .update(JSON.stringify(policy))
    .digest("hex");
}

/**
 * 解析单次命令最终使用的 Safe Sandbox 策略。
 */
export async function resolve_sandbox_policy(
  context: ShellHostContext,
  base_env: NodeJS.ProcessEnv,
): Promise<ResolvedSandboxPolicy> {
  const backend = resolve_backend();
  const configured_root_path = path.resolve(context.rootPath);
  const root_path = await fs.realpath(configured_root_path).catch(() => configured_root_path);
  const sandbox_dir = path.join(root_path, ".downcity", "sandbox");
  const read_write_paths = [root_path];
  const host_read_only_paths = await normalize_host_read_only_paths(
    context,
    read_write_paths,
  );
  const platform_paths = backend === "macos-seatbelt"
    ? MACOS_READ_ONLY_PATHS
    : backend === "linux-bubblewrap"
      ? LINUX_READ_ONLY_PATHS
      : resolve_windows_read_only_paths(base_env);
  const developer_path = backend === "macos-seatbelt"
    ? await resolve_macos_developer_path(base_env)
    : null;
  const read_only_paths = dedupe_paths([
    ...platform_paths.filter((value) => fs.existsSync(value)),
    ...(developer_path ? [developer_path] : []),
    ...host_read_only_paths,
  ]);
  const policy_without_fingerprint: Omit<ResolvedSandboxPolicy, "fingerprint"> = {
    backend,
    root_path,
    sandbox_dir,
    home_dir: sandbox_dir,
    tmp_dir: path.join(sandbox_dir, "tmp"),
    cache_dir: path.join(sandbox_dir, ".cache"),
    env_allowlist: resolve_env_allowlist(context),
    read_only_paths,
    read_write_paths,
    network_mode: "full",
  };
  return {
    ...policy_without_fingerprint,
    fingerprint: create_policy_fingerprint(policy_without_fingerprint),
  };
}

/**
 * 解析 Safe Sandbox 实际工作目录。
 */
export function resolve_sandbox_cwd(
  context: ShellHostContext,
  requested_cwd: string,
): string {
  const root_path = path.resolve(context.rootPath);
  const normalized_cwd = path.resolve(requested_cwd);
  if (is_path_inside_root(root_path, normalized_cwd)) return normalized_cwd;
  context.logger?.warn("[sandbox] cwd escapes project root and was reset to rootPath", {
    rootPath: root_path,
    requestedCwd: normalized_cwd,
  });
  return root_path;
}
