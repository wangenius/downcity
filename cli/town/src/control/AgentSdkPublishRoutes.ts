/**
 * Town Agent SDK 发布路由。
 *
 * 关键点（中文）
 * - Town 对外暴露 HTTP SDK 面，Agent 只作为内部 RPC 服务被调用。
 * - 路由保持 RemoteAgent HTTP transport 的既有路径：`/agents/:agentId/api/sdk/...`。
 * - 本模块只做协议转换，不引入 Town SDK 包，也不实现第二套 session 编排器。
 */

import { Hono } from "hono";
import { RemoteAgent, type PlatformAgentOption } from "@downcity/agent";
import type { AgentListSessionsInput } from "@downcity/agent";
import type { AgentSessionPromptInput } from "@downcity/agent";
import { resolveDaemonRpcEndpoint } from "@/process/daemon/Client.js";

const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
const SDK_EVENTS_READY_FRAME = {
  type: "sdk-events-ready",
} as const;

/**
 * Town Agent SDK 发布路由依赖。
 */
export interface AgentSdkPublishRouteHandlers {
  /**
   * 按用户可见 agent id 或项目根目录解析 agent。
   */
  resolveAgentById(requestedAgentId: string): Promise<PlatformAgentOption | null>;
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
  const remote_agents_by_url = new Map<string, RemoteAgent>();

  app.get("/agents/:agentId/api/sdk/sessions", async (c) => {
    try {
      const remote_agent = await resolve_remote_agent({
        requested_agent_id: c.req.param("agentId"),
        handlers,
        remote_agents_by_url,
      });
      if (!remote_agent) return agent_not_found_response();
      const input: AgentListSessionsInput = {
        ...(c.req.query("limit") ? { limit: Number(c.req.query("limit")) } : {}),
        ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
        ...(c.req.query("query") ? { query: c.req.query("query") } : {}),
      };
      const page = await remote_agent.listSessions(input);
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
      const remote_agent = await resolve_remote_agent({
        requested_agent_id: c.req.param("agentId"),
        handlers,
        remote_agents_by_url,
      });
      if (!remote_agent) return agent_not_found_response();
      const body = (await c.req.json().catch(() => ({}))) as {
        sessionId?: unknown;
      };
      const session = await remote_agent.createSession({
        ...(body.sessionId ? { sessionId: String(body.sessionId).trim() } : {}),
      });
      return c.json({
        success: true,
        session: await session.getInfo(),
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.get("/agents/:agentId/api/sdk/sessions/:sessionId", async (c) => {
    try {
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      return c.json({
        success: true,
        session: await session.getInfo(),
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.post("/agents/:agentId/api/sdk/sessions/:sessionId/prompt", async (c) => {
    try {
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      const body = (await c.req.json()) as AgentSessionPromptInput;
      const turn = await session.prompt(body);
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
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();

      const encoder = new TextEncoder();
      const request_signal = c.req.raw.signal;
      let cleanup_events_connection = (): void => {};
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cleanup_events_connection();
        },
        start(controller) {
          const write_line = (value: unknown): void => {
            controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
          };

          const unsubscribe = session.subscribe((event) => {
            write_line(event);
          });

          const close_stream = (): void => {
            cleanup_events_connection();
            try {
              controller.close();
            } catch {
              // ignore duplicate close attempts
            }
          };

          cleanup_events_connection = (): void => {
            unsubscribe();
            request_signal.removeEventListener("abort", close_stream);
          };

          if (request_signal.aborted) {
            close_stream();
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
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      const history = await session.history({
        ...(c.req.query("limit") ? { limit: Number(c.req.query("limit")) } : {}),
        ...(c.req.query("cursor") ? { cursor: c.req.query("cursor") } : {}),
        ...(c.req.query("order")
          ? { order: c.req.query("order") as "asc" | "desc" }
          : {}),
        ...(c.req.query("view")
          ? { view: c.req.query("view") as "message" | "timeline" }
          : {}),
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
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      const history = await session.history({
        view: "message",
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
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      return c.json({
        success: true,
        system: await session.system(),
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  app.post("/agents/:agentId/api/sdk/sessions/:sessionId/fork", async (c) => {
    try {
      const session = await resolve_remote_session({
        agent_id: c.req.param("agentId"),
        session_id: c.req.param("sessionId"),
        handlers,
        remote_agents_by_url,
      });
      if (!session) return agent_not_found_response();
      const body = (await c.req.json().catch(() => ({}))) as {
        messageId?: unknown;
      };
      const forked = await session.fork(
        String(body.messageId || "").trim() || undefined,
      );
      return c.json({
        success: true,
        session: await forked.getInfo(),
      });
    } catch (error) {
      return error_response(c, error);
    }
  });

  return {
    async close(): Promise<void> {
      const agents = [...remote_agents_by_url.values()];
      remote_agents_by_url.clear();
      await Promise.all(agents.map((agent) => agent.close()));
    },
  };
}

async function resolve_remote_agent(params: {
  requested_agent_id: string;
  handlers: AgentSdkPublishRouteHandlers;
  remote_agents_by_url: Map<string, RemoteAgent>;
}): Promise<RemoteAgent | null> {
  const agent = await params.handlers.resolveAgentById(params.requested_agent_id);
  if (!agent || agent.running !== true) return null;
  const endpoint = resolveDaemonRpcEndpoint({
    projectRoot: agent.projectRoot,
  });
  const rpc_url = `rpc://${endpoint.host}:${endpoint.port}`;
  const cached = params.remote_agents_by_url.get(rpc_url);
  if (cached) return cached;
  const created = new RemoteAgent({ url: rpc_url });
  params.remote_agents_by_url.set(rpc_url, created);
  return created;
}

async function resolve_remote_session(params: {
  agent_id: string;
  session_id: string;
  handlers: AgentSdkPublishRouteHandlers;
  remote_agents_by_url: Map<string, RemoteAgent>;
}) {
  const session_id = String(params.session_id || "").trim();
  if (!session_id) {
    throw new Error("Missing sessionId");
  }
  const remote_agent = await resolve_remote_agent({
    requested_agent_id: params.agent_id,
    handlers: params.handlers,
    remote_agents_by_url: params.remote_agents_by_url,
  });
  if (!remote_agent) return null;
  return await remote_agent.getSession(session_id);
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
