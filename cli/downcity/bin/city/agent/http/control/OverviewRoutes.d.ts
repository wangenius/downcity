/**
 * Control 概览路由。
 *
 * 关键点（中文）
 * - 聚合 overview 与 plugin 运行态两块轻量只读接口。
 * - 只负责路由层拼装，不承载复杂业务状态机。
 */
import type { ControlRouteRegistrationParams } from "./types/ControlRoutes.js";
/**
 * 注册概览与运行态 plugin 路由。
 */
export declare function registerControlOverviewRoutes(params: ControlRouteRegistrationParams): void;
//# sourceMappingURL=OverviewRoutes.d.ts.map