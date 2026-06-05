/**
 * Town Agent SDK 发布路由。
 *
 * 关键点（中文）
 * - Town 对外暴露 HTTP SDK 面，Agent 只作为内部 RPC 服务被调用。
 * - 路由保持 RemoteAgent HTTP transport 的既有路径：`/agents/:agentId/api/sdk/...`。
 * - 本模块只做协议转换，不引入 Town SDK 包，也不实现第二套 session 编排器。
 */
import { Hono } from "hono";
import type { AgentRpcPool } from "../AgentRpcPool.js";
/**
 * Town Agent SDK 发布路由依赖。
 */
export interface AgentSdkPublishRouteHandlers {
    /** Town 维护的 Agent RPC 连接池。 */
    agentRpcPool: AgentRpcPool;
}
/**
 * Town Agent SDK 发布路由运行时句柄。
 */
export interface AgentSdkPublishRoutesRuntime {
    /**
     * 关闭当前发布路由缓存的 RPC 连接。
     */
    close(): Promise<void>;
}
/**
 * 注册 Town 对外发布的 Agent SDK HTTP 路由。
 */
export declare function registerAgentSdkPublishRoutes(params: {
    app: Hono;
    handlers: AgentSdkPublishRouteHandlers;
}): AgentSdkPublishRoutesRuntime;
//# sourceMappingURL=AgentSdkPublishRoutes.d.ts.map