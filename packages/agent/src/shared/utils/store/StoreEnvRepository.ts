/**
 * ConsoleStore 环境变量仓储。
 *
 * 关键点（中文）
 * - 统一管理 `env_entries` 单表。
 * - 同时暴露 global / agent 两层语义化包装。
 */

import type {
  StoredAgentEnvEntry,
  StoredEnvEntry,
  StoredEnvScope,
  StoredGlobalEnvEntry,
  UpsertAgentEnvEntryInput,
  UpsertEnvEntryInput,
  UpsertGlobalEnvEntryInput,
} from "@/shared/types/Store.js";
import { decryptText, decryptTextSync, encryptText } from "./crypto.js";
import type { ConsoleStoreContext } from "./StoreShared.js";
import { normalizeNonEmptyText, nowIso } from "./StoreShared.js";

/**
 * 规范化 env scope。
 */
export function normalizeEnvScope(input: string): StoredEnvScope {
  const scope = String(input || "").trim().toLowerCase();
  if (scope === "agent") return "agent";
  return "global";
}

/**
 * 规范化 env 的 agent 目标。
 */
export function normalizeEnvAgentTarget(
  scope: StoredEnvScope,
  agentIdInput?: string,
): string {
  if (scope === "global") return "";
  return normalizeNonEmptyText(agentIdInput || "", "agentId");
}

/**
 * 同步构造 env 条目。
 */
