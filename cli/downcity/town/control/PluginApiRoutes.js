/**
 * 平台 Plugin 路由。
 *
 * 关键点（中文）
 * - 平台控制面的 plugin 面板首先展示“已注册的内建 plugin 清单”，不应因为 agent 短暂不可用而整块消失。
 * - 当目标 agent 可访问时，再叠加 plugin list + availability，补齐启用态、依赖缺失等动态信息。
 * - 这样能同时满足“架构上 plugin 属于 main/package 注册信息”和“可用性属于 agent 状态”两层语义。
 */
import { findPluginByName, listPluginViews, runLocalPluginAction, } from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { isTownPluginEnabled, setBayPluginEnabled, } from "../platform/PluginLifecycle.js";
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message || String(error);
    }
    return String(error);
}
function createPluginCatalog() {
    return createBuiltinPlugins();
}
function buildPluginActionConfig(plugin) {
    if (!plugin)
        return [];
    const actions = (plugin.actions || {});
    return Object.entries(actions)
        .map(([actionName, action]) => ({
        name: actionName,
        supportsCommand: Boolean(action?.command),
        commandDescription: String(action?.command?.description || "").trim(),
    }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
function buildPluginConfigMap() {
    const plugins = createPluginCatalog();
    return new Map(listPluginViews(plugins).map((view) => {
        const plugin = findPluginByName(plugins, view.name);
        return [
            view.name,
            {
                actions: buildPluginActionConfig(plugin),
                ...(plugin?.setup ? { setup: plugin.setup } : {}),
                ...(plugin?.usage ? { usage: plugin.usage } : {}),
            },
        ];
    }));
}
function buildGlobalPluginConfigMap() {
    const plugins = createPluginCatalog();
    return new Map(listPluginViews(plugins).map((view) => {
        const plugin = findPluginByName(plugins, view.name);
        return [
            view.name,
            {
                actions: buildPluginActionConfig(plugin),
                ...(plugin?.setup ? { setup: plugin.setup } : {}),
            },
        ];
    }));
}
function buildGlobalPluginPayload() {
    const configMap = buildGlobalPluginConfigMap();
    return {
        success: true,
        runtimeConnected: false,
        plugins: listPluginViews(createPluginCatalog()).map((view) => ({
            ...view,
            availability: {
                enabled: isTownPluginEnabled(view.name),
                available: true,
                reasons: [],
            },
            config: configMap.get(view.name) || {
                actions: [],
            },
        })),
    };
}
function buildAgentPluginPayload(params) {
    const configMap = buildPluginConfigMap();
    const reason = String(params?.runtimeError || "").trim();
    return {
        success: true,
        runtimeConnected: params?.runtimeConnected === true,
        ...(reason ? { runtimeError: reason } : {}),
        plugins: listPluginViews(createPluginCatalog()).map((view) => ({
            ...view,
            availability: {
                enabled: isTownPluginEnabled(view.name),
                available: false,
                reasons: reason
                    ? [`Agent server unavailable: ${reason}`]
                    : ["Static catalog view only. Agent-side availability is not loaded."],
            },
            config: configMap.get(view.name) || {
                actions: [],
            },
        })),
    };
}
async function buildAgentPluginPayloadFromRuntime(selectedAgent, agentRpcPool) {
    const client = agentRpcPool.resolveClientForAgent(selectedAgent);
    if (!client) {
        throw new Error("Selected agent RPC endpoint is unavailable.");
    }
    const configMap = buildPluginConfigMap();
    const pluginViews = (await client.list_internal_plugin_catalog())
        .sort((a, b) => a.name.localeCompare(b.name));
    const plugins = await Promise.all(pluginViews.map(async (view) => {
        return {
            ...view,
            availability: await client.get_internal_plugin_availability(view.name),
            config: configMap.get(view.name) || {
                actions: [],
            },
        };
    }));
    return {
        success: true,
        runtimeConnected: true,
        plugins,
    };
}
async function runGlobalPluginAction(input) {
    const pluginName = String(input.pluginName || "").trim();
    const actionName = String(input.actionName || "").trim();
    const plugins = createPluginCatalog();
    const plugin = findPluginByName(plugins, pluginName);
    if (!plugin) {
        return {
            success: false,
            error: `Unknown plugin: ${pluginName}`,
            message: `Unknown plugin: ${pluginName}`,
        };
    }
    if (actionName === "on" || actionName === "off") {
        if (plugin.name === "auth") {
            return {
                success: false,
                error: `Plugin "${plugin.name}" cannot be disabled globally`,
                message: `Plugin "${plugin.name}" cannot be disabled globally`,
            };
        }
        setBayPluginEnabled(plugin.name, actionName === "on");
        return {
            success: true,
            message: `Plugin "${plugin.name}" ${actionName === "on" ? "enabled" : "disabled"} in town config`,
            data: {
                pluginName: plugin.name,
                enabled: actionName === "on",
            },
        };
    }
    const projectRoot = String(input.projectRoot || "").trim();
    if (!projectRoot) {
        return {
            success: false,
            error: `Plugin "${plugin.name}" action "${actionName}" requires a selected agent`,
            message: `Plugin "${plugin.name}" action "${actionName}" requires a selected agent`,
        };
    }
    return runLocalPluginAction({
        plugins,
        projectRoot,
        pluginName: plugin.name,
        actionName,
        payload: input.payload,
    });
}
/**
 * 注册 Plugin 管理 API 路由。
 */
export function registerPlatformPluginRoutes(params) {
    const app = params.app;
    app.get("/api/ui/plugins", async (c) => {
        try {
            const requestedAgentId = params.readRequestedAgentId(c.req.raw);
            if (!requestedAgentId) {
                return c.json(buildGlobalPluginPayload());
            }
            const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
            if (!selectedAgent || !selectedAgent.running) {
                return c.json(buildAgentPluginPayload({
                    projectRoot: selectedAgent?.projectRoot,
                    runtimeConnected: false,
                    runtimeError: "No running agent selected.",
                }));
            }
            try {
                return c.json(await buildAgentPluginPayloadFromRuntime(selectedAgent, params.agentRpcPool));
            }
            catch (runtimeError) {
                return c.json(buildAgentPluginPayload({
                    projectRoot: selectedAgent.projectRoot,
                    runtimeConnected: false,
                    runtimeError: getErrorMessage(runtimeError),
                }));
            }
        }
        catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error),
            }, 500);
        }
    });
    app.post("/api/ui/plugins/action", async (c) => {
        try {
            const body = await c.req.json().catch(() => null);
            const pluginName = String(body?.pluginName || "").trim();
            const actionName = String(body?.actionName || "").trim();
            if (!pluginName) {
                return c.json({ success: false, error: "pluginName is required" }, 400);
            }
            if (!actionName) {
                return c.json({ success: false, error: "actionName is required" }, 400);
            }
            const requestedAgentId = params.readRequestedAgentId(c.req.raw);
            const selectedAgent = requestedAgentId
                ? await params.resolveSelectedAgent(requestedAgentId)
                : null;
            const client = selectedAgent?.running === true
                ? params.agentRpcPool.resolveClientForAgent(selectedAgent)
                : null;
            const result = client
                ? await client.run_internal_plugin_action({
                    plugin_name: pluginName,
                    action_name: actionName,
                    payload: body?.payload,
                })
                : await runGlobalPluginAction({
                    pluginName,
                    actionName,
                    projectRoot: String(selectedAgent?.projectRoot || "").trim() || undefined,
                    payload: body?.payload,
                });
            return c.json({
                ...result,
                pluginName,
                actionName,
            }, result.success ? 200 : 400);
        }
        catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error),
            }, 500);
        }
    });
    app.post("/api/plugins/action", async (c) => {
        try {
            const body = await c.req.json().catch(() => null);
            const plugin_name = String(body?.pluginName || "").trim();
            const action_name = String(body?.actionName || "").trim();
            if (!plugin_name) {
                return c.json({ success: false, error: "pluginName is required" }, 400);
            }
            if (!action_name) {
                return c.json({ success: false, error: "actionName is required" }, 400);
            }
            const requested_agent_id = params.readRequestedAgentId(c.req.raw);
            const selected_agent = await params.resolveSelectedAgent(requested_agent_id);
            if (!selected_agent || selected_agent.running !== true) {
                return c.json({
                    success: false,
                    error: "No running agent found. Start one via `town agent start` first.",
                }, 503);
            }
            const client = params.agentRpcPool.resolveClientForAgent(selected_agent);
            if (!client) {
                return c.json({
                    success: false,
                    error: "Selected agent RPC endpoint is unavailable.",
                }, 503);
            }
            // 关键点（中文）：这里承接旧 `/api/plugins/action`，但通过 Agent RPC 执行，不再代理到 Agent HTTP。
            const result = await client.run_internal_plugin_action({
                plugin_name,
                action_name,
                payload: body?.payload,
            });
            return c.json({
                ...result,
                pluginName: plugin_name,
                actionName: action_name,
            }, result.success ? 200 : 400);
        }
        catch (error) {
            return c.json({
                success: false,
                error: getErrorMessage(error),
            }, 500);
        }
    });
}
//# sourceMappingURL=PluginApiRoutes.js.map