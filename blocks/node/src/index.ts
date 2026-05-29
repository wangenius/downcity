#!/usr/bin/env node

/**
 * Downcity 产品 server（Node.js + SQLite 开发环境）。
 */

import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { compose_block } from "../../shared/src/compose-block.js";
import * as models from "./models/index.js";

const sqlite = new Database("./data.sqlite");
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
const envTable = await base.table<{ key: string; value: string }>("env");
const adminKey = (await envTable.select({ key: "DOWNCITY_INFRA_ADMIN_SECRET_KEY" }))[0]?.value ?? "(not set)";
serve({ fetch: base.router().fetch, port: 43127, hostname: "127.0.0.1" });
console.log(`Downcity http://127.0.0.1:43127`);
console.log(`Admin key: ${adminKey}`);
