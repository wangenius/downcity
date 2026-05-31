/**
 * 平台 Agent 状态探活路由。
 *
 * 关键点（中文）
 * - 启动窗口期的 agent 状态探测放到 UI 网关内部执行，避免浏览器直接看到 500/503 噪音。
 * - 该接口始终返回 200 + 结构化状态，前端按状态轮询即可。
 * - ready 判定收敛在这里，保持前端逻辑尽量薄。
 */
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message || String(error);
    }
    return String(error);
}
function isReadyState(input) {
    const state = String(input || "").trim().toLowerCase();
    return ["running", "ok", "active", "enabled", "success", "idle"].includes(state);
}
async function fetchStatusJson(input, init) {
    const response = await fetch(input, init);
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok || payload.success === false) {
        const message = typeof payload.error === "string"
            ? payload.error
            : typeof payload.message === "string"
                ? payload.message
                : `${response.status} ${response.statusText}`;
        throw new Error(message);
    }
    return payload;
}
async function probeSelectedAgentStatus(selectedAgent) {
    const baseUrl = String(selectedAgent.baseUrl || "").trim();
    if (!selectedAgent.running || !baseUrl) {
        return {
            success: true,
            running: false,
            serverReady: false,
            pluginsReady: false,
            hasChatPlugin: false,
            reason: "Selected agent endpoint is unavailable.",
        };
    }
    try {
        await fetchStatusJson(new URL("/api/status", baseUrl).toString());
    }
    catch (error) {
        return {
            success: true,
            running: true,
            serverReady: false,
            pluginsReady: false,
            hasChatPlugin: false,
            reason: getErrorMessage(error),
        };
    }
    let pluginsPayload;
    try {
        pluginsPayload = await fetchStatusJson(new URL("/api/plugins/list", baseUrl).toString());
    }
    catch (error) {
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: false,
            hasChatPlugin: false,
            reason: getErrorMessage(error),
        };
    }
    const pluginList = Array.isArray(pluginsPayload.plugins)
        ? pluginsPayload.plugins
        : [];
    if (pluginList.length === 0) {
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: false,
            hasChatPlugin: false,
            reason: "Plugin runtime list is empty.",
        };
    }
    const allReady = pluginList.every((item) => isReadyState(item.state));
    const hasChatPlugin = pluginList.some((item) => {
        const name = String(item.name || "").trim().toLowerCase();
        return name === "chat";
    });
    if (!allReady) {
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: false,
            hasChatPlugin,
            reason: "Plugins are still starting.",
        };
    }
    if (!hasChatPlugin) {
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: true,
            hasChatPlugin: false,
        };
    }
    try {
        await fetchStatusJson(new URL("/api/plugins/command", baseUrl).toString(), {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({
                pluginName: "chat",
                command: "status",
                payload: {},
            }),
        });
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: true,
            hasChatPlugin: true,
        };
    }
    catch (error) {
        return {
            success: true,
            running: true,
            serverReady: true,
            pluginsReady: false,
            hasChatPlugin: true,
            reason: getErrorMessage(error),
        };
    }
}
/**
 * 注册 Agent 状态探活 API 路由。
 */
export function registerPlatformAgentStatusRoutes(params) {
    const app = params.app;
    app.get("/api/ui/agents/status", async (c) => {
        try {
            const requestedAgentId = params.readRequestedAgentId(c.req.raw);
            const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
            if (!selectedAgent) {
                return c.json({
                    success: true,
                    running: false,
                    serverReady: false,
                    pluginsReady: false,
                    hasChatPlugin: false,
                    reason: "No running agent selected.",
                });
            }
            return c.json(await probeSelectedAgentStatus(selectedAgent));
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
}
//# sourceMappingURL=AgentStatusApiRoutes.js.map