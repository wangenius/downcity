/**
 * Console dashboard runtime 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 services / authorization / workboard 路径。
 * - 所有运行态访问统一走 Town 维护的 Agent RPC，不再代理到 Agent HTTP。
 * - 这里只做旧路径到 plugin/RPC 能力的协议适配，不重新引入 service 编排层。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "../control/gateway/AgentRpcPool.js";
/**
 * Dashboard runtime 路由参数。
 */
export interface DashboardRuntimeApiRouteParams {
    /** Hono 应用实例。 */
    app: Hono;
    /** 从请求中读取目标 agent id。 */
    readRequestedAgentId(request: Request): string;
    /** 解析当前应使用的 agent。 */
    resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
    /** Town 维护的 Agent RPC 连接池。 */
    agentRpcPool: AgentRpcPool;
}
/**
 * 注册 dashboard runtime 旧路径。
 */
export declare function registerDashboardRuntimeApiRoutes(params: DashboardRuntimeApiRouteParams): void;
//# sourceMappingURL=DashboardRuntimeApiRoutes.d.ts.map