/**
 * Console dashboard overview 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 `/api/dashboard/overview` 路径。
 * - 通过 Agent RPC 聚合 session、plugin、task 状态，不再经由 Agent HTTP control API。
 * - logs 仍读取 agent 项目本地 `.downcity` 目录，保持 overview 数据结构稳定。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";
/**
 * Dashboard overview 路由参数。
 */
export interface DashboardOverviewApiRouteParams {
    /**
     * Hono 应用实例。
     */
    app: Hono;
    /**
     * 从请求中读取用户选择的 agent id。
     */
    readRequestedAgentId(request: Request): string;
    /**
     * 解析当前运行中的 agent。
     */
    resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
    /**
     * Town 维护的 Agent RPC 连接池。
     */
    agentRpcPool: AgentRpcPool;
}
/**
 * 注册 dashboard overview 路由。
 */
export declare function registerDashboardOverviewApiRoutes(params: DashboardOverviewApiRouteParams): void;
//# sourceMappingURL=DashboardOverviewApiRoutes.d.ts.map