/**
 * Town 数据库 schema 模块。
 *
 * 定义 Downcity 内置的 Town 表结构（SQLite + Postgres）。
 * Town 是 City 多租户隔离的基本单位。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_TOWN_TABLE = "towns";

/**
 * 默认 SQLite Town 表。
 */
export const sqliteTowns = sqliteTable(DEFAULT_TOWN_TABLE, {
  /**
   * Town ID。
   */
  town_id: sqliteText("town_id").primaryKey(),

  /**
   * Town 名称。
   */
  name: sqliteText("name").notNull(),

  /**
   * Town 状态。
   */
  status: sqliteText("status").notNull(),

  /**
   * Town 创建时间。
   */
  created_at: sqliteText("created_at").notNull(),

  /**
   * Town 更新时间。
   */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres Town 表。
 */
export const pgTowns = pgTable(DEFAULT_TOWN_TABLE, {
  /**
   * Town ID。
   */
  town_id: pgText("town_id").primaryKey(),

  /**
   * Town 名称。
   */
  name: pgText("name").notNull(),

  /**
   * Town 状态。
   */
  status: pgText("status").notNull(),

  /**
   * Town 创建时间。
   */
  created_at: pgText("created_at").notNull(),

  /**
   * Town 更新时间。
   */
  updated_at: pgText("updated_at").notNull(),
});
