/**
 * Balance 服务底层数据库访问工具。
 *
 * 关键说明（中文）
 * - 同时兼容 sqlite 与 D1 的 prepare 接口
 * - 这里统一封装 run / first / all，业务逻辑不再感知方言差异
 */

import type {
  BalanceRawCommand,
  BalanceRawRunResult,
} from "./types/RawDatabase.js";

type RawStatement = {
  bind?: (...params: unknown[]) => RawStatement;
  run?: (...params: unknown[]) => unknown | Promise<unknown>;
  get?: (...params: unknown[]) => unknown;
  all?: (...params: unknown[]) => unknown;
  first?: () => unknown | Promise<unknown>;
};

type RawDatabase = {
  /** 创建预编译语句。 */
  prepare?: (query: string) => RawStatement;
  /** D1 原子批处理入口。 */
  batch?: (statements: RawStatement[]) => unknown | Promise<unknown>;
  /** better-sqlite3 同步事务入口。 */
  transaction?: <TArgs extends unknown[], TResult>(
    callback: (...args: TArgs) => TResult,
  ) => (...args: TArgs) => TResult;
};

function prepareRawStatement(
  raw: unknown,
  sql: string,
  params: unknown[],
): { kind: "d1" | "sqlite"; statement: RawStatement; params: unknown[] } {
  const prepare = (raw as { prepare?: (query: string) => RawStatement }).prepare;
  if (typeof prepare !== "function") {
    throw new Error("balance service requires a raw database with prepare()");
  }

  const statement = prepare.call(raw, sql);
  if (typeof statement.bind === "function" && typeof statement.get !== "function") {
    return {
      kind: "d1",
      statement: statement.bind(...params),
      params: [],
    };
  }

  return {
    kind: "sqlite",
    statement,
    params,
  };
}

/**
 * 执行写操作。
 */
export async function rawRun(raw: unknown, sql: string, params: unknown[]): Promise<number> {
  const prepared = prepareRawStatement(raw, sql, params);
  if (typeof prepared.statement.run !== "function") {
    throw new Error("Prepared statement does not support run()");
  }

  const result = await prepared.statement.run(...prepared.params) as {
    changes?: number;
    meta?: { changes?: number };
  };
  return Number(result?.changes ?? result?.meta?.changes ?? 0);
}

/**
 * 原子执行一组写命令。
 *
 * 关键说明（中文）
 * - D1 的 `batch()` 保证整组语句作为一个事务提交。
 * - better-sqlite3 使用同步 `transaction()` 包裹全部语句。
 * - 不支持原子能力的 raw database 会直接失败，避免静默退化成半完成写入。
 */
export async function rawAtomic(
  raw: unknown,
  commands: BalanceRawCommand[],
): Promise<BalanceRawRunResult[]> {
  if (commands.length === 0) return [];
  const database = raw as RawDatabase;

  if (typeof database.batch === "function") {
    if (typeof database.prepare !== "function") {
      throw new Error("D1 atomic batch requires prepare()");
    }
    const statements = commands.map((command) => {
      const statement = database.prepare!(command.sql);
      if (typeof statement.bind !== "function") {
        throw new Error("D1 atomic batch statement requires bind()");
      }
      return statement.bind(...command.params);
    });
    const results = await database.batch(statements) as Array<{
      changes?: number;
      meta?: { changes?: number };
    }>;
    return results.map((result) => ({
      changes: Number(result?.changes ?? result?.meta?.changes ?? 0),
    }));
  }

  if (typeof database.transaction === "function") {
    if (typeof database.prepare !== "function") {
      throw new Error("SQLite transaction requires prepare()");
    }
    const execute = database.transaction((items: BalanceRawCommand[]) =>
      items.map((command) => {
        const statement = database.prepare!(command.sql);
        if (typeof statement.run !== "function") {
          throw new Error("SQLite transaction statement requires run()");
        }
        const result = statement.run(...command.params) as { changes?: number };
        return { changes: Number(result?.changes ?? 0) };
      }));
    return execute(commands);
  }

  throw new Error("balance service requires an atomic SQLite or D1 database");
}

/**
 * 读取单行记录。
 */
export async function rawFirst<TRow extends Record<string, unknown>>(
  raw: unknown,
  sql: string,
  params: unknown[],
): Promise<TRow | undefined> {
  const prepared = prepareRawStatement(raw, sql, params);

  if (prepared.kind === "d1") {
    if (typeof prepared.statement.first !== "function") {
      throw new Error("Prepared statement does not support first()");
    }
    const result = await prepared.statement.first();
    return result ? result as TRow : undefined;
  }

  if (typeof prepared.statement.get !== "function") {
    throw new Error("Prepared statement does not support get()");
  }
  const result = prepared.statement.get(...prepared.params);
  return result ? result as TRow : undefined;
}

/**
 * 读取多行记录。
 */
export async function rawAll<TRow extends Record<string, unknown>>(
  raw: unknown,
  sql: string,
  params: unknown[],
): Promise<TRow[]> {
  const prepared = prepareRawStatement(raw, sql, params);

  if (prepared.kind === "d1") {
    if (typeof prepared.statement.all !== "function") {
      throw new Error("Prepared statement does not support all()");
    }
    const result = await prepared.statement.all();
    const rows = (result as { results?: unknown[] })?.results;
    return Array.isArray(rows) ? rows as TRow[] : [];
  }

  if (typeof prepared.statement.all !== "function") {
    throw new Error("Prepared statement does not support all()");
  }
  const result = prepared.statement.all(...prepared.params);
  return Array.isArray(result) ? result as TRow[] : [];
}
