/**
 * Agent Control API 路由聚合入口。
 *
 * 关键点（中文）
 * - 本文件只做模块装配，不再承载具体业务逻辑。
 * - 单 agent control API 子路由按 overview/session/model/task/auth 五类拆分，便于继续维护。
 * - 单 agent control API 统一暴露在 `/api/control/*` 下。
 */

import type { ControlRouteRegistrationParams } from "@/runtime/server/http/control/types/ControlRoutes.js";
import { registerControlAuthorizationRoutes } from "@/runtime/server/http/control/ControlAuthorizationRoutes.js";
import { registerControlSessionRoutes } from "@/runtime/server/http/control/SessionRoutes.js";
import { registerControlModelRoutes } from "@/runtime/server/http/control/ModelRoutes.js";
import { registerControlOverviewRoutes } from "@/runtime/server/http/control/OverviewRoutes.js";
import { registerControlTaskRoutes } from "@/runtime/server/http/control/TaskRoutes.js";

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
  registerControlModelRoutes(params);
  registerControlTaskRoutes(params);
}
