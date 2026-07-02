/**
 * City 配置类型模块。
 *
 * 包含创建 City 实例和健康检查所需的所有类型定义。
 */

import type { Database } from "../store/db.js";
import type { FederationStorage } from "./storage.js";
import type { RuntimeUser } from "./auth/types.js";

/**
 * Federation 进程内可信身份。
 *
 * 关键点（中文）
 * - 只允许同进程调用 `Federation.fetch()` 时传入。
 * - 不能通过 HTTP header、query 或 body 构造，避免绕过公网 token 鉴权。
 */
export type FederationTrustedIdentity =
  | {
      /** 以管理端身份访问当前 Federation。 */
      level: "admin";
    }
  | {
      /** 以终端用户身份访问当前 Federation。 */
      level: "user";
      /** 当前用户信息，会注入到 `ctx.user`。 */
      user: RuntimeUser;
      /** 当前用户所属 City。 */
      city: { city_id: string; status: string };
    };

/**
 * Federation 请求进入运行时的 transport 来源。
 */
export type FederationRequestTransport = "http";

/**
 * 单次请求的运行时执行上下文。
 */
export interface FederationRequestExecutionContext {
  /**
   * 延长后台任务生命周期。
   *
   * Worker 运行时会映射到 ExecutionContext.waitUntil。
   */
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Federation.fetch 的可选参数。
 */
export interface FederationFetchOptions {
  /** 单次请求的运行时执行上下文。 */
  execution?: FederationRequestExecutionContext;
  /**
   * 进程内可信身份。
   *
   * 关键点（中文）
   * - 供同进程嵌入式 server 调用使用。
   * - HTTP 入口不会从请求内容自动生成该身份。
   */
  trusted_identity?: FederationTrustedIdentity;
  /**
  /** 当前请求来源 transport，默认是 `http`。 */
  transport?: FederationRequestTransport;
}

/**
 * City 健康检查结果。
 */
export interface FederationHealthStatus {
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
export interface FederationOptions {
  /**
   * Drizzle database 对象。
   *
   * 关键说明（中文）
   * - 支持 SQLite（含 D1）与 Postgres 方言；City 直接从 `db.dialect` 推断方言。
   * - 支持的底层 client 通过 `db.$client` 暴露给 accounts 等需要原始连接的 service。
   */
  db: Database & { $client?: unknown; dialect?: unknown };
  /**
   * Federation 默认存储后端。
   *
   * 关键说明（中文）
   * - 可直接通过构造函数传入，也可在创建后调用 `federation.storage(...)` 注册。
   * - Service 通过 `ctx.storage` 使用该能力，避免业务模块绑定具体云厂商。
   */
  storage?: FederationStorage;
}
