/**
 * TUI / WebUI 路由入口模块。
 *
 * 职责说明：
 * 1. 为内置 TUI / WebUI 暴露独立 router。
 * 2. 将 UI 域的 API 装配收敛在 `ui/tui/` 下。
 * 3. server 只负责挂载该 router，不再持有 TUI 细节。
 */

import { Hono } from "hono";
import {
  getRuntimeState,
  getServiceRuntimeState,
} from "@/main/context/manager/RuntimeState.js";
import { registerTuiApiRoutes } from "@/main/ui/TuiApi.js";

/**
 * TUI / WebUI 专用路由。
 */
export const tuiRouter = new Hono();

registerTuiApiRoutes({
  app: tuiRouter,
  getRuntimeState,
  getServiceRuntimeState,
});
