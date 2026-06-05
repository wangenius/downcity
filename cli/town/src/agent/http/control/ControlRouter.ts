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
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import { registerControlApiRoutes } from "./ControlApiRoutes.js";

/**
 * control router 参数。
 */
type ControlRouterOptions = {
  /**
   * 读取当前 agent runtime。
   */
  getAgentRuntime: () => AgentRuntime;
  /**
   * 读取当前 agent 执行上下文。
   */
  getAgentContext: () => AgentContext;
};

/**
 * 创建单 agent control API 专用路由。
 */
export function createControlRouter(
  options: ControlRouterOptions,
): Hono {
  const router = new Hono();
  registerControlApiRoutes({
    app: router,
    getAgentRuntime: options.getAgentRuntime,
    getAgentContext: options.getAgentContext,
  });
  return router;
}
