/**
 * Bay 数据库 schema 模块。
 *
 * 定义 Downcity 内置的 Bay 表结构（SQLite + Postgres）。
 * Bay 是 City 多租户隔离的基本单位。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_BAY_TABLE = "bays";

/**
 * 默认 SQLite Bay 表。
 */
export const sqliteBays = sqliteTable(DEFAULT_BAY_TABLE, {
  /**
   * Bay ID。
   */
  bay_id: sqliteText("bay_id").primaryKey(),

  /**
   * Bay 名称。
   */
  name: sqliteText("name").notNull(),

  /**
   * Bay 状态。
   */
  status: sqliteText("status").notNull(),

  /**
   * Bay 创建时间。
   */
  created_at: sqliteText("created_at").notNull(),

  /**
   * Bay 更新时间。
   */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres Bay 表。
 */
export const pgBays = pgTable(DEFAULT_BAY_TABLE, {
  /**
   * Bay ID。
   */
  bay_id: pgText("bay_id").primaryKey(),

  /**
   * Bay 名称。
   */
  name: pgText("name").notNull(),

  /**
   * Bay 状态。
   */
  status: pgText("status").notNull(),

  /**
   * Bay 创建时间。
   */
  created_at: pgText("created_at").notNull(),

  /**
   * Bay 更新时间。
   */
  updated_at: pgText("updated_at").notNull(),
});
