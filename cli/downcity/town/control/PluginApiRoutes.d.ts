/**
 * 平台 Plugin 路由。
 *
 * 关键点（中文）
 * - 平台控制面的 plugin 面板首先展示“已注册的内建 plugin 清单”，不应因为 agent 短暂不可用而整块消失。
 * - 当目标 agent 可访问时，再叠加 plugin list + availability，补齐启用态、依赖缺失等动态信息。
 * - 这样能同时满足“架构上 plugin 属于 main/package 注册信息”和“可用性属于 agent 状态”两层语义。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "../control/gateway/AgentRpcPool.js";
/**
 * Plugin 管理 API 路由参数。
 */
export interface PlatformPluginRouteParams {
    /**
     * Hono 应用实例。
     */
    app: Hono;
    /**
     * 从请求中读取目标 agent id。
     */
    readRequestedAgentId: (request: Request) => string;
    /**
     * 解析当前应使用的 agent。
     */
    resolveSelectedAgent: (requestedAgentId: string) => Promise<PlatformAgentOption | null>;
    /**
     * Town 维护的 Agent RPC 连接池。
     */
    agentRpcPool: AgentRpcPool;
}
/**
 * 注册 Plugin 管理 API 路由。
 */
export declare function registerPlatformPluginRoutes(params: PlatformPluginRouteParams): void;
//# sourceMappingURL=PluginApiRoutes.d.ts.map