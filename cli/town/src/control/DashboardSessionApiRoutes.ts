/**
 * Console dashboard session 读侧路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 session 列表与消息时间线读接口。
 * - 读运行态信息时直接复用 Agent RPC 的 SDK session 能力，不再经由 Agent HTTP control API。
 * - 这里只迁移低风险读接口；写操作暂时保留在旧 proxy 路径。
 */

import type { Hono } from "hono";
import fs from "fs-extra";
import path from "node:path";
import type {
  AgentSessionSummary,
  AgentSessionTimelineEvent,
  PlatformAgentOption,
} from "@downcity/agent";
import type { ControlSessionExecuteAttachmentInput } from "@downcity/agent/internal/runtime/server/http/control/types/ControlSessionExecute.js";
import { toUiMessageTimeline } from "@downcity/agent/internal/runtime/server/http/control/MessageTimeline.js";
import type { AgentRpcPool } from "@/control/gateway/AgentRpcPool.js";
import { getDowncitySessionMessagesDirPath } from "@/config/Paths.js";

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

  app.delete("/api/dashboard/sessions/:sessionId/messages", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      const result = await context.client.clear_internal_session_messages(session_id);
      return c.json({
        success: true,
        ...result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/sessions/:sessionId/chat-history", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      const result = await context.client.clear_internal_chat_history(session_id);
      return c.json({
        success: true,
        ...result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/sessions/:sessionId/execute", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      const body = await c.req.json().catch(() => ({})) as {
        instructions?: unknown;
        attachments?: ControlSessionExecuteAttachmentInput[];
      };
      const instructions = String(body.instructions || "").trim();
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      if (!instructions) return c.json({ success: false, error: "Missing instructions" }, 400);
      const payload = await context.client.execute_internal_session({
        session_id,
        instructions,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      });
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/system-prompt", async (c) => {
    try {
      const context = await resolveDashboardAgentContext(params, c.req.raw);
      if (!context) return agentUnavailableResponse();
      const session_id =
        decodeMaybe(String(c.req.query("sessionId") || "").trim()) ||
        CONSOLEUI_SESSION_ID;
      const payload = await context.client.resolve_internal_system_prompt(session_id);
      return c.json({
        success: true,
        ...payload,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/archives", async (c) => {
    try {
      const agent = await resolveDashboardAgent(params, c.req.raw);
      if (!agent) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      const archive_dir_path = getSessionArchiveDirPath(agent, session_id);
      if (!(await fs.pathExists(archive_dir_path))) {
        return c.json({
          success: true,
          sessionId: session_id,
          archives: [],
        });
      }

      const entries = await fs.readdir(archive_dir_path, { withFileTypes: true });
      const archives: Array<{
        archiveId: string;
        archivedAt?: number;
        messageCount: number;
      }> = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const archive_id = decodeMaybe(entry.name.slice(0, -5));
        if (!archive_id) continue;
        const archive_path = getSessionArchivePath(agent, session_id, archive_id);
        const payload = await readArchivePayload(archive_path);
        const archived_at = readArchiveTimestamp(payload);
        const stat_at = typeof archived_at === "number"
          ? undefined
          : await fs.stat(archive_path).then((stat) => stat.mtimeMs).catch(() => undefined);
        archives.push({
          archiveId: archive_id,
          ...(typeof archived_at === "number"
            ? { archivedAt: archived_at }
            : typeof stat_at === "number"
              ? { archivedAt: stat_at }
              : {}),
          messageCount: Array.isArray(payload?.messages) ? payload.messages.length : 0,
        });
      }

      archives.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
      return c.json({
        success: true,
        sessionId: session_id,
        archives: archives.slice(0, toLimit(c.req.query("limit"), 100)),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/archives/:archiveId", async (c) => {
    try {
      const agent = await resolveDashboardAgent(params, c.req.raw);
      if (!agent) return agentUnavailableResponse();
      const session_id = decodeMaybe(c.req.param("sessionId"));
      const archive_id = decodeMaybe(c.req.param("archiveId"));
      if (!session_id) return c.json({ success: false, error: "Missing sessionId" }, 400);
      if (!archive_id) return c.json({ success: false, error: "Missing archiveId" }, 400);

      const archive_path = getSessionArchivePath(agent, session_id, archive_id);
      if (!(await fs.pathExists(archive_path))) {
        return c.json(
          { success: false, error: `Archive not found: ${archive_id}` },
          404,
        );
      }

      const payload = await readArchivePayload(archive_path);
      const archived_messages = Array.isArray(payload?.messages) ? payload.messages : [];
      const messages = archived_messages.flatMap((message) =>
        toUiMessageTimeline(message as Parameters<typeof toUiMessageTimeline>[0]),
      );
      const archived_at = readArchiveTimestamp(payload);

      return c.json({
        success: true,
        sessionId: session_id,
        archiveId: archive_id,
        ...(typeof archived_at === "number" ? { archivedAt: archived_at } : {}),
        total: messages.length,
        rawTotal: archived_messages.length,
        messages,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

}

async function resolveDashboardAgent(
  params: DashboardSessionApiRouteParams,
  request: Request,
): Promise<PlatformAgentOption | null> {
  const requested_agent_id = params.readRequestedAgentId(request);
  const agent = await params.resolveSelectedAgent(requested_agent_id);
  if (!agent || agent.running !== true) return null;
  return agent;
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

function getAgentId(agent: PlatformAgentOption): string {
  return String(agent.agentId || agent.id || "").trim();
}

function getSessionArchiveDirPath(
  agent: PlatformAgentOption,
  session_id: string,
): string {
  return path.join(
    getDowncitySessionMessagesDirPath(agent.projectRoot, getAgentId(agent), session_id),
    "archive",
  );
}

function getSessionArchivePath(
  agent: PlatformAgentOption,
  session_id: string,
  archive_id: string,
): string {
  return path.join(
    getSessionArchiveDirPath(agent, session_id),
    `${encodeURIComponent(String(archive_id || "").trim())}.json`,
  );
}

async function readArchivePayload(archive_path: string): Promise<{
  archivedAt?: unknown;
  messages?: unknown;
} | null> {
  return await fs.readJson(archive_path).catch(() => null) as {
    archivedAt?: unknown;
    messages?: unknown;
  } | null;
}

function readArchiveTimestamp(payload: {
  archivedAt?: unknown;
} | null): number | undefined {
  return typeof payload?.archivedAt === "number" && Number.isFinite(payload.archivedAt)
    ? payload.archivedAt
    : undefined;
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
