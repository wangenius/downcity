/**
 * Manager Agent Registry（`~/.ship/manager/agents.json`）。
 *
 * 关键点（中文）
 * - 维护“当前 manager 认知到的 agent 项目列表”。
 * - 仅存储最小元数据，不承载实时健康检查逻辑。
 */

import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import type {
  ManagedAgentRegistryEntry,
  ManagedAgentRegistryV1,
} from "@/main/types/Manager.js";

const MANAGER_DIR = path.join(os.homedir(), ".ship", "manager");
const MANAGED_AGENTS_FILE = path.join(MANAGER_DIR, "agents.json");

function buildEmptyRegistry(): ManagedAgentRegistryV1 {
  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    agents: [],
  };
}

function normalizeProjectRoot(projectRoot: string): string {
  const resolved = path.resolve(String(projectRoot || "").trim());
  if (!resolved) {
    throw new Error("projectRoot is required");
  }
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
  entry: Partial<ManagedAgentRegistryEntry>,
): ManagedAgentRegistryEntry | null {
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
    };
  } catch {
    return null;
  }
}

function normalizeRegistry(
  value: Partial<ManagedAgentRegistryV1> | null | undefined,
): ManagedAgentRegistryV1 {
  if (!value || typeof value !== "object") return buildEmptyRegistry();
  const source = Array.isArray(value.agents) ? value.agents : [];
  const normalizedAgents: ManagedAgentRegistryEntry[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const normalized = normalizeRegistryEntry(item as ManagedAgentRegistryEntry);
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

async function writeManagedAgentRegistry(
  registry: ManagedAgentRegistryV1,
): Promise<void> {
  await fs.ensureDir(MANAGER_DIR);
  await fs.writeJson(MANAGED_AGENTS_FILE, normalizeRegistry(registry), {
    spaces: 2,
  });
}

/**
 * 获取 manager agent registry 文件路径。
 */
export function getManagerAgentRegistryPath(): string {
  return MANAGED_AGENTS_FILE;
}

/**
 * 读取 manager agent registry（容错）。
 *
 * 关键点（中文）
 * - 文件不存在或损坏时返回空 registry，避免影响主流程。
 */
export async function readManagedAgentRegistry(): Promise<ManagedAgentRegistryV1> {
  try {
    if (!(await fs.pathExists(MANAGED_AGENTS_FILE))) {
      return buildEmptyRegistry();
    }
    const raw = (await fs.readJson(MANAGED_AGENTS_FILE)) as Partial<ManagedAgentRegistryV1>;
    return normalizeRegistry(raw);
  } catch {
    return buildEmptyRegistry();
  }
}

/**
 * 列出 registry 中记录的 agent（按 projectRoot 排序）。
 */
export async function listManagedAgents(): Promise<ManagedAgentRegistryEntry[]> {
  const registry = await readManagedAgentRegistry();
  return [...registry.agents].sort((a, b) =>
    a.projectRoot.localeCompare(b.projectRoot),
  );
}

/**
 * 新增或更新一条 agent 记录。
 */
export async function upsertManagedAgentEntry(input: {
  projectRoot: string;
  pid: number;
  startedAt?: string;
}): Promise<void> {
  const projectRoot = normalizeProjectRoot(input.projectRoot);
  const pid = normalizePid(input.pid);
  const nowIso = new Date().toISOString();
  const registry = await readManagedAgentRegistry();
  const index = registry.agents.findIndex(
    (entry) => entry.projectRoot === projectRoot,
  );
  if (index >= 0) {
    const existing = registry.agents[index];
    registry.agents[index] = {
      projectRoot,
      pid,
      startedAt: normalizeIsoTime(existing.startedAt || input.startedAt),
      updatedAt: nowIso,
    };
  } else {
    registry.agents.push({
      projectRoot,
      pid,
      startedAt: normalizeIsoTime(input.startedAt),
      updatedAt: nowIso,
    });
  }
  registry.updatedAt = nowIso;
  await writeManagedAgentRegistry(registry);
}

/**
 * 按 projectRoot 移除一条 agent 记录。
 */
export async function removeManagedAgentEntry(projectRoot: string): Promise<void> {
  const key = normalizeProjectRoot(projectRoot);
  const registry = await readManagedAgentRegistry();
  const nextAgents = registry.agents.filter((entry) => entry.projectRoot !== key);
  if (nextAgents.length === registry.agents.length) return;
  registry.agents = nextAgents;
  registry.updatedAt = new Date().toISOString();
  await writeManagedAgentRegistry(registry);
}
