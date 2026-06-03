/**
 * Agent Control Authorization 路由。
 *
 * 关键点（中文）
 * - 单独承接 `/api/control/authorization*`。
 * - 授权页面的数据统一通过 auth plugin API 读取与写入。
 */
import type { Hono } from "hono";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
/**
 * 注册 authorization 相关路由。
 */
export declare function registerControlAuthorizationRoutes(params: {
    app: Hono;
    getAgentContext: () => AgentContext;
}): void;
//# sourceMappingURL=ControlAuthorizationRoutes.d.ts.map