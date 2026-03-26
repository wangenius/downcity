/**
 * Memory Store（文件与运行态管理）。
 *
 * 关键点（中文）
 * - 管理 Memory service 的运行时状态（dirty/sync/watcher）。
 * - 统一管理 memory 源文件枚举与路径白名单。
 * - 不承载检索算法，检索在 Search/Indexer 模块。
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FSWatcher } from "node:fs";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type {
  MemoryDefaults,
  MemorySourceType,
} from "@services/memory/types/Memory.js";
import {
  getDowncityDirPath,
  getDowncityMemoryDailyDirPath,
  getDowncityMemoryLongTermPath,
  getDowncitySessionRootDirPath,
} from "@/console/env/Paths.js";
import {
  MemoryIndexer,
  type MemoryIndexSyncResult,
} from "./Indexer.js";

export const MEMORY_DEFAULTS: MemoryDefaults = {
  maxResults: 6,
  minScore: 0.35,
  maxInjectedChars: 4000,
  watchDebounceMs: 1500,
  intervalMinutes: 5,
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
  /**
   * 索引器实例。
   */
  indexer: MemoryIndexer;
  /**
   * 当前是否 dirty。
   */
  dirty: boolean;
  /**
   * 最近一次同步时间戳。
   */
  lastSyncAt?: number;
  /**
   * 最近一次同步错误。
   */
  lastError?: string;
  /**
   * 当前同步中的 Promise（用于并发合并）。
   */
  syncing: Promise<void> | null;
  /**
   * watcher 列表。
   */
  watchers: FSWatcher[];
  /**
   * debounce timer。
   */
  watchDebounceTimer: NodeJS.Timeout | null;
  /**
   * interval timer。
   */
  intervalTimer: NodeJS.Timeout | null;
};

const memoryStates = new Map<string, MemoryRuntimeState>();

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
  let entries: fs.Dirent[] = [];
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
  const longterm = getDowncityMemoryLongTermPath(rootPath);
  if (await pathExists(longterm)) {
    out.push({
      source: "longterm",
      absPath: longterm,
      relPath: normalizeRelPath(rootPath, longterm),
    });
  }

  const dailyDir = getDowncityMemoryDailyDirPath(rootPath);
  for (const abs of await listMarkdownFilesRecursively(dailyDir)) {
    out.push({
      source: "daily",
      absPath: abs,
      relPath: normalizeRelPath(rootPath, abs),
    });
  }

  const sessionRootDir = getDowncitySessionRootDirPath(rootPath);
  let sessions: fs.Dirent[] = [];
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
export function isMemoryEnabled(runtime: ServiceRuntime): boolean {
  const enabled = runtime.config?.context?.memory?.enabled;
  return enabled !== false;
}

/**
 * 获取（或创建）运行态。
 */
export function getOrCreateMemoryState(runtime: ServiceRuntime): MemoryRuntimeState {
  const rootPath = runtime.rootPath;
  const existing = memoryStates.get(rootPath);
  if (existing) {
    return existing;
  }
  const created: MemoryRuntimeState = {
    rootPath,
    enabled: isMemoryEnabled(runtime),
    indexer: new MemoryIndexer(rootPath),
    dirty: true,
    syncing: null,
    watchers: [],
    watchDebounceTimer: null,
    intervalTimer: null,
  };
  memoryStates.set(rootPath, created);
  return created;
}

/**
 * 标记 dirty 并触发 debounce 同步。
 */
export function markMemoryDirty(
  runtime: ServiceRuntime,
  reason: string,
): void {
  const state = getOrCreateMemoryState(runtime);
  state.dirty = true;
  if (state.watchDebounceTimer) {
    clearTimeout(state.watchDebounceTimer);
  }
  state.watchDebounceTimer = setTimeout(() => {
    state.watchDebounceTimer = null;
    void ensureMemoryIndexed(runtime, { reason: `watch:${reason}` });
  }, MEMORY_DEFAULTS.watchDebounceMs);
}

function registerWatcher(
  runtime: ServiceRuntime,
  state: MemoryRuntimeState,
  watchPath: string,
): void {
  try {
    const watcher = fs.watch(
      watchPath,
      { recursive: true },
      (_event, fileName) => {
        const name = String(fileName || "").toLowerCase();
        if (!name.endsWith(".md")) {
          return;
        }
        markMemoryDirty(runtime, name || "unknown");
      },
    );
    state.watchers.push(watcher);
  } catch (error) {
    runtime.logger.warn("[memory] watcher init skipped", {
      watchPath,
      error: String(error),
    });
  }
}

/**
 * 启动 memory 运行时（watcher + interval）。
 */
export async function startMemoryRuntime(runtime: ServiceRuntime): Promise<void> {
  const state = getOrCreateMemoryState(runtime);
  state.enabled = isMemoryEnabled(runtime);
  if (!state.enabled) {
    runtime.logger.info("[memory] disabled by config");
    return;
  }

  if (state.watchers.length === 0) {
    registerWatcher(runtime, state, getDowncityDirPath(runtime.rootPath));
  }
  if (!state.intervalTimer) {
    state.intervalTimer = setInterval(() => {
      void ensureMemoryIndexed(runtime, { reason: "interval" });
    }, MEMORY_DEFAULTS.intervalMinutes * 60 * 1000);
  }

  await ensureMemoryIndexed(runtime, { reason: "startup" });
}

/**
 * 停止 memory 运行时。
 */
export async function stopMemoryRuntime(runtime: ServiceRuntime): Promise<void> {
  const state = getOrCreateMemoryState(runtime);
  if (state.watchDebounceTimer) {
    clearTimeout(state.watchDebounceTimer);
    state.watchDebounceTimer = null;
  }
  if (state.intervalTimer) {
    clearInterval(state.intervalTimer);
    state.intervalTimer = null;
  }
  for (const watcher of state.watchers) {
    try {
      watcher.close();
    } catch {
      // ignore
    }
  }
  state.watchers = [];

  if (state.syncing) {
    try {
      await state.syncing;
    } catch {
      // ignore
    }
  }
  state.indexer.close();
  memoryStates.delete(runtime.rootPath);
}

/**
 * 确保索引已同步。
 */
export async function ensureMemoryIndexed(
  runtime: ServiceRuntime,
  params?: { force?: boolean; reason?: string },
): Promise<MemoryIndexSyncResult | null> {
  const state = getOrCreateMemoryState(runtime);
  if (!state.enabled) {
    return null;
  }
  const force = params?.force === true;
  if (!force && !state.dirty) {
    return null;
  }
  if (state.syncing) {
    await state.syncing;
    return null;
  }
  let syncResult: MemoryIndexSyncResult | null = null;
  state.syncing = (async () => {
    try {
      const files = await listMemorySourceFiles(runtime.rootPath);
      syncResult = await state.indexer.sync(files, { force });
      state.dirty = false;
      state.lastError = undefined;
      state.lastSyncAt = Date.now();
      runtime.logger.info("[memory] index synced", {
        reason: params?.reason || "manual",
        files: files.length,
      });
    } catch (error) {
      state.lastError = String(error);
      runtime.logger.error("[memory] index sync failed", {
        reason: params?.reason || "manual",
        error: state.lastError,
      });
      throw error;
    } finally {
      state.syncing = null;
    }
  })();
  await state.syncing;
  return syncResult;
}
