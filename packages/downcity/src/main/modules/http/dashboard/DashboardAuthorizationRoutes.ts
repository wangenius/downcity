/**
 * Dashboard Authorization 路由。
 *
 * 关键点（中文）
 * - 单独承接 `/api/dashboard/authorization*`，避免 DashboardApiRoutes 文件继续膨胀。
 * - 授权页面的数据统一通过 auth plugin API 读取与写入。
 */

import type { Hono } from "hono";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import {
  readAuthDashboardPayload,
  setAuthDashboardUserRole,
  writeAuthDashboardConfig,
} from "@/main/modules/http/dashboard/AuthDashboardService.js";
import {
  isChatAuthorizationChannel,
  type AuthSetUserRolePayload,
  type ChatAuthorizationConfig,
} from "@/shared/types/AuthPlugin.js";
import type { ChatAuthorizationChannel } from "@/shared/types/AuthPlugin.js";

function normalizeChatChannel(value: unknown): ChatAuthorizationChannel | null {
  const text = String(value || "").trim().toLowerCase();
  if (isChatAuthorizationChannel(text)) return text;
  return null;
}

/**
 * 注册 authorization 相关路由。
 */
export function registerDashboardAuthorizationRoutes(params: {
  app: Hono;
  getExecutionContext: () => ExecutionContext;
}): void {
  const { app, getExecutionContext } = params;

  app.get("/api/dashboard/authorization", async (c) => {
    try {
      const payload = await readAuthDashboardPayload(getExecutionContext());
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/authorization/config", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        config?: ChatAuthorizationConfig;
      };
      const payload = await writeAuthDashboardConfig({
        context: getExecutionContext(),
        config: body.config && typeof body.config === "object" ? body.config : {},
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/authorization/action", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        action?: string;
        channel?: string;
        userId?: string;
        roleId?: string;
      };
      const action = String(body.action || "").trim();
      const channel = normalizeChatChannel(body.channel);
      if (!action || !channel) {
        return c.json({ success: false, error: "Missing action/channel" }, 400);
      }
      if (action !== "setUserRole") {
        return c.json({ success: false, error: `Unsupported action: ${action}` }, 400);
      }

      const payload = await setAuthDashboardUserRole({
        context: getExecutionContext(),
        input: {
          channel,
          userId: String(body.userId || "").trim(),
          roleId: String(body.roleId || "").trim(),
        } as AuthSetUserRolePayload,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
