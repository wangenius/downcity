/**
 * Studio 数据库 schema 模块。
 *
 * 定义 Downcity 内置的 Studio 表结构（SQLite + Postgres）。
 * Studio 是 City 多租户隔离的基本单位。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_STUDIO_TABLE = "studios";

/**
 * 默认 SQLite Studio 表。
 */
export const sqliteStudios = sqliteTable(DEFAULT_STUDIO_TABLE, {
  /**
   * Studio ID。
   */
  studio_id: sqliteText("studio_id").primaryKey(),

  /**
   * Studio 名称。
   */
  name: sqliteText("name").notNull(),

  /**
   * Studio 状态。
   */
  status: sqliteText("status").notNull(),

  /**
   * Studio 创建时间。
   */
  created_at: sqliteText("created_at").notNull(),

  /**
   * Studio 更新时间。
   */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres Studio 表。
 */
export const pgStudios = pgTable(DEFAULT_STUDIO_TABLE, {
  /**
   * Studio ID。
   */
  studio_id: pgText("studio_id").primaryKey(),

  /**
   * Studio 名称。
   */
  name: pgText("name").notNull(),

  /**
   * Studio 状态。
   */
  status: pgText("status").notNull(),

  /**
   * Studio 创建时间。
   */
  created_at: pgText("created_at").notNull(),

  /**
   * Studio 更新时间。
   */
  updated_at: pgText("updated_at").notNull(),
});
