/**
 * 单 agent control API 会话路由。
 *
 * 关键点（中文）
 * - 聚合控制面会话消息、归档、system prompt 与执行相关接口。
 * - 仅负责编排请求与响应；消息读取、时间线映射、执行拼装复用 helper。
 * - 会话控制接口统一暴露在 `/api/control/*` 下。
 */
import type { ControlRouteRegistrationParams } from "./types/ControlRoutes.js";
/**
 * 注册上下文相关路由。
 */
export declare function registerControlSessionRoutes(params: ControlRouteRegistrationParams): void;
//# sourceMappingURL=SessionRoutes.d.ts.map