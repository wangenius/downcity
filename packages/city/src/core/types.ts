/**
 * City 配置类型模块。
 *
 * 包含创建 City 实例和健康检查所需的所有类型定义。
 */

import type { Runtime } from "./runtime.ts";
import type { Database } from "../store/db.ts";

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
 * 默认只需要传入 Drizzle db。City 会自动初始化内置 env/towns 能力。
 */
export interface CityBaseOptions {
  /**
   * Drizzle database 对象。
   *
   * 支持 pg 与 sqlite 方言；D1 也属于 sqlite 方言。
   */
  db: Database & { $client?: unknown };

  /**
   * 数据库方言。
   *
   * 默认会从 Drizzle db 自动推断；当自定义 db 无法推断时可以显式传入。
   */
  dialect?: "pg" | "sqlite";

  /**
   * 原始数据库实例。
   *
   * 某些服务需要把底层数据库传给第三方库时使用，例如 accounts 服务。
   * 默认使用 db.$client。
   */
  raw?: unknown;

  /**
   * 内部运行时能力。
   *
   * 保留给测试和高级适配场景；普通用户不需要传入。
   */
  runtime?: Runtime;
}
