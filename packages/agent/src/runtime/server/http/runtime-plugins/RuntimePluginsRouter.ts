/**
 * Runtime plugin 路由模块。
 *
 * 职责说明：
 * 1. 提供 runtime plugin 状态列表接口。
 * 2. 提供 runtime plugin lifecycle 控制接口。
 * 3. 提供统一 runtime plugin command 桥接。
 */

import { Hono } from "hono";
import {
  controlPluginState,
  listPluginStates,
  runPluginCommand,
} from "@/plugin/core/Manager.js";
import type { PluginStateControlAction } from "@/plugin/core/Manager.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import { parsePluginCommandRequestBody } from "@/plugin/core/PluginCommandRequest.js";

/**
 * Runtime plugin 路由参数。
 */
type RuntimePluginRouterOptions = {
  /**
   * 读取当前 agent 执行上下文。
   */
  getAgentContext: () => AgentContext;
};

/**
 * 创建 runtime plugin 路由。
 */
export function createRuntimePluginsRouter(
  options: RuntimePluginRouterOptions,
): Hono {
  const router = new Hono();
  const listPaths = ["/api/plugins/runtime/list"];
  const controlPaths = ["/api/plugins/runtime/control"];
  const commandPaths = ["/api/plugins/runtime/command"];

  for (const routePath of listPaths) {
    router.get(routePath, (c) => {
      const context = options.getAgentContext();
      const plugins = listPluginStates({ context });
      return c.json({
        success: true,
        plugins,
      });
    });
  }

  for (const routePath of controlPaths) {
    router.post(routePath, async (c) => {
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
      return c.json(
        result,
        result.success ? 200 : 400,
      );
    });
  }

  for (const routePath of commandPaths) {
    router.post(routePath, async (c) => {
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
      return c.json(
        result,
        result.success ? 200 : 400,
      );
    });
  }

  return router;
}
