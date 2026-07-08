/**
 * Sandbox 配置解析器。
 *
 * 关键点（中文）
 * - Safe Sandbox 边界由 shell runtime 固定生成，不读取项目配置或宿主传入的策略。
 * - sandbox 是 agent 项目级能力，持久目录固定为 `<project>/.downcity/sandbox`。
 * - 当前版本只服务 shell / CLI 这条命令执行链，不引入审批、profile 绑定或用户权限系统。
 * - 解析结果只回答一个问题：这次命令执行的 sandbox 边界是什么。
 */

import path from "node:path";
import type { ShellHostContext } from "@/types/ShellHostContext.js";
import type { SandboxBackend } from "@/sandbox/types/SandboxRuntime.js";
import type { ResolvedSandboxConfig } from "@/sandbox/types/SandboxRuntime.js";

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
];

const SANDBOX_RELATIVE_DIR = path.join(".downcity", "sandbox");

function normalizeEnvAllowlist(values?: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values || DEFAULT_ENV_ALLOWLIST) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/**
 * 解析 safe sandbox 允许导出的环境变量名。
 *
 * 关键点（中文）
 * - 默认只保留 shell 运行所需的最小宿主变量。
 * - Agent env 是 SDK 显式运行时状态，因此它的 key 需要动态进入 allowlist。
 * - 这里不读取完整 `process.env`，避免把宿主环境隐式暴露给 sandbox。
 */
export function resolveSandboxEnvAllowlist(context: ShellHostContext): string[] {
  return normalizeEnvAllowlist([
    ...DEFAULT_ENV_ALLOWLIST,
    ...Object.keys(context.env || {}),
  ]);
}

/**
 * 判断目标路径是否位于根目录内，或与根目录本身相同。
 */
export function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedRoot === normalizedTarget) return true;
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeWritablePaths(params: {
  rootPath: string;
  sandboxDir: string;
  context: ShellHostContext;
}): string[] {
  const { rootPath, sandboxDir, context } = params;
  const rawValues = [rootPath, sandboxDir];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of rawValues) {
    const normalizedValue = String(rawValue || "").trim();
    if (!normalizedValue) continue;
    const resolvedPath = path.resolve(
      path.isAbsolute(normalizedValue) ? normalizedValue : path.join(rootPath, normalizedValue),
    );
    if (!isPathInsideRoot(rootPath, resolvedPath)) {
      context.logger?.warn("[sandbox] writable path ignored because it escapes project root", {
        rootPath,
        ignoredPath: normalizedValue,
        resolvedPath,
      });
      continue;
    }
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    result.push(resolvedPath);
  }

  if (result.length === 0) {
    result.push(path.resolve(rootPath));
  }
  return result;
}

/**
 * 根据宿主平台解析当前 sandbox backend。
 */
export function resolveSandboxBackend(): SandboxBackend {
  if (process.platform === "darwin") return "macos-seatbelt";
  if (process.platform === "linux") return "linux-bubblewrap";
  throw new Error(
    `sandbox backend is required for shell execution, but current platform is unsupported: ${process.platform}`,
  );
}

/**
 * 解析当前请求最终使用的 sandbox 配置。
 */
export function resolveSandboxConfig(context: ShellHostContext): ResolvedSandboxConfig {
  const rootPath = path.resolve(context.rootPath);
  const sandboxDir = path.join(rootPath, SANDBOX_RELATIVE_DIR);
  const tmpDir = path.join(sandboxDir, "tmp");
  const cacheDir = path.join(sandboxDir, ".cache");

  return {
    backend: resolveSandboxBackend(),
    rootPath,
    sandboxDir,
    homeDir: sandboxDir,
    tmpDir,
    cacheDir,
    envAllowlist: resolveSandboxEnvAllowlist(context),
    writablePaths: normalizeWritablePaths({
      rootPath,
      sandboxDir,
      context,
    }),
    networkMode: "full",
  };
}

/**
 * 归一化 sandbox 内实际使用的工作目录。
 *
 * 说明（中文）
 * - sandbox 启用时，工作目录必须收敛在 `rootPath` 范围内。
 * - 超出项目根目录的 `cwd` 会被强制拉回 `rootPath`，避免宿主目录通过 `cwd` 泄漏回去。
 */
export function resolveSandboxCwd(params: {
  rootPath: string;
  requestedCwd: string;
  context: ShellHostContext;
}): string {
  const normalizedCwd = path.resolve(params.requestedCwd);
  if (isPathInsideRoot(params.rootPath, normalizedCwd)) {
    return normalizedCwd;
  }
  params.context.logger?.warn("[sandbox] cwd escapes project root and was reset to rootPath", {
    rootPath: params.rootPath,
    requestedCwd: normalizedCwd,
  });
  return params.rootPath;
}
