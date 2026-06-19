/**
 * Agent Control Authorization 路由。
 *
 * 关键点（中文）
 * - 单独承接 `/api/control/authorization*`。
 * - City 只做 HTTP 适配，具体授权数据读写统一交给 chat plugin access action。
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