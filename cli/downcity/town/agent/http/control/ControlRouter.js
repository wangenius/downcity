/**
 * Agent Control API 路由入口模块。
 *
 * 职责说明：
 * 1. 为单 agent control API 暴露独立 router。
 * 2. 将控制域的 API 装配收敛在 `server/http/control/` 下。
 * 3. server 只负责挂载该 router，不再持有控制面细节。
 *
 * 命名说明（中文）
 * - 这里的 control 指“单 agent 控制域”。
 * - 它不是 city 的 gateway / control plane。
 * - 当前公开路径统一使用 `/api/control/*`。
 */
import { Hono } from "hono";
import { registerControlApiRoutes } from "../../../agent/http/control/ControlApiRoutes.js";
/**
 * 创建单 agent control API 专用路由。
 */
export function createControlRouter(options) {
    const router = new Hono();
    registerControlApiRoutes({
        app: router,
        getAgentRuntime: options.getAgentRuntime,
        getAgentContext: options.getAgentContext,
    });
    return router;
}
//# sourceMappingURL=ControlRouter.js.map