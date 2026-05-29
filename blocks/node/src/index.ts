#!/usr/bin/env node

/**
 * Downcity Node 街区入口。
 *
 * 负责在 Node.js 环境中启动一套可部署的 InfraRuntime。
 * 本地默认使用 `./data.sqlite`，容器部署时推荐通过
 * `DOWNCITY_INFRA_DATABASE_URL=file:/data/downcity.sqlite` 指向持久化 volume。
 */

import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { compose_block } from "../../shared/src/compose-block.js";
import * as models from "./models/index.js";

/**
 * 解析 SQLite 数据库路径。
 *
 * 关键说明（中文）
 * - blocks/node 当前使用 better-sqlite3，只支持本地 SQLite 文件。
 * - `file:` 前缀便于 Compose / Dokploy 和本地 .env 使用同一套表达。
 * - Postgres 等远端数据库后续应通过独立 adapter 接入，不在这里偷偷兼容。
 */
function resolve_sqlite_path(database_url: string | undefined): string {
  if (!database_url) {
    return "./data.sqlite";
  }

  if (!database_url.startsWith("file:")) {
    throw new Error("blocks/node only supports file: SQLite URLs in DOWNCITY_INFRA_DATABASE_URL.");
  }

  const path = database_url.slice("file:".length).trim();
  if (!path) {
    throw new Error("DOWNCITY_INFRA_DATABASE_URL must include a SQLite file path.");
  }

  return path;
}

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "43127", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}

const sqlite_path = resolve_sqlite_path(process.env.DOWNCITY_INFRA_DATABASE_URL);
const sqlite = new Database(sqlite_path);
sqlite.pragma("journal_mode = WAL");

const db = Object.assign(drizzle(sqlite), {
  $client: { exec: (sql: string) => sqlite.exec(sql) },
});

const { base } = compose_block({
  db,
  dialect: "sqlite",
  raw: sqlite,
  models: Object.values(models),
  token_ttl: "7d",
  record_usage_errors: true,
});

await base.health();
const env_table = await base.table<{ key: string; value: string }>("env");
const admin_key = (await env_table.select({ key: "DOWNCITY_INFRA_ADMIN_SECRET_KEY" }))[0]?.value ?? "(not set)";
serve({ fetch: base.router().fetch, port, hostname: host });
console.log(`Downcity http://${host}:${port}`);
console.log(`SQLite: ${sqlite_path}`);
console.log(`Admin key: ${admin_key}`);
