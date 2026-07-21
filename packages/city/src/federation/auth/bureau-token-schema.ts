/**
 * Federation Bureau Token 数据库表。
 *
 * 只保存 Token hash 和权限元数据，不持久化 Bureau Token 明文。
 */

import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

const BUREAU_TOKEN_TABLE = "federation_bureau_tokens";

/** Federation SQLite Bureau Token 表。 */
export const sqlite_bureau_tokens = sqliteTable(BUREAU_TOKEN_TABLE, {
  /** Bureau Token 查找 ID。 */
  token_id: sqliteText("token_id").primaryKey(),
  /** Bureau 名称。 */
  name: sqliteText("name").notNull(),
  /** Token 绑定的 City。 */
  city_id: sqliteText("city_id").notNull(),
  /** Token SHA-256 Base64URL hash。 */
  token_hash: sqliteText("token_hash").notNull(),
  /** JSON capability 列表。 */
  capabilities: sqliteText("capabilities").notNull(),
  /** active 或 revoked。 */
  status: sqliteText("status").notNull(),
  /** 创建时间。 */
  created_at: sqliteText("created_at").notNull(),
  /** 更新时间。 */
  updated_at: sqliteText("updated_at").notNull(),
});

/** Federation Postgres Bureau Token 表。 */
export const pg_bureau_tokens = pgTable(BUREAU_TOKEN_TABLE, {
  /** Bureau Token 查找 ID。 */
  token_id: pgText("token_id").primaryKey(),
  /** Bureau 名称。 */
  name: pgText("name").notNull(),
  /** Token 绑定的 City。 */
  city_id: pgText("city_id").notNull(),
  /** Token SHA-256 Base64URL hash。 */
  token_hash: pgText("token_hash").notNull(),
  /** JSON capability 列表。 */
  capabilities: pgText("capabilities").notNull(),
  /** active 或 revoked。 */
  status: pgText("status").notNull(),
  /** 创建时间。 */
  created_at: pgText("created_at").notNull(),
  /** 更新时间。 */
  updated_at: pgText("updated_at").notNull(),
});
