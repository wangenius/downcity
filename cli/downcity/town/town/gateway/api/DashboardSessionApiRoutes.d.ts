/**
 * Console dashboard session 读侧路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 session 列表与消息时间线读接口。
 * - 读写运行态信息时直接复用 Agent RPC 的 SDK / internal session 能力。
 * - 不再经由 Agent HTTP control API，避免 Agent 进程必须额外暴露 HTTP。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";
/**
 * Dashboard session 路由参数。
 */
export interface DashboardSessionApiRouteParams {
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
 * 注册 dashboard session 读侧路由。
 */
export declare function registerDashboardSessionApiRoutes(params: DashboardSessionApiRouteParams): void;
//# sourceMappingURL=DashboardSessionApiRoutes.d.ts.map