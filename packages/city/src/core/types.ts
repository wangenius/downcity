/**
 * City 配置类型模块。
 *
 * 包含创建 City 实例和健康检查所需的所有类型定义。
 */

import type { Database } from "../store/db.js";

/**
 * 单次请求的运行时执行上下文。
 */
export interface CityRequestExecutionContext {
  /**
   * 延长后台任务生命周期。
   *
   * Worker 运行时会映射到 ExecutionContext.waitUntil。
   */
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * CityBase.handleRequest 的可选参数。
 */
export interface CityHandleRequestOptions {
  /** 单次请求的运行时执行上下文。 */
  execution?: CityRequestExecutionContext;
}

/**
 * City 健康检查结果。
 */
export interface CityBaseHealthStatus {
  /** 当前 Runtime 是否已经完成初始化并可处理请求 */
  ok: boolean;
  /** 服务名称，用于外部探测确认命中的服务类型 */
  name: string;
  /** 健康检查响应时间 */
  checked_at: string;
  /** 当前注册的 service ID 列表 */
  services: string[];
  /** 当前启用的 service 信息列表 */
  service_list: { id: string; name: string }[];
}

/**
 * 创建 City 实例时传入的顶层配置。
 *
 * 关键说明（中文）
 * - 只接收一个 Drizzle db 对象，City 自己从中推断方言和底层 client。
 * - 不再需要传 `dialect`、`raw`、`runtime` 等冗余选项。
 */
export interface CityBaseOptions {
  /**
   * Drizzle database 对象。
   *
   * 关键说明（中文）
   * - 支持 SQLite（含 D1）与 Postgres 方言；City 直接从 `db.dialect` 推断方言。
   * - 支持的底层 client 通过 `db.$client` 暴露给 accounts 等需要原始连接的 service。
   */
  db: Database & { $client?: unknown; dialect?: unknown };
}
