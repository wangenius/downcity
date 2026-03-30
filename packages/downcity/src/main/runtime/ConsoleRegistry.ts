/**
 * ConsoleRegistry：console 维护的 agent registry（`~/.downcity@/main/agents.json`）。
 *
 * 关键点（中文）
 * - registry 只维护“console 认知到的 agent 项目列表”，用于统一观测/批量管理。
 * - registry 不承载实时健康检查：status/list 会读取每个项目的 daemon pid 并判活。
 * - agent daemon 启动成功后必须登记到 console（强约束）。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  ConsoleAgentRegistryEntry,
  ConsoleAgentRegistryV1,
} from "@/types/Console.js";
import { getConsoleAgentRegistryPath, getConsoleRuntimeDirPath } from "./ConsolePaths.js";
import { isConsoleRunning } from "./ConsoleRuntime.js";

const CONSOLE_DIR = getConsoleRuntimeDirPath();
const CONSOLE_AGENTS_FILE = getConsoleAgentRegistryPath();

function buildEmptyRegistry(): ConsoleAgentRegistryV1 {
  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    agents: [],
  };
}

function normalizeProjectRoot(projectRoot: string): string {
  const resolved = path.resolve(String(projectRoot || "").trim());
  if (!resolved) throw new Error("projectRoot is required");
  return resolved;
}

function normalizePid(pid: number): number {
  if (!Number.isFinite(pid) || Number.isNaN(pid) || !Number.isInteger(pid) || pid < 1) {
    throw new Error(`Invalid pid: ${pid}`);
  }
  return pid;
}

function normalizeIsoTime(input: string | undefined): string {
  const value = String(input || "").trim();
  if (!value) return new Date().toISOString();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

function normalizeRegistryEntry(
  entry: Partial<ConsoleAgentRegistryEntry>,
): ConsoleAgentRegistryEntry | null {
  try {
    const projectRoot = normalizeProjectRoot(String(entry.projectRoot || ""));
    const pid = normalizePid(Number(entry.pid));
    const startedAt = normalizeIsoTime(
      typeof entry.startedAt === "string" ? entry.startedAt : undefined,
    );
    const updatedAt = normalizeIsoTime(
      typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    );
    return {
      projectRoot,
      pid,
      startedAt,
      updatedAt,
      status:
        entry.status === "stopped"
          ? "stopped"
          : "running",
      stoppedAt:
        entry.status === "stopped"
          ? normalizeIsoTime(
              typeof entry.stoppedAt === "string"
                ? entry.stoppedAt
                : undefined,
            )
          : undefined,
    };
  } catch {
    return null;
  }
}

function normalizeRegistry(
  value: Partial<ConsoleAgentRegistryV1> | null | undefined,
): ConsoleAgentRegistryV1 {
  if (!value || typeof value !== "object") return buildEmptyRegistry();
  const source = Array.isArray(value.agents) ? value.agents : [];
  const normalizedAgents: ConsoleAgentRegistryEntry[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeRegistryEntry(item as ConsoleAgentRegistryEntry);
    if (!normalized) continue;
    const existingIndex = normalizedAgents.findIndex(
      (entry) => entry.projectRoot === normalized.projectRoot,
    );
    if (existingIndex >= 0) {
      normalizedAgents[existingIndex] = normalized;
      continue;
    }
    normalizedAgents.push(normalized);
  }
  return {
    v: 1,
    updatedAt: normalizeIsoTime(
      typeof value.updatedAt === "string" ? value.updatedAt : undefined,
    ),
    agents: normalizedAgents.sort((a, b) =>
      a.projectRoot.localeCompare(b.projectRoot),
    ),
  };
}

async function writeConsoleAgentRegistry(
  registry: ConsoleAgentRegistryV1,
): Promise<void> {
  await fs.ensureDir(CONSOLE_DIR);
  await fs.writeJson(CONSOLE_AGENTS_FILE, normalizeRegistry(registry), {
    spaces: 2,
  });
}

/**
 * 确保 console agent registry 文件存在。
 *
 * 关键点（中文）
 * - 空 console 也应拥有显式的空 registry，避免 UI 将“尚未启动任何 agent”误判为异常。
 * - 若文件已存在则不覆盖，保持历史记录不丢失。
 */
