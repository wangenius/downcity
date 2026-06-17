#!/usr/bin/env node

/**
 * Downcity Node 街区入口。
 *
 * 负责在 Node.js 环境中启动一套可部署的 City。
 * 本地默认使用 `./data.sqlite`，容器部署时推荐通过
 * `DOWNCITY_CITY_DATABASE_URL=file:/data/downcity.sqlite` 指向持久化 volume。
 */

import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { CityBase, AIService } from "@downcity/city";
import {
  AccountsService,
  BalanceService,
  BillingService,
  PaymentService,
  UsageService,
  stripePaymentProvider,
} from "@downcity/services";
import * as models from "./models/index.js";

/**
 * 解析 SQLite 数据库路径。
 *
 * 关键说明（中文）
 * - templates/node 当前使用 better-sqlite3，只支持本地 SQLite 文件。
 * - `file:` 前缀便于 Compose / Dokploy 和本地 .env 使用同一套表达。
 * - Postgres 等远端数据库后续应通过独立 adapter 接入，不在这里偷偷兼容。
 */
function resolve_sqlite_path(database_url: string | undefined): string {
  if (!database_url) {
    return "./data.sqlite";
  }

  if (!database_url.startsWith("file:")) {
    throw new Error("templates/node only supports file: SQLite URLs in DOWNCITY_CITY_DATABASE_URL.");
  }

  const path = database_url.slice("file:".length).trim();
  if (!path) {
    throw new Error("DOWNCITY_CITY_DATABASE_URL must include a SQLite file path.");
  }

  return path;
}

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "43127", 10);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number.");
}

const sqlite_path = resolve_sqlite_path(process.env.DOWNCITY_CITY_DATABASE_URL);
const sqlite = new Database(sqlite_path);
sqlite.pragma("journal_mode = WAL");

const db = drizzle(sqlite);

/**
 * 直接装配 Node City。
 *
 * 关键点（中文）
 * - 不再通过 compose_city 函数隐藏装配过程，所有 service 的创建与注册都平铺在这里。
 * - 顺序有依赖关系：payment 依赖 balance，billing 依赖 balance，ai 依赖 billing。
 */
const city = new CityBase({ db });

const accounts = new AccountsService({ token_ttl: "7d" });
city.use(accounts);

const balance = new BalanceService({});
city.use(balance);

const payment = new PaymentService({
  readTopup: async (topup_id) => await balance.readTopup(topup_id),
  finishTopup: async (topup_id, extra) => await balance.finishTopup(topup_id, extra),
  providers: [stripePaymentProvider()],
});
city.use(payment);

const usage = new UsageService({ record_errors: true });
city.use(usage);

const billing = new BillingService({ balance });
city.use(billing);

const ai = new AIService({ billing });
ai.use(Object.values(models));
city.use(ai);

await city.health();
const env_table = await city.table<{ key: string; value: string }>("env");
const admin_key = (await env_table.select({ key: "DOWNCITY_CITY_ADMIN_SECRET_KEY" }))[0]?.value ?? "(not set)";
serve({ fetch: city.router().fetch, port, hostname: host });
console.log(`Downcity http://${host}:${port}`);
console.log(`SQLite: ${sqlite_path}`);
console.log(`Admin key: ${admin_key}`);
