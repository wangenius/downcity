/**
 * Console dashboard session 读侧路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 session 列表与消息时间线读接口。
 * - 读运行态信息时直接复用 Agent RPC 的 SDK session 能力，不再经由 Agent HTTP control API。
 * - 这里只迁移低风险读接口；写操作暂时保留在旧 proxy 路径。
 */
import fs from "fs-extra";
import path from "node:path";
import { toUiMessageTimeline } from "@downcity/agent/internal/runtime/server/http/control/MessageTimeline.js";
import { getDowncitySessionMessagesDirPath } from "../config/Paths.js";
const CONSOLEUI_SESSION_ID = "consoleui-chat-main";
/**
 * 注册 dashboard session 读侧路由。
 */
export function registerDashboardSessionApiRoutes(params) {
    const { app } = params;
    app.get("/api/dashboard/sessions", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const page = await context.client.list_sessions({
                limit: toLimit(c.req.query("limit"), 120),
            });
            const sessions = page.items.map((item) => toDashboardSessionSummary(item));
            const has_console_session = sessions.some((item) => String(item.sessionId || "").trim() === CONSOLEUI_SESSION_ID);
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
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/dashboard/sessions/:sessionId/messages", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            const history = await context.client.get_session_history({
                session_id,
                input: {
                    limit: toLimit(c.req.query("limit"), 200),
                    order: "asc",
                    view: "timeline",
                },
            }).catch((error) => {
                if (isSessionNotFoundError(error))
                    return null;
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
                ? history.items
                : [];
            return c.json({
                success: true,
                sessionId: session_id,
                total: messages.length,
                rawTotal: history.total,
                messages,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.delete("/api/dashboard/sessions/:sessionId/messages", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            const result = await context.client.clear_internal_session_messages(session_id);
            return c.json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.delete("/api/dashboard/sessions/:sessionId/chat-history", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            const result = await context.client.clear_internal_chat_history(session_id);
            return c.json({
                success: true,
                ...result,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/dashboard/sessions/:sessionId/execute", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            const body = await c.req.json().catch(() => ({}));
            const instructions = String(body.instructions || "").trim();
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            if (!instructions)
                return c.json({ success: false, error: "Missing instructions" }, 400);
            const payload = await context.client.execute_internal_session({
                session_id,
                instructions,
                attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
            });
            return c.json({
                success: true,
                ...payload,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/dashboard/system-prompt", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(String(c.req.query("sessionId") || "").trim()) ||
                CONSOLEUI_SESSION_ID;
            const payload = await context.client.resolve_internal_system_prompt(session_id);
            return c.json({
                success: true,
                ...payload,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/dashboard/sessions/:sessionId/archives", async (c) => {
        try {
            const agent = await resolveDashboardAgent(params, c.req.raw);
            if (!agent)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            const archive_dir_path = getSessionArchiveDirPath(agent, session_id);
            if (!(await fs.pathExists(archive_dir_path))) {
                return c.json({
                    success: true,
                    sessionId: session_id,
                    archives: [],
                });
            }
            const entries = await fs.readdir(archive_dir_path, { withFileTypes: true });
            const archives = [];
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith(".json"))
                    continue;
                const archive_id = decodeMaybe(entry.name.slice(0, -5));
                if (!archive_id)
                    continue;
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
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/dashboard/sessions/:sessionId/archives/:archiveId", async (c) => {
        try {
            const agent = await resolveDashboardAgent(params, c.req.raw);
            if (!agent)
                return agentUnavailableResponse();
            const session_id = decodeMaybe(c.req.param("sessionId"));
            const archive_id = decodeMaybe(c.req.param("archiveId"));
            if (!session_id)
                return c.json({ success: false, error: "Missing sessionId" }, 400);
            if (!archive_id)
                return c.json({ success: false, error: "Missing archiveId" }, 400);
            const archive_path = getSessionArchivePath(agent, session_id, archive_id);
            if (!(await fs.pathExists(archive_path))) {
                return c.json({ success: false, error: `Archive not found: ${archive_id}` }, 404);
            }
            const payload = await readArchivePayload(archive_path);
            const archived_messages = Array.isArray(payload?.messages) ? payload.messages : [];
            const messages = archived_messages.flatMap((message) => toUiMessageTimeline(message));
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
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
}
async function resolveDashboardAgent(params, request) {
    const requested_agent_id = params.readRequestedAgentId(request);
    const agent = await params.resolveSelectedAgent(requested_agent_id);
    if (!agent || agent.running !== true)
        return null;
    return agent;
}
async function resolveDashboardAgentContext(params, request) {
    const requested_agent_id = params.readRequestedAgentId(request);
    const agent = await params.resolveSelectedAgent(requested_agent_id);
    if (!agent || agent.running !== true)
        return null;
    const client = params.agentRpcPool.resolveClientForAgent(agent);
    if (!client)
        return null;
    return {
        agent,
        client,
    };
}
function agentUnavailableResponse() {
    return new Response(JSON.stringify({
        success: false,
        error: "No running agent found. Start one via `town agent start` first.",
    }), {
        status: 503,
        headers: {
            "Content-Type": "application/json",
        },
    });
}
function toDashboardSessionSummary(item) {
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
function getAgentId(agent) {
    return String(agent.agentId || agent.id || "").trim();
}
function getSessionArchiveDirPath(agent, session_id) {
    return path.join(getDowncitySessionMessagesDirPath(agent.projectRoot, getAgentId(agent), session_id), "archive");
}
function getSessionArchivePath(agent, session_id, archive_id) {
    return path.join(getSessionArchiveDirPath(agent, session_id), `${encodeURIComponent(String(archive_id || "").trim())}.json`);
}
async function readArchivePayload(archive_path) {
    return await fs.readJson(archive_path).catch(() => null);
}
function readArchiveTimestamp(payload) {
    return typeof payload?.archivedAt === "number" && Number.isFinite(payload.archivedAt)
        ? payload.archivedAt
        : undefined;
}
function toLimit(raw, fallback) {
    const parsed = Number.parseInt(String(raw || "").trim(), 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed))
        return fallback;
    return Math.max(1, Math.min(parsed, 500));
}
function isSessionNotFoundError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /session .* not found/i.test(message);
}
function decodeMaybe(value) {
    try {
        return decodeURIComponent(String(value || "")).trim();
    }
    catch {
        return String(value || "").trim();
    }
}
//# sourceMappingURL=DashboardSessionApiRoutes.js.map