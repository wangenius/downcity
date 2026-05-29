/**
 * Balance 服务底层数据库访问工具。
 *
 * 关键说明（中文）
 * - 同时兼容 sqlite 与 D1 的 prepare 接口
 * - 这里统一封装 run / first / all，业务逻辑不再感知方言差异
 */

type RawStatement = {
  bind?: (...params: unknown[]) => RawStatement;
  run?: (...params: unknown[]) => unknown | Promise<unknown>;
  get?: (...params: unknown[]) => unknown;
  all?: (...params: unknown[]) => unknown;
  first?: () => unknown | Promise<unknown>;
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
