/**
 * Federation HTTP Middleware 类型模块。
 *
 * 定义 `fed.middle()` 使用的中间件上下文、next 函数以及内置
 * middleware helper 的公开配置类型。该层只处理 HTTP 入站横切策略，
 * 不承载 Service / Action 的业务生命周期逻辑。
 */

import type { Service } from "../service/service.js";
import type { Runtime } from "../federation/runtime.js";
import type { FederationRequestExecutionContext } from "../federation/types.js";

/**
 * Federation middleware 的后续执行函数。
 *
 * 关键说明（中文）
 * - 调用 `next()` 会进入下一个 middleware 或最终的内部 router。
 * - 每个 middleware 中的 `next()` 最多只能调用一次。
 */
export type FederationMiddlewareNext = () => Promise<Response>;

/**
 * Federation HTTP middleware 函数。
 *
 * 关键说明（中文）
 * - 返回 `Response` 可以短路请求。
 * - `await next()` 后可以对响应 headers 做后处理。
 * - middleware 运行在内部 Hono router 之前，因此可在 body 读取前拒绝请求。
 */
export type FederationMiddleware = (
  ctx: FederationMiddlewareContext,
  next: FederationMiddlewareNext,
) => Promise<Response> | Response;

/**
 * 暴露给 middleware 的 Federation 只读引用。
 */
export interface FederationMiddlewareFederationRef {
  /** 返回当前 Federation 已注册的 Service 列表。 */
  services(): readonly Service[];
}

/**
 * Federation middleware 单次请求上下文。
 */
export interface FederationMiddlewareContext {
  /** 当前原始 HTTP 请求。 */
  request: Request;
  /** 宿主运行时的单次请求执行上下文。 */
  execution?: FederationRequestExecutionContext;
  /** 当前 Federation 的运行时能力集合。 */
  runtime: Runtime;
  /** 当前 Federation 的只读能力引用。 */
  federation: FederationMiddlewareFederationRef;
  /** middleware 之间共享的轻量临时上下文。 */
  locals: Record<string, unknown>;
}

/**
 * 请求体大小限制配置。
 */
export interface BodyLimitOptions {
  /** 允许的最大请求体字节数。 */
  max_bytes: number;
  /** 需要检查的 HTTP 方法；默认检查 POST、PUT、PATCH。 */
  methods?: readonly string[];
  /** 需要检查的路径模式；支持精确路径和 `*` 后缀前缀匹配。 */
  paths?: readonly string[];
}

/**
 * CORS middleware 配置。
 */
export interface CorsOptions {
  /** 允许的 Origin 列表；传 `"*"` 表示允许所有 Origin。 */
  origins: readonly string[] | "*";
  /** 允许的 HTTP 方法列表。 */
  methods?: readonly string[];
  /** 允许的请求头列表。 */
  headers?: readonly string[];
  /** preflight 响应的缓存秒数。 */
  max_age?: number;
  /** Origin 不允许时是否直接返回 403。 */
  strict?: boolean;
}

/**
 * 安全响应头配置。
 */
export interface SecurityHeadersOptions {
  /** 是否设置 X-Content-Type-Options，默认 true。 */
  content_type_options?: boolean;
  /** Referrer-Policy 响应头值，默认 no-referrer。 */
  referrer_policy?: string;
  /** X-Frame-Options 响应头值，默认 DENY。 */
  frame_options?: string;
  /** Permissions-Policy 响应头值。 */
  permissions_policy?: string;
  /** Strict-Transport-Security 响应头值；未传入时不设置。 */
  strict_transport_security?: string;
  /** Content-Security-Policy 响应头值；未传入时不设置。 */
  content_security_policy?: string;
}

/**
 * 请求超时配置。
 */
export interface RequestTimeoutOptions {
  /** 请求超时时间，单位毫秒。 */
  ms: number;
  /** 不启用超时保护的路径模式；支持精确路径和 `*` 后缀前缀匹配。 */
  exclude_paths?: readonly string[];
}

/**
 * 限流存储接口。
 */
export interface RateLimitStore {
  /**
   * 增加当前 key 在窗口内的请求次数。
   *
   * @param key - 限流维度 key。
   * @param window_ms - 限流窗口长度，单位毫秒。
   */
  increment(key: string, window_ms: number): Promise<RateLimitStoreIncrementResult>;
}

/**
 * 限流存储增加计数后的结果。
 */
export interface RateLimitStoreIncrementResult {
  /** 当前窗口内已经累计的请求次数。 */
  count: number;
  /** 当前窗口重置的 Unix 时间戳，单位毫秒。 */
  reset_at: number;
}

/**
 * 限流 middleware 配置。
 */
export interface RateLimitOptions {
  /** 限流窗口长度，单位毫秒。 */
  window_ms: number;
  /** 单个窗口允许的最大请求数。 */
  max: number;
  /** 生成限流 key 的函数。 */
  key(ctx: FederationMiddlewareContext): string | Promise<string>;
  /** 判断当前请求是否需要限流的函数。 */
  match?: (ctx: FederationMiddlewareContext) => boolean | Promise<boolean>;
  /** 限流计数存储。 */
  store: RateLimitStore;
}