function buildEnvEntryFromRowSync(row: {
  scope?: unknown;
  agent_id?: unknown;
  key?: unknown;
  description?: unknown;
  value_encrypted?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): StoredEnvEntry | null {
  const scope = normalizeEnvScope(String(row.scope || ""));
  const agentId = String(row.agent_id || "").trim();
  const key = String(row.key || "").trim();
  const encrypted = typeof row.value_encrypted === "string" ? row.value_encrypted : "";
  if (!key || !encrypted) return null;
  return {
    scope,
    agentId: scope === "agent" ? agentId : undefined,
    key,
    description: String(row.description || "").trim() || undefined,
    value: decryptTextSync(encrypted),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/**
 * 异步构造 env 条目。
 */
async function buildEnvEntryFromRow(row: {
  scope?: unknown;
  agent_id?: unknown;
  key?: unknown;
  description?: unknown;
  value_encrypted?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}): Promise<StoredEnvEntry | null> {
  const scope = normalizeEnvScope(String(row.scope || ""));
  const agentId = String(row.agent_id || "").trim();
  const key = String(row.key || "").trim();
  const encrypted = typeof row.value_encrypted === "string" ? row.value_encrypted : "";
  if (!key || !encrypted) return null;
  return {
    scope,
    agentId: scope === "agent" ? agentId : undefined,
    key,
    description: String(row.description || "").trim() || undefined,
    value: await decryptText(encrypted),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/**
 * 同步列出 env 条目。
 */
export function listEnvEntriesSync(
  context: ConsoleStoreContext,
  scopeInput?: StoredEnvScope,
  agentIdInput?: string,
): StoredEnvEntry[] {
  const hasScope = Boolean(scopeInput);
  const scope = hasScope ? normalizeEnvScope(scopeInput || "global") : undefined;
  const hasAgentFilter = scope === "agent" && Boolean(String(agentIdInput || "").trim());
  const agentId = hasAgentFilter
    ? normalizeEnvAgentTarget(scope, agentIdInput)
    : undefined;
  const rows = hasAgentFilter
    ? context.sqlite.prepare(
        `
        SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
        FROM env_entries
        WHERE scope = 'agent' AND agent_id = ?
        ORDER BY key ASC;
        `,
      ).all(agentId)
    : scope === "agent"
      ? context.sqlite.prepare(
          `
          SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
          FROM env_entries
          WHERE scope = 'agent'
          ORDER BY agent_id ASC, key ASC;
          `,
        ).all()
      : scope === "global"
        ? context.sqlite.prepare(
            `
            SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'global'
            ORDER BY key ASC;
            `,
          ).all()
        : context.sqlite.prepare(
            `
            SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
            FROM env_entries
            ORDER BY scope ASC, agent_id ASC, key ASC;
            `,
          ).all();
  const out: StoredEnvEntry[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const entry = buildEnvEntryFromRowSync(row);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * 异步列出 env 条目。
 */
export async function listEnvEntries(
  context: ConsoleStoreContext,
  scopeInput?: StoredEnvScope,
  agentIdInput?: string,
): Promise<StoredEnvEntry[]> {
  const hasScope = Boolean(scopeInput);
  const scope = hasScope ? normalizeEnvScope(scopeInput || "global") : undefined;
  const hasAgentFilter = scope === "agent" && Boolean(String(agentIdInput || "").trim());
  const agentId = hasAgentFilter
    ? normalizeEnvAgentTarget(scope, agentIdInput)
    : undefined;
  const rows = hasAgentFilter
    ? context.sqlite.prepare(
        `
        SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
        FROM env_entries
        WHERE scope = 'agent' AND agent_id = ?
        ORDER BY key ASC;
        `,
      ).all(agentId)
    : scope === "agent"
      ? context.sqlite.prepare(
          `
          SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
          FROM env_entries
          WHERE scope = 'agent'
          ORDER BY agent_id ASC, key ASC;
          `,
        ).all()
      : scope === "global"
        ? context.sqlite.prepare(
            `
            SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
            FROM env_entries
            WHERE scope = 'global'
            ORDER BY key ASC;
            `,
          ).all()
        : context.sqlite.prepare(
            `
            SELECT scope, agent_id, key, description, value_encrypted, created_at, updated_at
            FROM env_entries
            ORDER BY scope ASC, agent_id ASC, key ASC;
            `,
          ).all();
  const out: StoredEnvEntry[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const entry = await buildEnvEntryFromRow(row);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * 新增或更新 env 条目。
 */
export async function upsertEnvEntry(
  context: ConsoleStoreContext,
  input: UpsertEnvEntryInput,
): Promise<void> {
  const scope = normalizeEnvScope(input.scope);
  const agentId = normalizeEnvAgentTarget(scope, input.agentId);
  const key = normalizeNonEmptyText(input.key, `${scope} env key`);
  const description = String(input.description || "").trim();
  const value = String(input.value ?? "");
  const existing = context.sqlite
    .prepare(
      `
      SELECT created_at
      FROM env_entries
      WHERE scope = ? AND agent_id = ? AND key = ?
      LIMIT 1;
      `,
    )
    .get(scope, agentId, key) as { created_at?: unknown } | undefined;
  const createdAt = String(existing?.created_at || nowIso());
  const updatedAt = nowIso();
  const encrypted = await encryptText(value);
  context.sqlite
    .prepare(
      `
      INSERT INTO env_entries (
        scope,
        agent_id,
        key,
        description,
        value_encrypted,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scope, agent_id, key) DO UPDATE SET
        description = excluded.description,
        value_encrypted = excluded.value_encrypted,
        updated_at = excluded.updated_at;
      `,
    )
    .run(scope, agentId, key, description || null, encrypted, createdAt, updatedAt);
}

/**
 * 删除单个 env 条目。
 */
export function removeEnvEntry(
  context: ConsoleStoreContext,
  input: { scope: StoredEnvScope; agentId?: string; key: string },
): void {
  const scope = normalizeEnvScope(input.scope);
  const agentId = normalizeEnvAgentTarget(scope, input.agentId);
  const key = normalizeNonEmptyText(input.key, `${scope} env key`);
  context.sqlite
    .prepare("DELETE FROM env_entries WHERE scope = ? AND agent_id = ? AND key = ?;")
    .run(scope, agentId, key);
}

/**
 * 同步列出全局环境变量。
 */
export function listGlobalEnvEntriesSync(
  context: ConsoleStoreContext,
): StoredGlobalEnvEntry[] {
  return listEnvEntriesSync(context, "global");
}

/**
 * 同步读取全局环境变量映射。
 */
export function getGlobalEnvMapSync(
  context: ConsoleStoreContext,
): Record<string, string> {
  const entries = listGlobalEnvEntriesSync(context);
  const map: Record<string, string> = {};
  for (const item of entries) {
    map[item.key] = item.value;
  }
  return map;
}

/**
 * 异步列出全局环境变量。
 */
export async function listGlobalEnvEntries(
  context: ConsoleStoreContext,
): Promise<StoredGlobalEnvEntry[]> {
  return listEnvEntries(context, "global");
}

/**
 * 异步读取全局环境变量映射。
 */
export async function getGlobalEnvMap(
  context: ConsoleStoreContext,
): Promise<Record<string, string>> {
  const entries = await listGlobalEnvEntries(context);
  const map: Record<string, string> = {};
  for (const item of entries) {
    map[item.key] = item.value;
  }
  return map;
}

/**
 * 新增或更新全局环境变量。
 */
export async function upsertGlobalEnvEntry(
  context: ConsoleStoreContext,
  input: UpsertGlobalEnvEntryInput,
): Promise<void> {
  await upsertEnvEntry(context, {
    scope: "global",
    key: input.key,
    value: input.value,
  });
}

/**
 * 删除单个全局环境变量。
 */
export function removeGlobalEnvEntry(
  context: ConsoleStoreContext,
  keyInput: string,
): void {
  removeEnvEntry(context, {
    scope: "global",
    key: keyInput,
  });
}

/**
 * 清空全局环境变量。
 */
export function clearGlobalEnvEntries(context: ConsoleStoreContext): void {
  context.sqlite.prepare("DELETE FROM env_entries WHERE scope = 'global';").run();
}

/**
 * 同步列出指定 agent 的私有环境变量。
 */
export function listAgentEnvEntriesSync(
  context: ConsoleStoreContext,
  agentIdInput: string,
): StoredAgentEnvEntry[] {
  return listEnvEntriesSync(context, "agent", agentIdInput);
}

/**
 * 同步读取 agent 环境变量映射。
 */
export function getAgentEnvMapSync(
  context: ConsoleStoreContext,
  agentIdInput: string,
): Record<string, string> {
  const entries = listAgentEnvEntriesSync(context, agentIdInput);
  const map: Record<string, string> = {};
  for (const item of entries) {
    map[item.key] = item.value;
  }
  return map;
}

/**
 * 异步列出指定 agent 的私有环境变量。
 */
export async function listAgentEnvEntries(
  context: ConsoleStoreContext,
  agentIdInput: string,
): Promise<StoredAgentEnvEntry[]> {
  return listEnvEntries(context, "agent", agentIdInput);
}

/**
 * 异步列出全部 agent 私有环境变量。
 */
export async function listAllAgentEnvEntries(
  context: ConsoleStoreContext,
): Promise<StoredAgentEnvEntry[]> {
  return listEnvEntries(context, "agent");
}

/**
 * 异步读取 agent 环境变量映射。
 */
export async function getAgentEnvMap(
  context: ConsoleStoreContext,
  agentIdInput: string,
): Promise<Record<string, string>> {
  const entries = await listAgentEnvEntries(context, agentIdInput);
  const map: Record<string, string> = {};
  for (const item of entries) {
    map[item.key] = item.value;
  }
  return map;
}

/**
 * 新增或更新 agent 私有环境变量。
 */
export async function upsertAgentEnvEntry(
  context: ConsoleStoreContext,
  input: UpsertAgentEnvEntryInput,
): Promise<void> {
  await upsertEnvEntry(context, {
    scope: "agent",
    agentId: input.agentId,
    key: input.key,
    value: input.value,
  });
}

/**
 * 删除指定 agent 的单个环境变量。
 */
export function removeAgentEnvEntry(
  context: ConsoleStoreContext,
  agentIdInput: string,
  keyInput: string,
): void {
  removeEnvEntry(context, {
    scope: "agent",
    agentId: agentIdInput,
    key: keyInput,
  });
}

/**
 * 清空指定 agent 的私有环境变量。
 */
export function clearAgentEnvEntries(
  context: ConsoleStoreContext,
  agentIdInput: string,
): void {
  const agentId = normalizeNonEmptyText(agentIdInput, "agentId");
  context.sqlite
    .prepare("DELETE FROM env_entries WHERE scope = 'agent' AND agent_id = ?;")
    .run(agentId);
}
