/**
 * Agent Control API 路由聚合入口。
 *
 * 关键点（中文）
 * - 本文件只做模块装配，不再承载具体业务逻辑。
 * - 单 agent control API 子路由按 overview/session/task/auth 四类拆分，便于继续维护。
 * - 单 agent control API 统一暴露在 `/api/control/*` 下。
 */

import type { ControlRouteRegistrationParams } from "./types/ControlRoutes.js";
import { registerControlAuthorizationRoutes } from "./ControlAuthorizationRoutes.js";
import { registerControlSessionRoutes } from "./SessionRoutes.js";
import { registerControlOverviewRoutes } from "./OverviewRoutes.js";
import { registerControlTaskRoutes } from "./TaskRoutes.js";

/**
 * 注册单 agent control API 路由。
 */
export function registerControlApiRoutes(
  params: ControlRouteRegistrationParams,
): void {
  registerControlAuthorizationRoutes({
    app: params.app,
    getAgentContext: params.getAgentContext,
  });
  registerControlOverviewRoutes(params);
  registerControlSessionRoutes(params);
  registerControlTaskRoutes(params);
}
