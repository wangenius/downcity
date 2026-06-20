/**
 * 统一账户路由策略与全局守卫。
 *
 * 关键点（中文）
 * - 这里负责把“哪些接口需要登录、需要什么权限”集中配置。
 * - 当系统还没有任何统一账户用户时，受保护接口默认放行，避免首次 bootstrap 被锁死。
 */
import type { MiddlewareHandler } from "hono";
import type { AuthRoutePolicy } from "@downcity/agent";
import type { AuthService } from "../../../city/runtime/auth/AuthService.js";
import { type AuthMiddlewareVariables } from "../../../city/runtime/auth/AuthMiddleware.js";
/**
 * Server 侧路由权限矩阵。
 */
export declare const SERVER_AUTH_ROUTE_POLICIES: AuthRoutePolicy[];
/**
 * 控制面网关侧路由权限矩阵。
 */
export declare const GATEWAY_AUTH_ROUTE_POLICIES: AuthRoutePolicy[];
/**
 * 根据路径与方法解析匹配的策略。
 */
export declare function resolveAuthRoutePolicy(path: string, method: string, policies: AuthRoutePolicy[]): AuthRoutePolicy | null;
/**
 * 创建全局路由鉴权中间件。
 */
export declare function createRouteAuthGuardMiddleware(authService: AuthService, policies?: AuthRoutePolicy[]): MiddlewareHandler<{
    Variables: AuthMiddlewareVariables;
}>;
//# sourceMappingURL=RoutePolicy.d.ts.map