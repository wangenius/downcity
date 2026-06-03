/**
 * Agent Control API 路由聚合入口。
 *
 * 关键点（中文）
 * - 本文件只做模块装配，不再承载具体业务逻辑。
 * - 单 agent control API 子路由按 overview/session/task/auth 四类拆分，便于继续维护。
 * - 单 agent control API 统一暴露在 `/api/control/*` 下。
 */
import type { ControlRouteRegistrationParams } from "../../../agent/http/control/types/ControlRoutes.js";
/**
 * 注册单 agent control API 路由。
 */
export declare function registerControlApiRoutes(params: ControlRouteRegistrationParams): void;
//# sourceMappingURL=ControlApiRoutes.d.ts.map