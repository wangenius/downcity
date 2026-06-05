/**
 * Console dashboard runtime 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 services / authorization / workboard 路径。
 * - 所有运行态访问统一走 Town 维护的 Agent RPC，不再代理到 Agent HTTP。
 * - 这里只做旧路径到 plugin/RPC 能力的协议适配，不重新引入 service 编排层。
 */

import type { Hono } from "hono";
import type { JsonObject, PlatformAgentOption } from "@downcity/agent";
import type { PluginStateControlAction } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";

type RuntimeRpcClient = NonNullable<ReturnType<AgentRpcPool["resolveClientForAgent"]>>;
const CHAT_AUTHORIZATION_PLUGIN_NAME = "chat-authorization";
const CHAT_AUTHORIZATION_ACTIONS = {
  snapshot: "snapshot",
  writeConfig: "write-config",
  setUserRole: "set-user-role",
} as const;

/**
 * Dashboard runtime 路由参数。
 */
export interface DashboardRuntimeApiRouteParams {
  /** Hono 应用实例。 */
  app: Hono;
  /** 从请求中读取目标 agent id。 */
  readRequestedAgentId(request: Request): string;
  /** 解析当前应使用的 agent。 */
  resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
  /** Town 维护的 Agent RPC 连接池。 */
  agentRpcPool: AgentRpcPool;
}

/**
 * 注册 dashboard runtime 旧路径。
 */
export function registerDashboardRuntimeApiRoutes(
  params: DashboardRuntimeApiRouteParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/services", async (c) => {
    try {
      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      const plugins = await resolved.client.list_internal_plugin_states();
      return c.json({
        success: true,
        services: plugins.map((plugin) => ({
          name: plugin.name,
          service: plugin.name,
          state: plugin.state,
          status: plugin.state,
          description: plugin.supportsLifecycle
            ? "plugin lifecycle service"
            : "plugin runtime capability",
        })),
      });
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.post("/api/services/control", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const plugin_name = String(body?.serviceName || body?.pluginName || "").trim();
      const action = String(body?.action || "").trim().toLowerCase();
      if (!plugin_name) return c.json({ success: false, error: "serviceName is required" }, 400);
      if (!isPluginControlAction(action)) {
        return c.json({ success: false, error: "invalid action" }, 400);
      }

      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      const result = await resolved.client.control_internal_plugin({
        plugin_name,
        action,
      });
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.post("/api/services/command", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);
      const plugin_name = String(body?.serviceName || body?.pluginName || "").trim();
      const command = String(body?.command || "").trim();
      if (!plugin_name) return c.json({ success: false, error: "serviceName is required" }, 400);
      if (!command) return c.json({ success: false, error: "command is required" }, 400);

      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      const result = await resolved.client.run_internal_plugin_command({
        plugin_name,
        command,
        payload: body?.payload,
        schedule: body?.schedule,
      });
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.get("/api/dashboard/authorization", async (c) => {
    try {
      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      const result = await runChatAuthorizationAction({
        client: resolved.client,
        action: CHAT_AUTHORIZATION_ACTIONS.snapshot,
      });
      return c.json({
        success: true,
        ...toJsonObject(result.data),
      });
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.post("/api/dashboard/authorization/config", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      await runChatAuthorizationAction({
        client: resolved.client,
        action: CHAT_AUTHORIZATION_ACTIONS.writeConfig,
        payload: {
          config: toJsonObject(body?.config),
        },
      });
      const result = await runChatAuthorizationAction({
        client: resolved.client,
        action: CHAT_AUTHORIZATION_ACTIONS.snapshot,
      });
      return c.json({
        success: true,
        ...toJsonObject(result.data),
      });
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.post("/api/dashboard/authorization/action", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      await runChatAuthorizationAction({
        client: resolved.client,
        action: CHAT_AUTHORIZATION_ACTIONS.setUserRole,
        payload: {
          channel: String(body?.channel || "").trim(),
          userId: String(body?.userId || "").trim(),
          roleId: String(body?.roleId || "").trim(),
        },
      });
      const result = await runChatAuthorizationAction({
        client: resolved.client,
        action: CHAT_AUTHORIZATION_ACTIONS.snapshot,
      });
      return c.json({
        success: true,
        ...toJsonObject(result.data),
      });
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });

  app.get("/api/workboard/snapshot", async (c) => {
    try {
      const resolved = await resolveRuntimeClient(params, c.req.raw);
      if ("response" in resolved) return resolved.response;
      const result = await resolved.client.run_internal_plugin_action({
        plugin_name: "workboard",
        action_name: "snapshot",
        payload: {},
      });
      return c.json(result, result.success ? 200 : 503);
    } catch (error) {
      return c.json({ success: false, error: getErrorMessage(error) }, 500);
    }
  });
}

async function resolveRuntimeClient(
  params: DashboardRuntimeApiRouteParams,
  request: Request,
): Promise<{ client: RuntimeRpcClient } | { response: Response }> {
  const requested_agent_id = params.readRequestedAgentId(request);
  const agent = await params.resolveSelectedAgent(requested_agent_id);
  if (!agent || agent.running !== true) return { response: agentUnavailableResponse() };
  const client = params.agentRpcPool.resolveClientForAgent(agent);
  if (!client) {
    return {
      response: Response.json(
        {
          success: false,
          error: "Selected agent RPC endpoint is unavailable.",
        },
        { status: 503 },
      ),
    };
  }
  return { client };
}

/**
 * 通过通用 Agent RPC 执行 chat-authorization action。
 */
async function runChatAuthorizationAction(params: {
  client: RuntimeRpcClient;
  action: string;
  payload?: JsonObject;
}) {
  const result = await params.client.run_internal_plugin_action({
    plugin_name: CHAT_AUTHORIZATION_PLUGIN_NAME,
    action_name: params.action,
    ...(params.payload !== undefined ? { payload: params.payload } : {}),
  });
  if (!result.success) {
    throw new Error(result.error || result.message || "chat authorization action failed");
  }
  return result;
}

function agentUnavailableResponse(): Response {
  return Response.json(
    {
      success: false,
      error: "No running agent found. Start one via `town agent start` first.",
    },
    { status: 503 },
  );
}

function isPluginControlAction(action: string): action is PluginStateControlAction {
  return action === "start" || action === "stop" || action === "restart" || action === "status";
}

function toJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonObject;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
