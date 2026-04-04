/**
 * 统一账户路由策略与全局守卫。
 *
 * 关键点（中文）
 * - 这里负责把“哪些接口需要登录、需要什么权限”集中配置。
 * - 当系统还没有任何统一账户用户时，受保护接口默认放行，避免首次 bootstrap 被锁死。
 */

import type { MiddlewareHandler } from "hono";
import type { AuthRoutePolicy } from "@/shared/types/auth/AuthRoute.js";
import type { AuthPermissionKey } from "@/shared/types/auth/AuthPermission.js";
import { isAuthError as isAuthDomainError } from "./AuthError.js";
import type { AuthService } from "./AuthService.js";
import { AUTH_PRINCIPAL_CONTEXT_KEY, type AuthMiddlewareVariables } from "./AuthMiddleware.js";

/**
 * Server 侧路由权限矩阵。
 */
export const SERVER_AUTH_ROUTE_POLICIES: AuthRoutePolicy[] = [
  { path: "/api/auth/*", method: "*", requireAuth: false },
  { path: "/health", method: "GET", requireAuth: false },
  {
    path: "/api/execute",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["agent.execute"],
  },
  {
    path: "/api/services/list",
    method: "GET",
    requireAuth: true,
    anyPermissions: ["service.read"],
  },
  {
    path: "/api/services/control",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["service.write"],
  },
  {
    path: "/api/services/command",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["service.write"],
  },
  {
    path: "/api/plugins/list",
    method: "GET",
    requireAuth: true,
    anyPermissions: ["plugin.read"],
  },
  {
    path: "/api/plugins/availability",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["plugin.read"],
  },
  {
    path: "/api/plugins/action",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["plugin.write"],
  },
  {
    path: "/api/dashboard/authorization",
    method: "GET",
    requireAuth: true,
    anyPermissions: ["auth.read"],
  },
  {
    path: "/api/dashboard/authorization/config",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["auth.write"],
  },
  {
    path: "/api/dashboard/authorization/action",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["auth.write"],
  },
  {
    path: "/api/dashboard/*",
    method: "*",
    requireAuth: true,
  },
];

/**
 * Console UI 网关侧路由权限矩阵。
 */
export const CONSOLE_UI_AUTH_ROUTE_POLICIES: AuthRoutePolicy[] = [
  { path: "/api/auth/*", method: "*", requireAuth: false },
  { path: "/health", method: "GET", requireAuth: false },
  {
    path: "/api/ui/agents",
    method: "GET",
    requireAuth: true,
    anyPermissions: ["agent.read"],
  },
  {
    path: "/api/ui/agents/create",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["agent.write"],
  },
  {
    path: "/api/ui/agents/start",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["agent.write"],
  },
  {
    path: "/api/ui/agents/restart",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["agent.write"],
  },
  {
    path: "/api/ui/agents/stop",
    method: "POST",
    requireAuth: true,
    anyPermissions: ["agent.write"],
  },
  {
    path: "/api/ui/model*",
    method: "*",
    requireAuth: true,
    anyPermissions: ["model.read"],
  },
  {
    path: "/api/ui/env*",
    method: "*",
    requireAuth: true,
    anyPermissions: ["env.read"],
  },
  {
    path: "/api/ui/channel*",
    method: "*",
    requireAuth: true,
    anyPermissions: ["channel.read"],
  },
  {
    path: "/api/ui/plugins*",
    method: "*",
    requireAuth: true,
    anyPermissions: ["plugin.read"],
  },
  {
    path: "/api/ui/*",
    method: "*",
    requireAuth: true,
  },
];

/**
 * 根据路径与方法解析匹配的策略。
 */
export function resolveAuthRoutePolicy(
  path: string,
  method: string,
  policies: AuthRoutePolicy[],
): AuthRoutePolicy | null {
  const normalizedPath = String(path || "").trim() || "/";
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  for (const policy of policies) {
    if (!matchesMethod(policy.method, normalizedMethod)) continue;
    if (!matchesPath(policy.path, normalizedPath)) continue;
    return policy;
  }
  return null;
}

/**
 * 创建全局路由鉴权中间件。
 */
export function createRouteAuthGuardMiddleware(
  authService: AuthService,
  policies: AuthRoutePolicy[] = SERVER_AUTH_ROUTE_POLICIES,
): MiddlewareHandler<{ Variables: AuthMiddlewareVariables }> {
  return async (c, next) => {
    const policy = resolveAuthRoutePolicy(c.req.path, c.req.method, policies);
    if (!policy || policy.requireAuth !== true) {
      await next();
      return;
    }
    if (!authService.hasUsers()) {
      await next();
      return;
    }
    try {
      const principal = authService.authenticateBearerHeader(
        c.req.header("authorization"),
      );
      ensurePermissions(principal.permissions, policy.anyPermissions);
      c.set(AUTH_PRINCIPAL_CONTEXT_KEY, principal);
      await next();
    } catch (error) {
      if (isRouteGuardError(error)) {
        return c.json(
          { success: false, error: error.message },
          error.status as 200,
        );
      }
      return c.json({ success: false, error: String(error) }, 500);
    }
  };
}

function matchesMethod(expectedMethod: string, actualMethod: string): boolean {
  const expected = String(expectedMethod || "*").trim().toUpperCase();
  return expected === "*" || expected === actualMethod;
}

function matchesPath(patternInput: string, actualPath: string): boolean {
  const pattern = String(patternInput || "").trim();
  if (!pattern) return false;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return actualPath.startsWith(prefix);
  }
  return actualPath === pattern;
}

function ensurePermissions(
  userPermissions: AuthPermissionKey[],
  anyPermissions: AuthRoutePolicy["anyPermissions"],
): void {
  if (!anyPermissions || anyPermissions.length === 0) return;
  if (anyPermissions.some((permission) => userPermissions.includes(permission))) return;
  throw new ErrorWithStatus("Permission denied", 403);
}

class ErrorWithStatus extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthPermissionError";
    this.status = status;
  }
}

function isAuthErrorLike(error: unknown): error is { message: string; status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

function isRouteGuardError(error: unknown): error is { message: string; status: number } {
  return isAuthDomainError(error) || isAuthErrorLike(error);
}
