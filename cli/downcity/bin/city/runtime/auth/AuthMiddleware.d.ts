/**
 * Auth 中间件。
 *
 * 关键点（中文）
 * - 当前先服务 `/api/auth/*` 的受保护子路由。
 * - 后续把更多控制面路由切到 Bearer 鉴权时，可直接复用这一层。
 */
import type { Context, MiddlewareHandler } from "hono";
import type { AuthPrincipal } from "@downcity/agent";
import type { AuthService } from "../../../city/runtime/auth/AuthService.js";
/**
 * Hono Context 中保存 principal 的 key。
 */
export declare const AUTH_PRINCIPAL_CONTEXT_KEY = "authPrincipal";
/**
 * Auth 中间件变量映射。
 */
export interface AuthMiddlewareVariables {
    /**
     * 当前请求的认证主体。
     */
    authPrincipal: AuthPrincipal;
}
/**
 * 生成 Bearer 鉴权中间件。
 */
export declare function createRequireAuthMiddleware(authService: AuthService): MiddlewareHandler<{
    Variables: AuthMiddlewareVariables;
}>;
/**
 * 从 Context 中读取 principal。
 */
export declare function getAuthPrincipal(context: Context<{
    Variables: AuthMiddlewareVariables;
}>): AuthPrincipal;
//# sourceMappingURL=AuthMiddleware.d.ts.map