/**
 * Product 数据库 schema 模块。
 *
 * 定义 Downcity 内置的 Product 表结构（SQLite + Postgres）。
 * Product 是 InfraRuntime 多租户隔离的基本单位。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const DEFAULT_PRODUCT_TABLE = "products";

/**
 * 默认 SQLite Product 表。
 */
export const sqliteProducts = sqliteTable(DEFAULT_PRODUCT_TABLE, {
  /**
   * Product ID。
   */
  product_id: sqliteText("product_id").primaryKey(),

  /**
   * Product 名称。
   */
  name: sqliteText("name").notNull(),

  /**
   * Product 状态。
   */
  status: sqliteText("status").notNull(),

  /**
   * Product 创建时间。
   */
  created_at: sqliteText("created_at").notNull(),

  /**
   * Product 更新时间。
   */
  updated_at: sqliteText("updated_at").notNull(),
});

/**
 * 默认 Postgres Product 表。
 */
export const pgProducts = pgTable(DEFAULT_PRODUCT_TABLE, {
  /**
   * Product ID。
   */
  product_id: pgText("product_id").primaryKey(),

  /**
   * Product 名称。
   */
  name: pgText("name").notNull(),

  /**
   * Product 状态。
   */
  status: pgText("status").notNull(),

  /**
   * Product 创建时间。
   */
  created_at: pgText("created_at").notNull(),

  /**
   * Product 更新时间。
   */
  updated_at: pgText("updated_at").notNull(),
});
