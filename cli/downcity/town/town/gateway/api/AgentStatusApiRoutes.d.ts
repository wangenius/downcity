/**
 * 平台 Agent 状态探活路由。
 *
 * 关键点（中文）
 * - 启动窗口期的 agent 状态探测放到 UI 网关内部执行，避免浏览器直接看到 500/503 噪音。
 * - 该接口始终返回 200 + 结构化状态，前端按状态轮询即可。
 * - ready 判定收敛在这里，保持前端逻辑尽量薄。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";
/**
 * 注册 Agent 状态探活 API 路由。
 */
export declare function registerPlatformAgentStatusRoutes(params: {
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
    /** Town 维护的 Agent RPC 连接池。 */
    agentRpcPool: AgentRpcPool;
}): void;
//# sourceMappingURL=AgentStatusApiRoutes.d.ts.map