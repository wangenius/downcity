/**
 * Memory Store（文件与运行态管理）。
 *
 * 关键点（中文）
 * - 管理 Memory service 的最小运行时状态。
 * - 统一管理 memory 源文件枚举。
 * - 不承载检索算法，检索在 Search 模块。
 * - 新版本不再使用 module-global state，状态归属 MemoryService 实例。
 */

import type { Dirent } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type {
  MemoryDefaults,
  MemorySourceType,
} from "@/memory/types/Memory.js";

export const MEMORY_DEFAULTS: MemoryDefaults = {
  maxResults: 6,
  minScore: 0.35,
  maxInjectedChars: 4000,
};

export type MemorySourceFile = {
  /**
   * 来源分类。
   */
  source: MemorySourceType;
  /**
   * 绝对路径。
   */
  absPath: string;
  /**
   * 相对项目根目录路径。
   */
  relPath: string;
};

export type MemoryRuntimeState = {
  /**
   * 项目根目录。
   */
  rootPath: string;
  /**
   * Memory 是否启用。
   */
  enabled: boolean;
};

function normalizeRelPath(rootPath: string, absPath: string): string {
  return path.relative(rootPath, absPath).replace(/\\/g, "/");
}

function isMarkdownPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".md");
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fsp.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFilesRecursively(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[] = [];
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      out.push(...(await listMarkdownFilesRecursively(abs)));
      continue;
    }
    if (!entry.isFile() || !isMarkdownPath(abs)) {
      continue;
    }
    out.push(abs);
  }
  return out;
}

/**
 * 枚举 memory 源文件。
 */
export async function listMemorySourceFiles(
  rootPath: string,
): Promise<MemorySourceFile[]> {
  const out: MemorySourceFile[] = [];
  const longterm = path.join(rootPath, ".downcity", "memory", "MEMORY.md");
  if (await pathExists(longterm)) {
    out.push({
      source: "longterm",
      absPath: longterm,
      relPath: normalizeRelPath(rootPath, longterm),
    });
  }

  const dailyDir = path.join(rootPath, ".downcity", "memory", "daily");
  for (const abs of await listMarkdownFilesRecursively(dailyDir)) {
    out.push({
      source: "daily",
      absPath: abs,
      relPath: normalizeRelPath(rootPath, abs),
    });
  }

  const sessionRootDir = path.join(rootPath, ".downcity", "session");
  let sessions: Dirent[] = [];
  try {
    sessions = await fsp.readdir(sessionRootDir, { withFileTypes: true });
  } catch {
    sessions = [];
  }
  for (const sessionDir of sessions) {
    if (!sessionDir.isDirectory() || sessionDir.isSymbolicLink()) {
      continue;
    }
    const workingPath = path.join(
      sessionRootDir,
      sessionDir.name,
      "memory",
      "working.md",
    );
    if (!(await pathExists(workingPath))) {
      continue;
    }
    out.push({
      source: "working",
      absPath: workingPath,
      relPath: normalizeRelPath(rootPath, workingPath),
    });
  }

  return out;
}

/**
 * 判断 Memory 功能是否启用（默认 true）。
 */
export function isMemoryEnabled(context: AgentContext): boolean {
  const enabled = context.config?.context?.memory?.enabled;
  return enabled !== false;
}

/**
 * 创建一个新的 memory plugin state。
 *
 * 关键点（中文）
 * - 每个 `MemoryPlugin` 实例都持有自己的 state。
 * - 不再按 rootPath 落到模块级 Map，避免 plugin runtime 实例之间共享状态。
 */
export function createMemoryRuntimeState(
  context: AgentContext,
): MemoryRuntimeState {
  return {
    rootPath: context.rootPath,
    enabled: isMemoryEnabled(context),
  };
}

/**
 * 启动 memory 运行时。
 *
 * 关键点（中文）
 * - Markdown-only 方案下不再维护后台索引同步。
 * - 这里只负责根据配置刷新 enabled 状态。
 */
export async function startMemoryRuntime(
  context: AgentContext,
  state: MemoryRuntimeState,
): Promise<void> {
  state.enabled = isMemoryEnabled(context);
  if (!state.enabled) {
    context.logger.info("[memory] disabled by config");
    return;
  }
}

/**
 * 停止 memory 运行时。
 */
export async function stopMemoryRuntime(
  _state: MemoryRuntimeState,
): Promise<void> {
  void _state;
}
