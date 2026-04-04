/**
 * Dashboard API 路由聚合入口。
 *
 * 关键点（中文）
 * - 本文件只做模块装配，不再承载具体业务逻辑。
 * - dashboard 子路由按 overview/context@/main/city/model/task/auth 五类拆分，便于继续维护。
 */

import type { DashboardRouteRegistrationParams } from "@/shared/types/DashboardRoutes.js";
import { registerDashboardAuthorizationRoutes } from "@/main/modules/http/dashboard/DashboardAuthorizationRoutes.js";
import { registerDashboardSessionRoutes } from "@/main/modules/http/dashboard/SessionRoutes.js";
import { registerDashboardModelRoutes } from "@/main/modules/http/dashboard/ModelRoutes.js";
import { registerDashboardOverviewRoutes } from "@/main/modules/http/dashboard/OverviewRoutes.js";
import { registerDashboardTaskRoutes } from "@/main/modules/http/dashboard/TaskRoutes.js";

/**
 * 注册 dashboard 数据面路由。
 */
export function registerDashboardApiRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  registerDashboardAuthorizationRoutes({
    app: params.app,
    getExecutionContext: params.getExecutionContext,
  });
  registerDashboardOverviewRoutes(params);
  registerDashboardSessionRoutes(params);
  registerDashboardModelRoutes(params);
  registerDashboardTaskRoutes(params);
}
