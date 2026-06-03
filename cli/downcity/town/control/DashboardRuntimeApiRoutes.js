/**
 * Console dashboard runtime 路由。
 *
 * 关键点（中文）
 * - 承接旧 Console 使用的 services / authorization / workboard 路径。
 * - 所有运行态访问统一走 Town 维护的 Agent RPC，不再代理到 Agent HTTP。
 * - 这里只做旧路径到 plugin/RPC 能力的协议适配，不重新引入 service 编排层。
 */
/**
 * 注册 dashboard runtime 旧路径。
 */
export function registerDashboardRuntimeApiRoutes(params) {
    const { app } = params;
    app.get("/api/dashboard/services", async (c) => {
        try {
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
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
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.post("/api/services/control", async (c) => {
        try {
            const body = await c.req.json().catch(() => null);
            const plugin_name = String(body?.serviceName || body?.pluginName || "").trim();
            const action = String(body?.action || "").trim().toLowerCase();
            if (!plugin_name)
                return c.json({ success: false, error: "serviceName is required" }, 400);
            if (!isPluginControlAction(action)) {
                return c.json({ success: false, error: "invalid action" }, 400);
            }
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            const result = await resolved.client.control_internal_plugin({
                plugin_name,
                action,
            });
            return c.json(result, result.success ? 200 : 400);
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.post("/api/services/command", async (c) => {
        try {
            const body = await c.req.json().catch(() => null);
            const plugin_name = String(body?.serviceName || body?.pluginName || "").trim();
            const command = String(body?.command || "").trim();
            if (!plugin_name)
                return c.json({ success: false, error: "serviceName is required" }, 400);
            if (!command)
                return c.json({ success: false, error: "command is required" }, 400);
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            const result = await resolved.client.run_internal_plugin_command({
                plugin_name,
                command,
                payload: body?.payload,
                schedule: body?.schedule,
            });
            return c.json(result, result.success ? 200 : 400);
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.get("/api/dashboard/authorization", async (c) => {
        try {
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            return c.json({
                success: true,
                ...(await resolved.client.get_internal_authorization()),
            });
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.post("/api/dashboard/authorization/config", async (c) => {
        try {
            const body = await c.req.json().catch(() => ({}));
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            return c.json({
                success: true,
                ...(await resolved.client.write_internal_authorization_config(toJsonObject(body?.config))),
            });
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.post("/api/dashboard/authorization/action", async (c) => {
        try {
            const body = await c.req.json().catch(() => ({}));
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            return c.json({
                success: true,
                ...(await resolved.client.run_internal_authorization_action({
                    action: String(body?.action || "").trim(),
                    channel: String(body?.channel || "").trim(),
                    user_id: String(body?.userId || "").trim(),
                    role_id: String(body?.roleId || "").trim(),
                })),
            });
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
    app.get("/api/workboard/snapshot", async (c) => {
        try {
            const resolved = await resolveRuntimeClient(params, c.req.raw);
            if ("response" in resolved)
                return resolved.response;
            const result = await resolved.client.run_internal_plugin_action({
                plugin_name: "workboard",
                action_name: "snapshot",
                payload: {},
            });
            return c.json(result, result.success ? 200 : 503);
        }
        catch (error) {
            return c.json({ success: false, error: getErrorMessage(error) }, 500);
        }
    });
}
async function resolveRuntimeClient(params, request) {
    const requested_agent_id = params.readRequestedAgentId(request);
    const agent = await params.resolveSelectedAgent(requested_agent_id);
    if (!agent || agent.running !== true)
        return { response: agentUnavailableResponse() };
    const client = params.agentRpcPool.resolveClientForAgent(agent);
    if (!client) {
        return {
            response: Response.json({
                success: false,
                error: "Selected agent RPC endpoint is unavailable.",
            }, { status: 503 }),
        };
    }
    return { client };
}
function agentUnavailableResponse() {
    return Response.json({
        success: false,
        error: "No running agent found. Start one via `town agent start` first.",
    }, { status: 503 });
}
function isPluginControlAction(action) {
    return action === "start" || action === "stop" || action === "restart" || action === "status";
}
function toJsonObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    return value;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=DashboardRuntimeApiRoutes.js.map