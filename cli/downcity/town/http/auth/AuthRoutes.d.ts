/**
 * Auth API 路由。
 *
 * 关键点（中文）
 * - 本模块只承接 Bearer Token 模型下的最小认证接口。
 * - 路由层不做领域判断，所有业务逻辑统一委托给 `AuthService`。
 */
import { Hono } from "hono";
import type { AuthService } from "./AuthService.js";
/**
 * 注册 auth 路由。
 */
export declare function registerAuthRoutes(params: {
    app: Hono;
    authService?: AuthService;
}): void;
//# sourceMappingURL=AuthRoutes.d.ts.map