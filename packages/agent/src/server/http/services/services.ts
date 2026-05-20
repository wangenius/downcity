/**
 * Service 路由模块。
 *
 * 职责说明：
 * 1. 提供 service 状态列表接口。
 * 2. 提供 service lifecycle 控制接口。
 * 3. 提供统一 service command 桥接。
 */

import { Hono } from "hono";
import {
  controlServiceState,
  listServiceStates,
  runServiceCommand,
} from "@/service/core/Manager.js";
import type { ServiceStateControlAction } from "@/service/core/Manager.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import { parseServiceCommandRequestBody } from "@/service/core/ServiceCommandRequest.js";

/**
 * Service 路由参数。
 */
type ServicesRouterOptions = {
  /**
   * 读取当前 agent 执行上下文。
   */
  getAgentContext: () => AgentContext;
};

/**
 * 创建 service 路由。
 */
export function createServicesRouter(
  options: ServicesRouterOptions,
): Hono {
  const router = new Hono();

  router.get("/api/services/list", (c) => {
    const context = options.getAgentContext();
    return c.json({
      success: true,
      services: listServiceStates({ context }),
    });
  });

  router.post("/api/services/control", async (c) => {
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
      context: options.getAgentContext(),
    });
    return c.json(result, result.success ? 200 : 400);
  });

  router.post("/api/services/command", async (c) => {
    const body = await c.req.json().catch(() => null);
    let requestBody;
    try {
      requestBody = parseServiceCommandRequestBody(body);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 400);
    }

    if (!requestBody.serviceName) {
      return c.json({ success: false, error: "serviceName is required" }, 400);
    }
    if (!requestBody.command) {
      return c.json({ success: false, error: "command is required" }, 400);
    }

    const result = await runServiceCommand({
      serviceName: requestBody.serviceName,
      command: requestBody.command,
      payload: requestBody.payload,
      schedule: requestBody.schedule,
      context: options.getAgentContext(),
    });
    return c.json(result, result.success ? 200 : 400);
  });

  return router;
}
