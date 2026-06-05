/**
 * Town Agent SDK 发布路由。
 *
 * 关键点（中文）
 * - Town 对外暴露 HTTP SDK 面，Agent 只作为内部 RPC 服务被调用。
 * - 路由保持 RemoteAgent HTTP transport 的既有路径：`/agents/:agentId/api/sdk/...`。
 * - 本模块只做协议转换，不引入 Town SDK 包，也不实现第二套 session 编排器。
 */

import { Hono } from "hono";
import type { AgentListSessionsInput } from "@downcity/agent";
import type { AgentSessionEvent } from "@downcity/agent";
import type { AgentSessionPromptInput } from "@downcity/agent";
import type { AgentRpcPool } from "../AgentRpcPool.js";

const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
const SDK_EVENTS_READY_FRAME = {
  type: "sdk-events-ready",
} as const;

/**
 * Town Agent SDK 发布路由依赖。
 */
export interface AgentSdkPublishRouteHandlers {
  /** Town 维护的 Agent RPC 连接池。 */
  agentRpcPool: AgentRpcPool;
}

/**
 * Town Agent SDK 发布路由运行时句柄。
 */
export interface AgentSdkPublishRoutesRuntime {
  /**
   * 关闭当前发布路由缓存的 RPC 连接。
   */
  close(): Promise<void>;
}

/**
 * 注册 Town 对外发布的 Agent SDK HTTP 路由。
 */
export function registerAgentSdkPublishRoutes(params: {
  app: Hono;
  handlers: AgentSdkPublishRouteHandlers;
}): AgentSdkPublishRoutesRuntime {
  const { app, handlers } = params;

  app.get("/agents/:agentId/api/sdk/sessions", async (c) => {
    try {
      const client = await handlers.agentRpcPool.resolveClientByAgentId(
        c.req.param("agentId"),
      );
      if (!client) return agent_not_found_response();
      const input: AgentListSessionsInput = {
        ...(c.req.query("limit") ? { limit: Number(c.req.query("limit")) } : {}),
        ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
        ...(c.req.query("query") ? { query: c.req.query("query") } : {}),
      };
      const page = await client.list_sessions(input);
      return c.json({
        success: true,
        page,
        sessions: page.items,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.post("/agents/:agentId/api/sdk/sessions", async (c) => {
    try {
      const client = await handlers.agentRpcPool.resolveClientByAgentId(
        c.req.param("agentId"),
      );
      if (!client) return agent_not_found_response();
      const body = (await c.req.json().catch(() => ({}))) as {
        sessionId?: unknown;
      };
      const session = await client.create_session({
        ...(body.sessionId ? { sessionId: String(body.sessionId).trim() } : {}),
      });
      return c.json({
        success: true,
        session,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const session = await resolved.client.get_session(resolved.session_id);
      return c.json({
        success: true,
        session,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.post("/agents/:agentId/api/sdk/sessions/:sessionId/prompt", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const body = (await c.req.json()) as AgentSessionPromptInput;
      const turn = await resolved.client.prompt_session({
        session_id: resolved.session_id,
        input: body,
      });
      return c.json({
        success: true,
        turn: {
          id: turn.id,
        },
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId/events", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();

      const encoder = new TextEncoder();
      const request_signal = c.req.raw.signal;
      let cleanup_events_connection = async (): Promise<void> => {};
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          void cleanup_events_connection();
        },
        async start(controller) {
          const write_line = (value: unknown): void => {
            controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
          };

          const subscription = await resolved.client.subscribe_session({
            session_id: resolved.session_id,
            on_ready: () => {},
            on_event: (event: AgentSessionEvent) => {
              write_line(event);
            },
          });

          const close_stream = async (): Promise<void> => {
            await cleanup_events_connection();
            try {
              controller.close();
            } catch {
              // ignore duplicate close attempts
            }
          };

          cleanup_events_connection = async (): Promise<void> => {
            await subscription.unsubscribe().catch(() => undefined);
            request_signal.removeEventListener("abort", close_stream);
          };

          if (request_signal.aborted) {
            await close_stream();
            return;
          }

          request_signal.addEventListener("abort", close_stream, { once: true });
          write_line(SDK_EVENTS_READY_FRAME);
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": NDJSON_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId/history", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const history = await resolved.client.get_session_history({
        session_id: resolved.session_id,
        input: {
        ...(c.req.query("limit") ? { limit: Number(c.req.query("limit")) } : {}),
        ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
        ...(c.req.query("order")
          ? { order: c.req.query("order") as "asc" | "desc" }
          : {}),
        ...(c.req.query("view")
          ? { view: c.req.query("view") as "message" | "timeline" }
          : {}),
        },
      });
      return c.json({
        success: true,
        history,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId/messages", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const history = await resolved.client.get_session_history({
        session_id: resolved.session_id,
        input: {
          view: "message",
        },
      });
      return c.json({
        success: true,
        messages: history.items,
        history,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId/system", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const system = await resolved.client.get_session_system(resolved.session_id);
      return c.json({
        success: true,
        system,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.post("/agents/:agentId/api/sdk/sessions/:sessionId/fork", async (c) => {
    try {
      const resolved = await resolve_client_and_session_id({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        agent_rpc_pool: handlers.agentRpcPool,
      });
      if (!resolved) return agent_not_found_response();
      const body = (await c.req.json().catch(() => ({}))) as {
        messageId?: unknown;
      };
      const forked = await resolved.client.fork_session({
        session_id: resolved.session_id,
        message_id: String(body.messageId || "").trim() || undefined,
      });
      return c.json({
        success: true,
        session: forked,
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  return {
    async close(): Promise<void> {
      // 关键点（中文）：RPC 连接由 GatewayServer 的 AgentRpcPool 统一关闭。
    },
  };
}

async function resolve_client_and_session_id(params: {
  agent_id: string;
  session_id: string;
  agent_rpc_pool: AgentRpcPool;
}): Promise<{
  client: Awaited<ReturnType<AgentRpcPool["resolveClientByAgentId"]>> extends infer T
    ? Exclude<T, null>
    : never;
  session_id: string;
} | null> {
  const session_id = String(params.session_id || "").trim();
  if (!session_id) {
    throw new Error("Missing sessionId");
  }
  const client = await params.agent_rpc_pool.resolveClientByAgentId(params.agent_id);
  if (!client) return null;
  return {
    client,
    session_id,
  };
}

function agent_not_found_response(): Response {
  return Response.json(
    {
      success: false,
      error: "Agent not found or not running.",
    },
    {
      status: 404,
    },
  );
}

function error_response(
  c: {
    json: (data: unknown, status?: number) => Response;
  },
  error: unknown,
): Response {
  return c.json(
    {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    },
    500,
  );
}
