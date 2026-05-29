/**
 * 通用表操作模块。
 *
 * 基于 Drizzle query builder 提供动态用户表的 CRUD。
 * 构造时做一次 Database 转换，后续方法零类型断言。
 */

import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import {
  getTableColumns,
  getTableName,
  eq,
  and,
  type SQL,
} from "drizzle-orm";
import type { Database } from "./db.js";
import { quoteIdent } from "../utils/helpers.js";

// ===========================================================================
// InfraTableApi 类型
// ===========================================================================

export interface InfraTableApi<TRow = Record<string, unknown>> {
  /** 表在数据库中的真实名称 */
  readonly name: string;
  /** 原始 Drizzle table 对象 */
  readonly schema: AnySQLiteTable | AnyPgTable;
  /** 读取表数据 */
  select(where?: Partial<TRow>): Promise<TRow[]>;
  /** 插入一行或多行数据 */
  insert(values: Partial<TRow> | Partial<TRow>[]): Promise<void>;
  /** 按 where 等值条件更新数据 */
  update(input: { where: Partial<TRow>; values: Partial<TRow> }): Promise<number>;
  /** 按 where 等值条件删除数据 */
  delete(where: Partial<TRow>): Promise<number>;
}

// ===========================================================================
// TableApi — 动态用户表 CRUD
// ===========================================================================

export class TableApi implements InfraTableApi {
  readonly name: string;
  readonly schema: AnySQLiteTable | AnyPgTable;

  private readonly db: Database;

  constructor(db: Database, schema: AnySQLiteTable | AnyPgTable) {
    this.db = db;
    this.schema = schema;
    this.name = getTableName(schema);
  }

  async select(where: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const cond = buildCondition(this.schema, where);
    const query = this.db.select().from(this.schema as unknown);
    const rows = cond
      ? await (query as { where(c: SQL | undefined): Promise<Record<string, unknown>[]> }).where(cond)
      : await (query as Promise<Record<string, unknown>[]>);
    return rows.map((row: Record<string, unknown>) => ({ ...row }));
  }

  async insert(values: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
    const rows = Array.isArray(values) ? values : [values];
    if (rows.length === 0) throw new TypeError("insert() values cannot be empty");
    await this.db.insert(this.schema as unknown).values(rows);
  }

  async update(input: {
    where: Record<string, unknown>;
    values: Record<string, unknown>;
  }): Promise<number> {
    if (Object.keys(input.values).length === 0) {
      throw new TypeError("update() values cannot be empty");
    }
    const cond = buildCondition(this.schema, input.where);
    if (!cond) throw new TypeError("update() where cannot be empty");
    // Drizzle update 返回类型因方言而异
    const result = await this.db.update(this.schema as unknown).set(input.values).where(cond) as { changes?: number; length?: number };
    return typeof result.changes === "number" ? result.changes : Array.isArray(result) ? result.length : 0;
  }

  async delete(where: Record<string, unknown>): Promise<number> {
    const cond = buildCondition(this.schema, where);
    if (!cond) throw new TypeError("delete() where cannot be empty");
    const result = await this.db.delete(this.schema as unknown).where(cond) as { changes?: number; length?: number };
    return typeof result.changes === "number" ? result.changes : Array.isArray(result) ? result.length : 0;
  }
}

// ===========================================================================
// DDL 生成（仅在 store init 时使用）
// ===========================================================================

/** 用户表建表 DDL */
export function buildCreateUserTableSQL(table: AnySQLiteTable | AnyPgTable): string {
  const tableName = getTableName(table);
  const colDefs: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const key of Object.keys(table)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const col = (table as any)[key] as Record<string, unknown> | undefined;
    if (!col || typeof col.name !== "string") continue;

    const name = String(col.name);
    const dataType = String(col.dataType ?? "string");
    const isPrimary = Boolean(col.primary ?? false);
    const isNotNull = Boolean(col.notNull ?? false);

    const sqlType = dataType === "number" ? "INTEGER"
      : dataType === "boolean" ? "INTEGER"
      : dataType === "json" ? "TEXT"
      : "TEXT";

    const parts = [`"${name}"`, sqlType];
    if (isPrimary) parts.push("PRIMARY KEY");
    if (isNotNull && !isPrimary) parts.push("NOT NULL");
    colDefs.push(parts.join(" "));
  }

  if (colDefs.length === 0) return "";
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(", ")})`;
}

// ===========================================================================
// 内部辅助
// ===========================================================================

function buildCondition(
  table: AnySQLiteTable | AnyPgTable,
  where: Record<string, unknown>,
): SQL | undefined {
  const entries = Object.entries(where);
  if (entries.length === 0) return undefined;

  const columns = getTableColumns(table);
  return and(...entries.map(([key, value]) => {
    const col = columns[key];
    if (!col) throw new TypeError(`Unknown column for ${getTableName(table)}: ${key}`);
    return eq(col, value);
  }));
}
