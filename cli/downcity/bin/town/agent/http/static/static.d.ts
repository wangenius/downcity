/**
 * 静态资源路由模块。
 *
 * 职责说明：
 * 1. 提供根目录前端静态文件访问。
 * 2. 提供 `.downcity/public` 的受限文件暴露。
 * 3. 只处理静态资源协议，不承载业务逻辑。
 */
import { Hono } from "hono";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
/**
 * 静态资源路由参数。
 */
type StaticRouterOptions = {
    /**
     * 读取当前 agent runtime。
     */
    getAgentContext: () => AgentContext;
};
/**
 * 创建静态资源路由。
 */
export declare function createStaticRouter(options: StaticRouterOptions): Hono;
export {};
//# sourceMappingURL=static.d.ts.map