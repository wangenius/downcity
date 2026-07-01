/**
 * Federation 内置 HTTP middleware。
 *
 * 提供生产入口常用的横切安全策略：请求体大小限制、CORS、安全响应头、
 * 请求超时和粗粒度限流。所有 helper 都运行在内部 router 之前。
 */

import type {
  BodyLimitOptions,
  CorsOptions,
  FederationMiddleware,
  RateLimitOptions,
  RateLimitStore,
  RateLimitStoreIncrementResult,
  RequestTimeoutOptions,
  SecurityHeadersOptions,
} from "../types/FederationMiddleware.js";

const DEFAULT_BODY_LIMIT_METHODS = ["POST", "PUT", "PATCH"] as const;
const DEFAULT_CORS_METHODS = ["GET", "POST", "OPTIONS"] as const;
const DEFAULT_CORS_HEADERS = ["Content-Type", "Authorization"] as const;
const DEFAULT_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

/**
 * 在业务路由读取 body 前基于 Content-Length 拒绝过大请求。
 */
export function bodyLimit(options: BodyLimitOptions): FederationMiddleware {
  const methods = new Set((options.methods ?? DEFAULT_BODY_LIMIT_METHODS).map((method) => method.toUpperCase()));
  return (ctx, next) => {
    if (!methods.has(ctx.request.method.toUpperCase())) {
      return next();
    }
    if (!match_path(ctx.request, options.paths)) {
      return next();
    }

    const content_length = ctx.request.headers.get("content-length");
    if (!content_length) {
      return next();
    }

    const size = Number.parseInt(content_length, 10);
    if (Number.isFinite(size) && size > options.max_bytes) {
      return json_error("Request body too large", "request_too_large", 413);
    }

    return next();
  };
}

/**
 * 处理 CORS preflight，并为允许的 Origin 回填 CORS 响应头。
 */
export function cors(options: CorsOptions): FederationMiddleware {
  const methods = options.methods ?? DEFAULT_CORS_METHODS;
  const headers = options.headers ?? DEFAULT_CORS_HEADERS;

  return async (ctx, next) => {
    const origin = ctx.request.headers.get("origin");
    const allowed_origin = resolve_allowed_origin(origin, options.origins);
    if (origin && !allowed_origin && options.strict) {
      return json_error("Origin is not allowed", "origin_forbidden", 403);
    }

    if (ctx.request.method.toUpperCase() === "OPTIONS") {
      const response_headers = new Headers();
      append_cors_headers(response_headers, allowed_origin, methods, headers, options.max_age);
      return new Response(null, { status: 204, headers: response_headers });
    }

    const response = await next();
    if (!allowed_origin) {
      return response;
    }

    const response_headers = new Headers(response.headers);
    append_cors_headers(response_headers, allowed_origin, methods, headers, options.max_age);
    return clone_response_with_headers(response, response_headers);
  };
}

/**
 * 为响应增加基础安全头。
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): FederationMiddleware {
  return async (_ctx, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    if (options.content_type_options !== false) {
      headers.set("X-Content-Type-Options", "nosniff");
    }
    headers.set("Referrer-Policy", options.referrer_policy ?? "no-referrer");
    headers.set("X-Frame-Options", options.frame_options ?? "DENY");
    headers.set("Permissions-Policy", options.permissions_policy ?? DEFAULT_PERMISSIONS_POLICY);

    if (options.strict_transport_security) {
      headers.set("Strict-Transport-Security", options.strict_transport_security);
    }
    if (options.content_security_policy) {
      headers.set("Content-Security-Policy", options.content_security_policy);
    }

    return clone_response_with_headers(response, headers);
  };
}

/**
 * 为普通请求增加总耗时保护。
 *
 * 关键说明（中文）
 * - 这里只能让 HTTP 层返回 504，不能保证取消下游 provider 外呼。
 * - 流式接口建议通过 `exclude_paths` 排除。
 */
export function requestTimeout(options: RequestTimeoutOptions): FederationMiddleware {
  return async (ctx, next) => {
    if (options.exclude_paths && match_path(ctx.request, options.exclude_paths)) {
      return next();
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        next(),
        new Promise<Response>((resolve) => {
          timer = setTimeout(() => {
            resolve(json_error("Request timed out", "request_timeout", 504));
          }, options.ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

/**
 * 基于可插拔 store 的粗粒度限流。
 */
export function rateLimit(options: RateLimitOptions): FederationMiddleware {
  return async (ctx, next) => {
    if (options.match && !await options.match(ctx)) {
      return next();
    }

    const key = await options.key(ctx);
    const result = await options.store.increment(key, options.window_ms);
    const remaining = Math.max(options.max - result.count, 0);

    if (result.count > options.max) {
      const response = json_error("Too many requests", "rate_limited", 429);
      set_rate_limit_headers(response.headers, options.max, remaining, result.reset_at);
      return response;
    }

    const response = await next();
    const headers = new Headers(response.headers);
    set_rate_limit_headers(headers, options.max, remaining, result.reset_at);
    return clone_response_with_headers(response, headers);
  };
}

/**
 * 创建进程内限流 store。
 *
 * 关键说明（中文）
 * - 适合本地开发、Node 单进程或单 isolate 兜底。
 * - 多实例 / 多区域生产限流应使用共享存储或平台能力。
 */
export function memoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, RateLimitStoreIncrementResult>();

  return {
    async increment(key, window_ms) {
      const now = Date.now();
      const current = windows.get(key);
      if (!current || current.reset_at <= now) {
        const next_window = { count: 1, reset_at: now + window_ms };
        windows.set(key, next_window);
        return next_window;
      }

      current.count += 1;
      return current;
    },
  };
}

/**
 * 从常见代理头读取客户端 IP。
 */
export function clientIp(request: Request): string {
  const cf_ip = request.headers.get("cf-connecting-ip");
  if (cf_ip) return cf_ip;

  const forwarded_for = request.headers.get("x-forwarded-for");
  if (forwarded_for) {
    return forwarded_for.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function json_error(message: string, type: string, status: number): Response {
  return Response.json({ error: { message, type } }, { status });
}

function resolve_allowed_origin(origin: string | null, origins: readonly string[] | "*"): string | undefined {
  if (!origin) return undefined;
  if (origins === "*") return "*";
  return origins.includes(origin) ? origin : undefined;
}

function append_cors_headers(
  headers: Headers,
  allowed_origin: string | undefined,
  methods: readonly string[],
  request_headers: readonly string[],
  max_age: number | undefined,
): void {
  if (allowed_origin) {
    headers.set("Access-Control-Allow-Origin", allowed_origin);
    if (allowed_origin !== "*") {
      headers.append("Vary", "Origin");
    }
  }
  headers.set("Access-Control-Allow-Methods", methods.join(", "));
  headers.set("Access-Control-Allow-Headers", request_headers.join(", "));
  if (max_age !== undefined) {
    headers.set("Access-Control-Max-Age", String(max_age));
  }
}

function set_rate_limit_headers(headers: Headers, limit: number, remaining: number, reset_at: number): void {
  const reset_seconds = Math.ceil(reset_at / 1000);
  const retry_after = Math.max(Math.ceil((reset_at - Date.now()) / 1000), 0);
  headers.set("Retry-After", String(retry_after));
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(remaining));
  headers.set("X-RateLimit-Reset", String(reset_seconds));
}

function clone_response_with_headers(response: Response, headers: Headers): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function match_path(request: Request, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }

  const pathname = new URL(request.url).pathname;
  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) {
      return pathname.startsWith(pattern.slice(0, -1));
    }
    return pathname === pattern;
  });
}
