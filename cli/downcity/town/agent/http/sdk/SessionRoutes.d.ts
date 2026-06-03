/**
 * SDK HTTP session 路由。
 *
 * 关键点（中文）
 * - 这组路由面向 `RemoteAgent`，只暴露最小 Session actor 使用面。
 * - 当前公开输入收口到 `prompt()`，公开输出收口到 `events` 长连接。
 * - 不复用 control API 的控制台语义，避免 transport 面混入非 SDK 约束。
 */
import { Hono } from "hono";
import type { AgentSessionCollection } from "@downcity/agent/internal/types/agent/AgentTypes.js";
/**
 * 注册 SDK session 路由。
 */
export declare function registerSdkSessionRoutes(app: Hono, sessionCollection: AgentSessionCollection): void;
//# sourceMappingURL=SessionRoutes.d.ts.map