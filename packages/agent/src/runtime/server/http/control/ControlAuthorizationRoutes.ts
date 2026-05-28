/**
 * Agent Control Authorization 路由。
 *
 * 关键点（中文）
 * - 单独承接 `/api/control/authorization*`。
 * - 授权页面的数据统一通过 auth plugin API 读取与写入。
 */

import type { Hono } from "hono";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { JsonObject } from "@/types/common/Json.js";
import {
  readAuthControlPayload,
  setAuthControlUserRole,
  writeAuthControlConfig,
} from "@/runtime/server/http/control/AuthControlService.js";
import { buildControlRouteAliases } from "@/runtime/server/http/control/CommonHelpers.js";

function normalizeChatChannel(value: unknown): string | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "telegram" || text === "feishu" || text === "qq") return text;
  return null;
}

/**
 * 注册 authorization 相关路由。
 */
export function registerControlAuthorizationRoutes(params: {
  app: Hono;
  getAgentContext: () => AgentContext;
}): void {
  const { app, getAgentContext } = params;

  for (const routePath of buildControlRouteAliases("/authorization")) {
    app.get(routePath, async (c) => {
      try {
        const payload = await readAuthControlPayload(getAgentContext());
        return c.json({
          success: true,
          ...payload,
        });
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });
  }

  for (const routePath of buildControlRouteAliases("/authorization/config")) {
    app.post(routePath, async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          config?: JsonObject;
        };
        const payload = await writeAuthControlConfig({
          context: getAgentContext(),
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
  }

  for (const routePath of buildControlRouteAliases("/authorization/action")) {
    app.post(routePath, async (c) => {
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

        const payload = await setAuthControlUserRole({
          context: getAgentContext(),
          input: {
            channel,
            userId: String(body.userId || "").trim(),
            roleId: String(body.roleId || "").trim(),
          },
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
}
