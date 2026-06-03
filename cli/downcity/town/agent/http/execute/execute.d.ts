/**
 * 执行入口路由模块。
 *
 * 职责说明：
 * 1. 接收 `/api/execute` 请求。
 * 2. 完成请求解析、context 注入、agent 执行与结果回写。
 * 3. 统一处理接口层错误返回。
 */
import { Hono } from "hono";
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
/**
 * 执行入口路由参数。
 */
type ExecuteRouterOptions = {
    /**
     * 读取当前 agent runtime。
     */
    getAgentRuntime: () => AgentRuntime;
};
/**
 * 创建执行入口路由。
 */
export declare function createExecuteRouter(options: ExecuteRouterOptions): Hono;
export {};
//# sourceMappingURL=execute.d.ts.map