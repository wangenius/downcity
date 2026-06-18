/**
 * City 数据库 schema 模块。
 *
 * 定义 Downcity 内置的 City 表结构（SQLite + Postgres）。
 * City 是 Agent 的生活环境。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_CITY_TABLE = "cities";

/**
 * 默认 SQLite City 表。
 */
export const sqliteCities = sqliteTable(DEFAULT_CITY_TABLE, {
  /**
   * City ID。
   */
  city_id: sqliteText("city_id").primaryKey(),

  /**
   * City 名称。
   */
  name: sqliteText("name").notNull(),

  /**
   * City 状态。
   */
  status: sqliteText("status").notNull(),

  /**
   * City 创建时间。
   */
  created_at: sqliteText("created_at").notNull(),

  /**
   * City 更新时间。
   */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres City 表。
 */
export const pgCities = pgTable(DEFAULT_CITY_TABLE, {
  /**
   * City ID。
   */
  city_id: pgText("city_id").primaryKey(),

  /**
   * City 名称。
   */
  name: pgText("name").notNull(),

  /**
   * City 状态。
   */
  status: pgText("status").notNull(),

  /**
   * City 创建时间。
   */
  created_at: pgText("created_at").notNull(),

  /**
   * City 更新时间。
   */
  updated_at: pgText("updated_at").notNull(),
});
