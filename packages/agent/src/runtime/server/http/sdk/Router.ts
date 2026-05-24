/**
 * SDK HTTP 路由入口模块。
 *
 * 关键点（中文）
 * - 这里专门承载 `RemoteAgent` 对应的最小 SDK transport。
 * - 路由面围绕 Session actor 公开能力展开，不混入 control UI 语义。
 */

import { Hono } from "hono";
import type { AgentCore } from "@/core/AgentCore.js";
import { registerSdkSessionRoutes } from "@/runtime/server/http/sdk/SessionRoutes.js";

/**
 * 创建 SDK HTTP router。
 */
export function createSdkRouter(
  core: Pick<AgentCore, "session" | "sessions">,
): Hono {
  const router = new Hono();
  registerSdkSessionRoutes(router, core);
  return router;
}
