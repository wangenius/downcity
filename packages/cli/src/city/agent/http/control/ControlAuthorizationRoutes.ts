/**
 * Agent Control Authorization 路由。
 *
 * 关键点（中文）
 * - 单独承接 `/api/control/authorization*`。
 * - City 只做 HTTP 适配，具体授权数据读写统一交给 chat plugin access action。
 */

import type { Hono } from "hono";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { JsonObject } from "@downcity/agent/internal/types/common/Json.js";
import type { JsonValue } from "@downcity/agent/internal/types/common/Json.js";
import { CHAT_AUTHORIZATION_ACTIONS } from "@downcity/plugins";
import { buildControlRouteAliases } from "@/city/agent/control/CommonHelpers.js";

const CHAT_PLUGIN_NAME = "chat";

function normalizeChatChannel(value: unknown): string | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "telegram" || text === "feishu" || text === "qq") return text;
  return null;
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

/**
 * 执行 ChatPlugin 内置授权 action。
 */
async function runChatAuthorizationAction(params: {
  context: AgentContext;
  action: string;
  payload?: JsonValue;
}): Promise<JsonObject> {
  const result = await params.context.plugins.runAction({
    plugin: CHAT_PLUGIN_NAME,
    action: params.action,
    ...(params.payload !== undefined ? { payload: params.payload } : {}),
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "chat authorization action failed");
  }
  return toJsonObject(result.data);
}

/**
 * 读取聊天授权控制面快照。
 */
async function readChatAuthorizationSnapshot(context: AgentContext): Promise<JsonObject> {
  return await runChatAuthorizationAction({
    context,
    action: CHAT_AUTHORIZATION_ACTIONS.snapshot,
  });
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
        const payload = await readChatAuthorizationSnapshot(getAgentContext());
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
        const context = getAgentContext();
        await runChatAuthorizationAction({
          context,
          action: CHAT_AUTHORIZATION_ACTIONS.writeConfig,
          payload: {
            config: body.config && typeof body.config === "object" ? body.config : {},
          },
        });
        const payload = await readChatAuthorizationSnapshot(context);
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

        const context = getAgentContext();
        await runChatAuthorizationAction({
          context,
          action: CHAT_AUTHORIZATION_ACTIONS.setUserRole,
          payload: {
            channel,
            userId: String(body.userId || "").trim(),
            roleId: String(body.roleId || "").trim(),
          },
        });
        const payload = await readChatAuthorizationSnapshot(context);
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
