/**
 * Accounts 服务数据库辅助模块。
 *
 * 兼容 D1 与 better-sqlite3 两种 statement 形态，
 * 给服务内部统一提供 first / all / run 能力。
 */

/**
 * 读取单行结果。
 */
export async function readPreparedFirst(
  statement: any,
  params: unknown[],
): Promise<Record<string, unknown> | null> {
  if (typeof statement.bind === "function") {
    const bound = statement.bind(...params);
    if (typeof bound.first === "function") {
      return await bound.first();
    }
    if (typeof bound.get === "function") {
      return await bound.get();
    }
  }

  if (typeof statement.first === "function") {
    return await statement.first(...params);
  }
  if (typeof statement.get === "function") {
    return await statement.get(...params);
  }

  throw new Error("Unsupported database statement for first()");
}

/**
 * 读取多行结果。
 */
export async function readPreparedAll(
  statement: any,
  params: unknown[],
): Promise<Record<string, unknown>[]> {
  if (typeof statement.bind === "function") {
    const bound = statement.bind(...params);
    if (typeof bound.all === "function") {
      const result = await bound.all();
      if (Array.isArray(result)) return result as Record<string, unknown>[];
      if (Array.isArray(result?.results)) return result.results as Record<string, unknown>[];
    }
  }

  if (typeof statement.all === "function") {
    const result = await statement.all(...params);
    if (Array.isArray(result)) return result as Record<string, unknown>[];
    if (Array.isArray(result?.results)) return result.results as Record<string, unknown>[];
  }

  throw new Error("Unsupported database statement for all()");
}

/**
 * 执行写操作。
 */
export async function runPrepared(statement: any, params: unknown[]): Promise<void> {
  if (typeof statement.bind === "function") {
    const bound = statement.bind(...params);
    if (typeof bound.run === "function") {
      await bound.run();
      return;
    }
  }

  if (typeof statement.run === "function") {
    await statement.run(...params);
    return;
  }

  throw new Error("Unsupported database statement for run()");
}
