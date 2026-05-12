/**
 * Sandbox 配置解析器。
 *
 * 关键点（中文）
 * - 这里负责把 `downcity.json` 中面向用户的最小配置，收敛成运行时可直接执行的绝对路径配置。
 * - 当前版本只服务 shell / CLI 这条命令执行链，不引入审批、profile 绑定或用户权限系统。
 * - 解析结果只回答一个问题：这次命令执行的 sandbox 边界是什么。
 */

import path from "node:path";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { ResolvedSandboxConfig } from "@/types/sandbox/SandboxRuntime.js";

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
  writablePaths?: string[];
  context: AgentContext;
}): string[] {
  const { rootPath, writablePaths, context } = params;
  const rawValues =
    Array.isArray(writablePaths) && writablePaths.length > 0
      ? writablePaths
      : [rootPath];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawValue of rawValues) {
    const normalizedValue = String(rawValue || "").trim();
    if (!normalizedValue) continue;
    const resolvedPath = path.resolve(
      path.isAbsolute(normalizedValue) ? normalizedValue : path.join(rootPath, normalizedValue),
    );
    if (!isPathInsideRoot(rootPath, resolvedPath)) {
      context.logger.warn("[sandbox] writable path ignored because it escapes project root", {
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
 * 解析当前请求最终使用的 sandbox 配置。
 */
export function resolveSandboxConfig(context: AgentContext): ResolvedSandboxConfig {
  const rootPath = path.resolve(context.rootPath);
  const projectConfig = context.config?.sandbox;

  if (process.platform !== "darwin") {
    throw new Error(
      `sandbox backend is required for shell execution, but current platform is unsupported: ${process.platform}`,
    );
  }

  return {
    backend: "macos-seatbelt",
    rootPath,
    envAllowlist: normalizeEnvAllowlist(projectConfig?.envAllowlist),
    writablePaths: normalizeWritablePaths({
      rootPath,
      writablePaths: projectConfig?.writablePaths,
      context,
    }),
    networkMode: projectConfig?.networkMode || "full",
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
  context: AgentContext;
}): string {
  const normalizedCwd = path.resolve(params.requestedCwd);
  if (isPathInsideRoot(params.rootPath, normalizedCwd)) {
    return normalizedCwd;
  }
  params.context.logger.warn("[sandbox] cwd escapes project root and was reset to rootPath", {
    rootPath: params.rootPath,
    requestedCwd: normalizedCwd,
  });
  return params.rootPath;
}
