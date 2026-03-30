/**
 * Plugin 路由模块。
 *
 * 职责说明：
 * 1. 提供 plugin 列表接口。
 * 2. 提供 plugin 可用性检查接口。
 * 3. 提供 plugin action 桥接接口。
 */

import { Hono } from "hono";
import { getExecutionRuntime } from "@agent/AgentRuntime.js";

/**
 * Plugin 路由。
 */
export const pluginsRouter = new Hono();

pluginsRouter.get("/api/plugins/list", (c) => {
  return c.json({
    success: true,
    plugins: getExecutionRuntime().plugins.list(),
  });
});

pluginsRouter.post("/api/plugins/availability", async (c) => {
  const body = await c.req.json().catch(() => null);
  const pluginName = String(body?.pluginName || "").trim();

  if (!pluginName) {
    return c.json({ success: false, error: "pluginName is required" }, 400);
  }

  const availability =
    await getExecutionRuntime().plugins.availability(pluginName);
  return c.json({
    success: true,
    pluginName,
    availability,
  });
});

pluginsRouter.post("/api/plugins/action", async (c) => {
  const body = await c.req.json().catch(() => null);
  const pluginName = String(body?.pluginName || "").trim();
  const actionName = String(body?.actionName || "").trim();

  if (!pluginName) {
    return c.json({ success: false, error: "pluginName is required" }, 400);
  }
  if (!actionName) {
    return c.json({ success: false, error: "actionName is required" }, 400);
  }

  const result = await getExecutionRuntime().plugins.runAction({
    plugin: pluginName,
    action: actionName,
    payload: body?.payload,
  });
  return c.json(
    {
      ...result,
      pluginName,
      actionName,
    },
    result.success ? 200 : 400,
  );
});
