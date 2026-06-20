/**
 * Control 任务与日志路由。
 *
 * 关键点（中文）
 * - 聚合 tasks/runs/logs 相关接口。
 * - 任务动作统一复用 task plugin runtime command，不在 UI 层重复实现业务语义。
 */
import type { ControlRouteRegistrationParams } from "../../../../city/agent/http/control/types/ControlRoutes.js";
/**
 * 注册任务与日志路由。
 */
export declare function registerControlTaskRoutes(params: ControlRouteRegistrationParams): void;
//# sourceMappingURL=TaskRoutes.d.ts.map