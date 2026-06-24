/**
 * 测试专用 SQLite 数据库工厂。
 *
 * 关键说明（中文）
 * - Drizzle 的 better-sqlite3 实例自身就把 sqlite 实例挂在 $client 上。
 * - 这个 $client 同时支持 DDL 用的 exec() 和 balance / accounts 需要的 prepare()。
 * - 因此不需要再额外覆盖 $client 或挂 raw。
 */

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

export function createSqliteDb(filepath) {
  const sqlite = new Database(filepath)
  sqlite.pragma("journal_mode = WAL")
  return drizzle(sqlite)
}
