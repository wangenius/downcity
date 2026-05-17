/**
 * Agent Control API 路由入口模块。
 *
 * 职责说明：
 * 1. 为单 agent control API 暴露独立 router。
 * 2. 将控制域的 API 装配收敛在 `http/control/` 下。
 * 3. server 只负责挂载该 router，不再持有控制面细节。
 *
 * 命名说明（中文）
 * - 这里的 control 指“单 agent 控制域”。
 * - 它不是 city 的 gateway / control plane。
 * - 当前公开路径统一使用 `/api/control/*`。
 */

import { Hono } from "hono";
import {
  getAgentRuntime,
  getAgentContext,
} from "@/agent/AgentRuntime.js";
import { registerControlApiRoutes } from "@/http/control/ControlApiRoutes.js";

/**
 * 单 agent control API 专用路由。
 */
export const controlRouter = new Hono();

registerControlApiRoutes({
  app: controlRouter,
  getAgentRuntime: getAgentRuntime,
  getAgentContext: getAgentContext,
});
