/**
 * Console dashboard overview 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 `/api/dashboard/overview` 路径。
 * - 通过 Agent RPC 聚合 session、plugin、task 状态，不再经由 Agent HTTP control API。
 * - logs 仍读取 agent 项目本地 `.downcity` 目录，保持 overview 数据结构稳定。
 */
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRecentLogs } from "@downcity/agent/internal/runtime/server/http/control/TaskStore.js";
const CONSOLEUI_SESSION_ID = "consoleui-chat-main";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 当前 DC 版本号（用于 overview 显示）。
 */
const DC_VERSION = (() => {
    const candidate_package_paths = [
        // 关键点（中文）：workspace 内部包构建后位于 `cli/town/bin/control`。
        path.join(__dirname, "../../package.json"),
        // 关键点（中文）：downcity 聚合包复制后的 town runtime 位于 `<pkg>/town/control`。
        path.join(__dirname, "../package.json"),
    ];
    for (const package_path of candidate_package_paths) {
        try {
            const pkg = fs.readJsonSync(package_path);
            const version = String(pkg.version || "").trim();
            if (version)
                return version;
        }
        catch {
            // 关键点（中文）：不同构建布局会命中不同候选路径，失败时继续尝试下一个。
        }
    }
    return "unknown";
})();
/**
 * 注册 dashboard overview 路由。
 */
export function registerDashboardOverviewApiRoutes(params) {
    const { app } = params;
    app.get("/api/dashboard/overview", async (c) => {
        try {
            const context = await resolveDashboardAgentContext(params, c.req.raw);
            if (!context)
                return agentUnavailableResponse();
            const session_limit = toLimit(c.req.query("sessionLimit") || c.req.query("contextLimit"), 40);
            const [session_page, plugin_states, task_result, logs] = await Promise.all([
                context.client.list_sessions({ limit: session_limit }),
                context.client.list_internal_plugin_states(),
                context.client.run_internal_plugin_action({
                    plugin_name: "task",
                    action_name: "list",
                    payload: {},
                }).catch((error) => ({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                })),
                readRecentLogs({
                    projectRoot: context.agent.projectRoot,
                    limit: 50,
                }),
            ]);
            const sessions = ensureConsoleSessionItem(session_page.items.map((item) => toOverviewSessionItem(item)));
            const tasks = readTasksFromPluginResult(task_result);
            const status_count = {
                enabled: tasks.filter((item) => item.status === "enabled").length,
                paused: tasks.filter((item) => item.status === "paused").length,
                disabled: tasks.filter((item) => item.status === "disabled").length,
            };
            return c.json({
                success: true,
                cityVersion: DC_VERSION,
                now: new Date().toISOString(),
                agent: {
                    id: context.agent.agentId || context.agent.id,
                    status: "running",
                },
                sessions: {
                    total: sessions.length,
                    items: sessions,
                },
                plugins: plugin_states,
                tasks: {
                    total: tasks.length,
                    statusCount: status_count,
                },
                logs,
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
function toOverviewSessionItem(item) {
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
function ensureConsoleSessionItem(sessions) {
    const has_console_session = sessions.some((item) => String(item.sessionId || "").trim() === CONSOLEUI_SESSION_ID);
    if (has_console_session)
        return sessions;
    return [
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
}
function readTasksFromPluginResult(input) {
    if (!input.success)
        return [];
    const data = input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? input.data
        : {};
    return Array.isArray(data.tasks)
        ? data.tasks.map((item) => {
            const task = item && typeof item === "object" && !Array.isArray(item)
                ? item
                : {};
            return {
                ...(typeof task.status === "string" ? { status: task.status } : {}),
            };
        })
        : [];
}
function toLimit(raw, fallback) {
    const parsed = Number.parseInt(String(raw || "").trim(), 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed))
        return fallback;
    return Math.max(1, Math.min(parsed, 500));
}
//# sourceMappingURL=DashboardOverviewApiRoutes.js.map