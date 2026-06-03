/**
 * Plugin 路由模块。
 *
 * 职责说明：
 * 1. 提供 plugin catalog / state / availability 接口。
 * 2. 提供 plugin lifecycle 控制接口。
 * 3. 提供 plugin command / action 桥接接口。
 */
import { Hono } from "hono";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
/**
 * Plugin 路由参数。
 */
type PluginsRouterOptions = {
    /**
     * 读取当前 agent 执行上下文。
     */
    getAgentContext: () => AgentContext;
};
/**
 * 创建 plugin 路由。
 */
export declare function createPluginsRouter(options: PluginsRouterOptions): Hono;
export {};
//# sourceMappingURL=plugins.d.ts.map