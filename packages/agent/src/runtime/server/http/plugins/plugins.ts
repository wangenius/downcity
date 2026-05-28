/**
 * Plugin 路由模块。
 *
 * 职责说明：
 * 1. 提供 plugin catalog / state / availability 接口。
 * 2. 提供 plugin lifecycle 控制接口。
 * 3. 提供 plugin command / action 桥接接口。
 */

import { Hono } from "hono";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import {
  controlPluginState,
  listPluginStates,
} from "@/plugin/core/PluginStateController.js";
import type { PluginStateControlAction } from "@/plugin/types/Plugin.js";
import { parsePluginCommandRequestBody } from "@/plugin/core/PluginCommandRequest.js";
import { runPluginCommand } from "@/plugin/core/PluginActionRunner.js";

/**
 * Plugin 路由参数。
 */
type PluginsRouterOptions = {
  /**
   * 读取当前 agent 执行上下文。
   */
  getAgentContext: () => AgentContext;
};

/**
 * 创建 plugin 路由。
 */
export function createPluginsRouter(
  options: PluginsRouterOptions,
): Hono {
  const router = new Hono();

  router.get("/api/plugins/catalog", (c) => {
    return c.json({
      success: true,
      plugins: options.getAgentContext().plugins.list(),
    });
  });

  router.get("/api/plugins/list", (c) => {
    return c.json({
      success: true,
      plugins: listPluginStates({
        context: options.getAgentContext(),
      }),
    });
  });

  router.post("/api/plugins/control", async (c) => {
    const body = await c.req.json().catch(() => null);
    const pluginName = String(body?.pluginName || "").trim();
    const action = String(body?.action || "")
      .trim()
      .toLowerCase();

    if (!pluginName) {
      return c.json({ success: false, error: "pluginName is required" }, 400);
    }
    if (!action) {
      return c.json({ success: false, error: "action is required" }, 400);
    }
    if (!["start", "stop", "restart", "status"].includes(action)) {
      return c.json({ success: false, error: "invalid action" }, 400);
    }

    const result = await controlPluginState({
      pluginName,
      action: action as PluginStateControlAction,
      context: options.getAgentContext(),
    });
    return c.json(result, result.success ? 200 : 400);
  });

  router.post("/api/plugins/command", async (c) => {
    const body = await c.req.json().catch(() => null);
    let requestBody;
    try {
      requestBody = parsePluginCommandRequestBody(body);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 400);
    }

    if (!requestBody.pluginName) {
      return c.json({ success: false, error: "pluginName is required" }, 400);
    }
    if (!requestBody.command) {
      return c.json({ success: false, error: "command is required" }, 400);
    }

    const result = await runPluginCommand({
      pluginName: requestBody.pluginName,
      command: requestBody.command,
      payload: requestBody.payload,
      schedule: requestBody.schedule,
      context: options.getAgentContext(),
    });
    return c.json(result, result.success ? 200 : 400);
  });

  router.post("/api/plugins/availability", async (c) => {
    const body = await c.req.json().catch(() => null);
    const pluginName = String(body?.pluginName || "").trim();

    if (!pluginName) {
      return c.json({ success: false, error: "pluginName is required" }, 400);
    }

    const availability =
      await options.getAgentContext().plugins.availability(pluginName);
    return c.json({
      success: true,
      pluginName,
      availability,
    });
  });

  router.post("/api/plugins/action", async (c) => {
    const body = await c.req.json().catch(() => null);
    const pluginName = String(body?.pluginName || "").trim();
    const actionName = String(body?.actionName || "").trim();

    if (!pluginName) {
      return c.json({ success: false, error: "pluginName is required" }, 400);
    }
    if (!actionName) {
      return c.json({ success: false, error: "actionName is required" }, 400);
    }

    const result = await options.getAgentContext().plugins.runAction({
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

  return router;
}
