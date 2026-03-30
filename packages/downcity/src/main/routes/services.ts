/**
 * Service 路由模块。
 *
 * 职责说明：
 * 1. 提供 service 状态列表接口。
 * 2. 提供 service lifecycle 控制接口。
 * 3. 提供 service command 桥接，并挂载各 service 自身路由。
 */

import { Hono } from "hono";
import {
  controlServiceState,
  listServiceStates,
  registerAllServicesForServer,
  runServiceCommand,
} from "@/main/service/Manager.js";
import type { ServiceStateControlAction } from "@/main/service/Manager.js";
import { getExecutionContext } from "@agent/AgentState.js";

/**
 * Service 路由。
 */
export const servicesRouter = new Hono();
let serviceActionRoutesRegistered = false;

servicesRouter.get("/api/services/list", (c) => {
  return c.json({
    success: true,
    services: listServiceStates(),
  });
});

servicesRouter.post("/api/services/control", async (c) => {
  const body = await c.req.json().catch(() => null);
  const serviceName = String(body?.serviceName || "").trim();
  const action = String(body?.action || "")
    .trim()
    .toLowerCase();

  if (!serviceName) {
    return c.json({ success: false, error: "serviceName is required" }, 400);
  }
  if (!action) {
    return c.json({ success: false, error: "action is required" }, 400);
  }
  if (!["start", "stop", "restart", "status"].includes(action)) {
    return c.json({ success: false, error: "invalid action" }, 400);
  }

  const result = await controlServiceState({
    serviceName,
    action: action as ServiceStateControlAction,
    context: getExecutionContext(),
  });
  return c.json(result, result.success ? 200 : 400);
});

servicesRouter.post("/api/services/command", async (c) => {
  const body = await c.req.json().catch(() => null);
  const serviceName = String(body?.serviceName || "").trim();
  const command = String(body?.command || "").trim();
  const schedule =
    body?.schedule && typeof body.schedule === "object" && !Array.isArray(body.schedule)
      ? body.schedule
      : undefined;

  if (!serviceName) {
    return c.json({ success: false, error: "serviceName is required" }, 400);
  }
  if (!command) {
    return c.json({ success: false, error: "command is required" }, 400);
  }

  const result = await runServiceCommand({
    serviceName,
    command,
    payload: body?.payload,
    schedule,
    context: getExecutionContext(),
  });
  return c.json(result, result.success ? 200 : 400);
});

/**
 * 确保 service action API 路由只注册一次。
 *
 * 关键点（中文）
 * - 延迟到 server 启动阶段再注册，避免 `city agent create` 等无需执行上下文的命令在 import 时触发初始化错误。
 */
export function ensureServiceActionRoutesRegistered(): void {
  if (serviceActionRoutesRegistered) return;
  registerAllServicesForServer(servicesRouter, getExecutionContext());
  serviceActionRoutesRegistered = true;
}
