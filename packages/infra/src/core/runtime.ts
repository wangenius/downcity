/**
 * Runtime 能力接口模块。
 *
 * 定义 InfraRuntime 内部依赖的能力集合。用户侧只需要传入 Drizzle db，
 * InfraRuntime 会从 db 组装这些能力。
 *
 * 使用示例：
 * ```ts
 * const infra = new InfraRuntime({ db });
 * ```
 */

import type { Database, DbClient } from "../store/db.js";
import type { EnvEntry, EnvUpsertInput } from "../service/env/types.js";
import type { EnvStore } from "../service/env/env-store.js";
import type { AnySQLiteTable } from "drizzle-orm/sqlite-core";
import type { AnyPgTable } from "drizzle-orm/pg-core";

/** 表定义类型（SQLite 或 Postgres） */
export type TableDef = AnySQLiteTable | AnyPgTable;

// ===========================================================================
// EnvProvider — 环境变量提供者接口
// ===========================================================================

/**
 * 环境变量提供者接口。
 *
 * InfraRuntime 通过此接口读取/写入运行时环境变量。
 */
export interface EnvProvider {
  /**
   * 读取单个环境变量。
   *
   * @param key - 环境变量名（会自动标准化）
   */
  get(key: string): string | undefined;

  /**
   * 主动刷新当前 provider 的读取视图。
   *
   * 关键说明（中文）
   * - InfraRuntime 在每次 HTTP 请求进入时会先调用它
   * - 这样 Worker 常驻实例也能及时看到别的请求刚写入的 InfraRuntime env
   */
  refresh(): Promise<void>;

  /**
   * 列出所有环境变量（含来源信息）。
   */
  list(): EnvEntry[] | Promise<EnvEntry[]>;

  /**
   * 写入或更新环境变量。
   *
   * @param input - 环境变量键值
   */
  upsert(input: EnvUpsertInput): Promise<EnvEntry>;

  /**
   * 删除环境变量。
   *
   * @param key - 环境变量名
   */
  remove(key: string): Promise<void>;

  /**
   * 批量导入环境变量文本（.env 格式）。
   *
   * @param raw - .env 文本内容
   */
  import(raw: unknown): Promise<EnvEntry[]>;

  /**
   * 关联数据库存储。
   *
   * InfraRuntime 初始化内置 env 表后调用。
   * 默认 env provider 会把 InfraRuntime env 表作为唯一业务 env 来源。
   */
  attachStore(store: EnvStore): Promise<void>;
}

// ===========================================================================
// BuiltinTables — InfraRuntime 内置表定义
// ===========================================================================

/**
 * InfraRuntime 内置表定义。
 *
 * 包含 products 和 env 两个内置表。
 * 适配器根据数据库类型（SQLite / Postgres）提供对应的表定义。
 */
export interface BuiltinTables {
  /** 产品表 */
  products: TableDef;
  /** 环境变量表 */
  env: TableDef;
}

// ===========================================================================
// Runtime — 运行时适配器接口
// ===========================================================================

/**
 * 运行时能力接口。
 *
 * 这是 InfraRuntime 内部从 Drizzle db 组装出来的结构，不作为用户主要入口。
 */
export interface Runtime {
  /**
   * 数据库实例（Drizzle Database 接口）。
   *
   * 用于 Service 的 CRUD 操作。
   */
  database: Database;

  /**
   * 底层数据库客户端（用于 DDL 执行）。
   */
  client: DbClient;

  /**
   * 环境变量提供者。
   *
   * 用于读取密钥、API key 等配置。
   */
  env: EnvProvider;

  /**
   * InfraRuntime 内置表定义（products + env）。
   *
   * 适配器根据数据库类型提供正确的 Drizzle 表定义。
   */
  builtinTables: BuiltinTables;

  /**
   * 原始数据库实例（better-sqlite3 Database / D1Database 等）。
   * 供 better-auth 等第三方库直接使用。
   */
  raw?: unknown;

  /**
   * 服务公网 URL（http://localhost:43127 或 https://xxx.workers.dev）。
   * 用于 OAuth callback、邮件链接等。
   */
  baseURL?: string;
}