export async function ensureConsoleAgentRegistry(): Promise<void> {
  await fs.ensureDir(CONSOLE_DIR);
  if (await fs.pathExists(CONSOLE_AGENTS_FILE)) {
    return;
  }
  await writeConsoleAgentRegistry(buildEmptyRegistry());
}

/**
 * 获取 console agent registry 文件路径。
 */
export function getConsoleAgentsRegistryPath(): string {
  return CONSOLE_AGENTS_FILE;
}

/**
 * 读取 console agent registry（容错）。
 *
 * 关键点（中文）
 * - 文件不存在或损坏时返回空 registry，避免影响主流程。
 */
export async function readConsoleAgentRegistry(): Promise<ConsoleAgentRegistryV1> {
  try {
    if (!(await fs.pathExists(CONSOLE_AGENTS_FILE))) {
      return buildEmptyRegistry();
    }
    const raw = (await fs.readJson(CONSOLE_AGENTS_FILE)) as Partial<ConsoleAgentRegistryV1>;
    return normalizeRegistry(raw);
  } catch {
    return buildEmptyRegistry();
  }
}

/**
 * 列出 registry 中记录的 agent（按 projectRoot 排序）。
 */
export async function listConsoleAgents(): Promise<ConsoleAgentRegistryEntry[]> {
  const registry = await readConsoleAgentRegistry();
  return [...registry.agents].sort((a, b) => a.projectRoot.localeCompare(b.projectRoot));
}

/**
 * 新增或更新一条 agent 记录。
 */
export async function upsertConsoleAgentEntry(input: {
  projectRoot: string;
  pid: number;
  startedAt?: string;
  status?: "running" | "stopped";
  stoppedAt?: string;
}): Promise<void> {
  // 关键点（中文）：agent 必须登记到 console 才“有效”，因此 console 未启动时拒绝写入 registry。
  if (!(await isConsoleRunning())) {
    throw new Error("console is not running");
  }

  const projectRoot = normalizeProjectRoot(input.projectRoot);
  const pid = normalizePid(input.pid);
  const nowIso = new Date().toISOString();

  const registry = await readConsoleAgentRegistry();
  const index = registry.agents.findIndex((entry) => entry.projectRoot === projectRoot);
  if (index >= 0) {
    const existing = registry.agents[index];
    registry.agents[index] = {
      projectRoot,
      pid,
      startedAt: normalizeIsoTime(existing.startedAt || input.startedAt),
      updatedAt: nowIso,
      status: input.status === "stopped" ? "stopped" : "running",
      stoppedAt:
        input.status === "stopped"
          ? normalizeIsoTime(input.stoppedAt || nowIso)
          : undefined,
    };
  } else {
    registry.agents.push({
      projectRoot,
      pid,
      startedAt: normalizeIsoTime(input.startedAt),
      updatedAt: nowIso,
      status: input.status === "stopped" ? "stopped" : "running",
      stoppedAt:
        input.status === "stopped"
          ? normalizeIsoTime(input.stoppedAt || nowIso)
          : undefined,
    });
  }

  registry.updatedAt = nowIso;
  await writeConsoleAgentRegistry(registry);
}

/**
 * 标记 agent 为 stopped（保留历史记录，不删除）。
 */
export async function markConsoleAgentStopped(projectRoot: string): Promise<void> {
  const key = normalizeProjectRoot(projectRoot);
  const registry = await readConsoleAgentRegistry();
  const index = registry.agents.findIndex((entry) => entry.projectRoot === key);
  if (index < 0) return;
  const nowIso = new Date().toISOString();
  const current = registry.agents[index];
  registry.agents[index] = {
    ...current,
    status: "stopped",
    stoppedAt: nowIso,
    updatedAt: nowIso,
  };
  registry.updatedAt = nowIso;
  await writeConsoleAgentRegistry(registry);
}

/**
 * 按 projectRoot 移除一条 agent 记录。
 */
export async function removeConsoleAgentEntry(projectRoot: string): Promise<void> {
  const key = normalizeProjectRoot(projectRoot);
  const registry = await readConsoleAgentRegistry();
  const nextAgents = registry.agents.filter((entry) => entry.projectRoot !== key);
  if (nextAgents.length === registry.agents.length) return;
  registry.agents = nextAgents;
  registry.updatedAt = new Date().toISOString();
  await writeConsoleAgentRegistry(registry);
}
