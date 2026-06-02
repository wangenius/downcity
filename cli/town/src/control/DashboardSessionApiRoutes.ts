/**
 * Console dashboard session 读侧路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 session 列表与消息时间线读接口。
 * - 读运行态信息时直接复用 Agent RPC 的 SDK session 能力，不再经由 Agent HTTP control API。
 * - 这里只迁移低风险读接口；写操作与归档接口暂时保留在旧 proxy 路径。
 */

import type { Hono } from "hono";
import type {
  AgentSessionSummary,
  AgentSessionTimelineEvent,
  PlatformAgentOption,
} from "@downcity/agent";
import type { AgentRpcPool } from "@/control/gateway/AgentRpcPool.js";

const CONSOLEUI_SESSION_ID = "consoleui-chat-main";

/**
 * Dashboard session 路由参数。
 */
export interface DashboardSessionApiRouteParams {
  /**
   * Hono 应用实例。
   */
  app: Hono;
  /**
   * 从请求中读取用户选择的 agent id。
   */
  readRequestedAgentId(request: Request): string;
  /**
   * 解析当前运行中的 agent。
   */
  resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
  /**
   * Town 维护的 Agent RPC 连接池。
   */
  agentRpcPool: AgentRpcPool;
}

/**
 * 注册 dashboard session 读侧路由。
 */
export function registerDashboardSessionApiRoutes(
  params: DashboardSessionApiRouteParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/sessions", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const page = await context.client.list_sessions({
        limit: toLimit(c.req.query("limit"), 120),
      });
      const sessions = page.items.map((item) => toDashboardSessionSummary(item));
      const has_console_session = sessions.some(
        (item) => String(item.sessionId || "").trim() === CONSOLEUI_SESSION_ID,
      );
      const enriched_sessions = has_console_session
        ? sessions
        : [
            {
              sessionId: CONSOLEUI_SESSION_ID,
              messageCount: 0,
              updatedAt: Date.now(),
              lastRole: "system",
              lastText: "consoleui channel",
              channel: "consoleui",
            },
            ...sessions,
          ];

      return c.json({
        success: true,
        sessions: enriched_sessions,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/messages", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      const history = await context.client.get_session_history({
        session_id,
        input: {
          limit: toLimit(c.req.query("limit"), 200),
          order: "asc",
          view: "timeline",
        },
      }).catch((error) => {
        if (isSessionNotFoundError(error)) return null;
        throw error;
      });
      if (!history) {
        return c.json({
          success: true,
          sessionId: session_id,
          total: 0,
          rawTotal: 0,
          messages: [],
        });
      }
      const messages = Array.isArray(history.items)
        ? history.items as AgentSessionTimelineEvent[]
        : [];
      return c.json({
        success: true,
        sessionId: session_id,
        total: messages.length,
        rawTotal: history.total,
        messages,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

}

async function resolveDashboardAgentContext(
  params: DashboardSessionApiRouteParams,
  request: Request,
): Promise<{
  agent: PlatformAgentOption;
  client: NonNullable<ReturnType<AgentRpcPool["resolveClientForAgent"]>>;
} | null> {
  const requested_agent_id = params.readRequestedAgentId(request);
  const agent = await params.resolveSelectedAgent(requested_agent_id);
  if (!agent || agent.running !== true) return null;
  const client = params.agentRpcPool.resolveClientForAgent(agent);
  if (!client) return null;
  return {
    agent,
    client,
  };
}

function agentUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "No running agent found. Start one via `town agent start` first.",
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function toDashboardSessionSummary(
  item: AgentSessionSummary,
): Record<string, unknown> {
  return {
    sessionId: item.sessionId,
    messageCount: item.messageCount,
    ...(typeof item.updatedAt === "number" ? { updatedAt: item.updatedAt } : {}),
    ...(typeof item.previewText === "string" && item.previewText.trim()
      ? { lastText: item.previewText.trim() }
      : {}),
    ...(item.executing ? { executing: true } : {}),
  };
}

function toLimit(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 500));
}

function isSessionNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /session .* not found/i.test(message);
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(String(value || "")).trim();
  } catch {
    return String(value || "").trim();
  }
}
