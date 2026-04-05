/**
 * Memory Writer（读写与路径安全）。
 *
 * 关键点（中文）
 * - 统一处理 get/store 的路径白名单。
 * - 只允许访问 memory 目录与 working 记忆文件。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type {
  MemoryGetPayload,
  MemoryGetResponse,
  MemorySourceType,
  MemoryStorePayload,
  MemoryStoreResponse,
} from "@services/memory/types/Memory.js";
import type { MemoryRuntimeState } from "./Store.js";
import { markMemoryDirty } from "./Store.js";

function nowIso(): string {
  return new Date().toISOString();
}

function resolveDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function toRelPath(rootPath: string, absPath: string): string {
  return path.relative(rootPath, absPath).replace(/\\/g, "/");
}

function isWithin(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  if (parent === child) return true;
  return child.startsWith(`${parent}${path.sep}`);
}

function resolveStoreTargetPath(
  context: AgentContext,
  target: MemorySourceType,
  sessionId?: string,
): { absPath: string; relPath: string } {
  if (target === "longterm") {
    const absPath = path.join(context.rootPath, ".downcity", "memory", "MEMORY.md");
    return { absPath, relPath: toRelPath(context.rootPath, absPath) };
  }
  if (target === "daily") {
    const date = resolveDateStamp();
    const absPath = path.join(context.rootPath, ".downcity", "memory", "daily", `${date}.md`);
    return { absPath, relPath: toRelPath(context.rootPath, absPath) };
  }
  const key = String(sessionId || "").trim();
  if (!key) {
    throw new Error("sessionId is required for working memory");
  }
  const absPath = path.join(
    context.paths.getDowncitySessionDirPath(key),
    "memory",
    "working.md",
  );
  return { absPath, relPath: toRelPath(context.rootPath, absPath) };
}

function ensureHeading(target: MemorySourceType): string {
  if (target === "longterm") {
    return "# MEMORY\n";
  }
  if (target === "daily") {
    return "# Daily Memory\n";
  }
  return "# Working Memory\n";
}

function formatEntry(content: string): string {
  const clean = String(content || "").trim();
  if (!clean) return "";
  return `### ${nowIso()}\n\n${clean}\n`;
}

/**
 * 显式写入 memory。
 */
export async function storeMemory(
  context: AgentContext,
  state: MemoryRuntimeState,
  payload: MemoryStorePayload,
): Promise<MemoryStoreResponse> {
  const target: MemorySourceType = payload.target ?? "daily";
  const content = String(payload.content || "").trim();
  if (!content) {
    throw new Error("content is required");
  }
  const resolved = resolveStoreTargetPath(context, target, payload.sessionId);
  await fs.mkdir(path.dirname(resolved.absPath), { recursive: true });
  const exists = await fs
    .access(resolved.absPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    await fs.writeFile(resolved.absPath, ensureHeading(target), "utf-8");
  }
  const entry = formatEntry(content);
  await fs.appendFile(resolved.absPath, `\n${entry}`, "utf-8");
  markMemoryDirty(context, state, `store:${resolved.relPath}`);
  return {
    path: resolved.relPath,
    target,
    writtenChars: entry.length,
  };
}

function resolveAllowedReadPath(context: AgentContext, relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!normalized) {
    throw new Error("path is required");
  }
  const absPath = path.resolve(context.rootPath, normalized);
  const memoryRoot = path.resolve(path.join(context.rootPath, ".downcity", "memory"));
  const sessionRoot = path.resolve(path.join(context.rootPath, ".downcity", "session"));
  const isMemoryPath = isWithin(memoryRoot, absPath);
  const isWorkingPath =
    isWithin(sessionRoot, absPath) && normalized.endsWith("/memory/working.md");
  if (!isMemoryPath && !isWorkingPath) {
    throw new Error("path is not allowed");
  }
  if (!normalized.toLowerCase().endsWith(".md")) {
    throw new Error("path must be markdown");
  }
  return absPath;
}

/**
 * 读取指定记忆文件（支持行区间）。
 */
export async function getMemory(
  context: AgentContext,
  payload: MemoryGetPayload,
): Promise<MemoryGetResponse> {
  const requestedPath = String(payload.path || "").trim();
  if (!requestedPath) {
    throw new Error("path is required");
  }
  const absPath = resolveAllowedReadPath(context, requestedPath);
  const relPath = toRelPath(context.rootPath, absPath);
  const exists = await fs
    .access(absPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    return { path: relPath, text: "", missing: true };
  }
  const content = String(await fs.readFile(absPath, "utf-8"));
  const from = payload.from ? Math.max(1, Math.floor(payload.from)) : undefined;
  const lines = payload.lines ? Math.max(1, Math.floor(payload.lines)) : undefined;
  if (!from && !lines) {
    return { path: relPath, text: content };
  }
  const rows = content.split("\n");
  const start = from ?? 1;
  const size = lines ?? rows.length;
  const slice = rows.slice(start - 1, start - 1 + size).join("\n");
  return { path: relPath, text: slice };
}

/**
 * 初始化 memory 目录结构（幂等）。
 */
export async function ensureMemoryDirectories(rootPath: string): Promise<void> {
  const memoryDailyDir = path.join(rootPath, ".downcity", "memory", "daily");
  await fs.mkdir(memoryDailyDir, { recursive: true });
}
