/**
 * Dashboard / WebUI 路由入口模块。
 *
 * 职责说明：
 * 1. 为内置 Dashboard / WebUI 暴露独立 router。
 * 2. 将 UI 域的 API 装配收敛在 `city/modules/http/dashboard/` 下。
 * 3. server 只负责挂载该 router，不再持有 Dashboard 细节。
 */

import { Hono } from "hono";
import {
  getAgentState,
  getExecutionContext,
} from "@/main/agent/AgentState.js";
import { registerDashboardApiRoutes } from "@/main/modules/http/dashboard/DashboardApiRoutes.js";

/**
 * Dashboard / WebUI 专用路由。
 */
export const dashboardRouter = new Hono();

registerDashboardApiRoutes({
  app: dashboardRouter,
  getAgentState: getAgentState,
  getExecutionContext: getExecutionContext,
});
