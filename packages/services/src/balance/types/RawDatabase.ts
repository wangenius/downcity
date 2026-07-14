/**
 * Balance 底层数据库命令类型。
 *
 * 该模块只描述原子批处理需要的最小协议，业务层不直接依赖具体 SQLite 或 D1 类型。
 */

/** 单条带参数 SQL 命令。 */
export interface BalanceRawCommand {
  /** 要执行的 SQL 文本。 */
  sql: string;
  /** 按占位符顺序绑定的参数。 */
  params: unknown[];
}

/** 单条写命令的执行结果。 */
export interface BalanceRawRunResult {
  /** 本次写操作影响的行数。 */
  changes: number;
}
