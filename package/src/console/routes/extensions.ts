/**
 * Extension 路由模块。
 *
 * 职责说明：
 * 1. 提供 extension runtime 列表接口。
 * 2. 提供 extension lifecycle 控制接口。
 * 3. 提供 extension command 桥接，并挂载各 extension 自身路由。
 */

import { Hono } from "hono";
import {
  controlExtensionRuntime,
  listExtensionRuntimes,
  registerAllExtensionsForServer,
  runExtensionCommand,
} from "@/console/extension/Manager.js";
import type { ExtensionRuntimeControlAction } from "@/console/extension/Manager.js";
import { getServiceRuntimeState } from "@/agent/context/manager/RuntimeState.js";

/**
 * Extension 路由。
 */
export const extensionsRouter = new Hono();
let extensionActionRoutesRegistered = false;

extensionsRouter.get("/api/extensions/list", (c) => {
  return c.json({
    success: true,
    extensions: listExtensionRuntimes(),
  });
});

extensionsRouter.post("/api/extensions/control", async (c) => {
  const body = await c.req.json().catch(() => null);
  const extensionName = String(body?.extensionName || "").trim();
  const action = String(body?.action || "")
    .trim()
    .toLowerCase();

  if (!extensionName) {
    return c.json({ success: false, error: "extensionName is required" }, 400);
  }
  if (!action) {
    return c.json({ success: false, error: "action is required" }, 400);
  }
  if (!["start", "stop", "restart", "status"].includes(action)) {
    return c.json({ success: false, error: "invalid action" }, 400);
  }

  const result = await controlExtensionRuntime({
    extensionName,
    action: action as ExtensionRuntimeControlAction,
    context: getServiceRuntimeState(),
  });
  return c.json(result, result.success ? 200 : 400);
});

extensionsRouter.post("/api/extensions/command", async (c) => {
  const body = await c.req.json().catch(() => null);
  const extensionName = String(body?.extensionName || "").trim();
  const command = String(body?.command || "").trim();

  if (!extensionName) {
    return c.json({ success: false, error: "extensionName is required" }, 400);
  }
  if (!command) {
    return c.json({ success: false, error: "command is required" }, 400);
  }

  const result = await runExtensionCommand({
    extensionName,
    command,
    payload: body?.payload,
    context: getServiceRuntimeState(),
  });
  return c.json(result, result.success ? 200 : 400);
});

/**
 * 确保 extension action API 路由只注册一次。
 *
 * 关键点（中文）
 * - 延迟到 server 启动阶段再注册，避免 `city agent create` 等无需 runtime 的命令在 import 时触发初始化错误。
 */
export function ensureExtensionActionRoutesRegistered(): void {
  if (extensionActionRoutesRegistered) return;
  registerAllExtensionsForServer(extensionsRouter, getServiceRuntimeState());
  extensionActionRoutesRegistered = true;
}
