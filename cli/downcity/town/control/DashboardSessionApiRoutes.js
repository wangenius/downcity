/**
 * Console dashboard session 读侧路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 session 列表与消息时间线读接口。
 * - 读运行态信息时直接复用 Agent RPC 的 SDK session 能力，不再经由 Agent HTTP control API。
 * - 这里只迁移低风险读接口；写操作与归档接口暂时保留在旧 proxy 路径。
 */
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