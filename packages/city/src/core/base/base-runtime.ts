/**
 * City 组装模块。
 *
 * 负责把用户传入的 Drizzle db 适配成 City 内部 runtime 能力，
 * 并提供默认的数据库 env provider。
 */

import { pgEnv, sqliteEnv } from "../../service/env/schema.js";
import { EnvStore } from "../../service/env/env-store.js";
import { pgBays, sqliteBays } from "../../service/bays/schema.js";
import { normalizeEnvKey, parseDotenvEntries } from "../../utils/helpers.js";
import type { CityOptions } from "../types.js";
import type { DbClient } from "../../store/db.js";
import type { BuiltinTables, EnvProvider, Runtime } from "../runtime.js";
import type { EnvEntry, EnvUpsertInput } from "../../service/env/types.js";

/**
 * 从 CityOptions 创建 runtime。
 */
export function create_runtime_from_db(options: CityOptions): Runtime {
  const dialect = options.dialect ?? infer_dialect(options.db);
  const builtin_tables = builtin_tables_for(dialect);
  const client = extract_db_client(options.db);

  return {
    database: options.db,
    client,
    env: new DatabaseEnvProvider(),
    builtinTables: builtin_tables,
    raw: options.raw ?? options.db.$client,
  };
}

/**
 * 推断 City 内置表定义。
 */
function builtin_tables_for(dialect: "pg" | "sqlite"): BuiltinTables {
  return dialect === "pg"
    ? { bays: pgBays, env: pgEnv }
    : { bays: sqliteBays, env: sqliteEnv };
}

/**
 * 从 Drizzle 实例推断方言。
 */
function infer_dialect(db: unknown): "pg" | "sqlite" {
  const entity_kind = (db as { constructor?: { name?: string } }).constructor?.name ?? "";
  if (/pg|postgres/i.test(entity_kind)) return "pg";
  if (/sqlite|d1/i.test(entity_kind)) return "sqlite";
  throw new Error("Unable to infer Drizzle dialect. Pass { dialect: \"pg\" } or { dialect: \"sqlite\" } to City.");
}

/**
 * 提取底层数据库 client。
 */
function extract_db_client(db: { $client?: unknown }): DbClient {
  const client = db.$client;
  if (client && typeof client === "object") {
    return client as DbClient;
  }
  if (typeof client === "function") {
    return {
      unsafe: (sql: string, params?: unknown[]) =>
        (client as (query: string, values?: unknown[]) => Promise<unknown>)(sql, params),
    };
  }
  throw new Error("Drizzle db must expose $client so City can initialize tables.");
}

/**
 * 数据库存储的 env provider。
 *
 * 关键说明（中文）
 * - City 把所有系统与业务 env 统一托管到 env 表
 * - 运行时通过内存 cache 加速读取，每次请求前 refresh 保证最新视图
 */
class DatabaseEnvProvider implements EnvProvider {
  private store?: EnvStore;
  private readonly cache = new Map<string, string>();

  async attachStore(store: EnvStore): Promise<void> {
    this.store = store;
    await this.refresh();
  }

  get(key: string): string | undefined {
    return this.cache.get(normalizeEnvKey(key));
  }

  async refresh(): Promise<void> {
    if (!this.store) return;
    const entries = await this.store.list();
    this.cache.clear();
    for (const entry of entries) {
      this.cache.set(entry.key, entry.value);
    }
  }

  async list(): Promise<EnvEntry[]> {
    await this.refresh();
    return [...this.cache.entries()].map(([key, value]) => ({
      key,
      value,
      source: "database" as const,
    }));
  }

  async upsert(input: EnvUpsertInput): Promise<EnvEntry> {
    if (!this.store) throw new Error("Env store is not ready");
    const entry = await this.store.upsert(input);
    this.cache.set(entry.key, entry.value);
    return entry;
  }

  async remove(key: string): Promise<void> {
    if (!this.store) throw new Error("Env store is not ready");
    const normalized_key = normalizeEnvKey(key);
    await this.store.remove(normalized_key);
    this.cache.delete(normalized_key);
  }

  async import(raw: unknown): Promise<EnvEntry[]> {
    const entries = parseDotenvEntries(raw);
    const stored: EnvEntry[] = [];
    for (const entry of entries) {
      stored.push(await this.upsert(entry));
    }
    return stored;
  }
}
