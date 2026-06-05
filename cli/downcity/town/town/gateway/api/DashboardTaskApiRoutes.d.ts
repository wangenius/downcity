/**
 * Console dashboard task/logs 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 `/api/dashboard/tasks*` 与 `/api/dashboard/logs` 路径。
 * - 业务动作通过 Town 维护的 Agent RPC 连接执行，不再经由 Agent HTTP control API。
 * - run/log 详情仍读取 agent 项目本地 `.downcity` 运行目录，保持 UI 数据结构稳定。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "../AgentRpcPool.js";
/**
 * Dashboard task 路由参数。
 */
export interface DashboardTaskApiRouteParams {
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
 * 注册旧 dashboard task/logs 路由。
 */
export declare function registerDashboardTaskApiRoutes(params: DashboardTaskApiRouteParams): void;
//# sourceMappingURL=DashboardTaskApiRoutes.d.ts.map