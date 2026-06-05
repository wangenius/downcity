/**
 * PlatformApiRoutes：平台控制面 API 路由注册。
 *
 * 关键点（中文）
 * - 路由注册从 `ControlGateway` 宿主类中拆出，避免网关门面继续膨胀。
 * - 这里不持有状态，只消费宿主提供的 handlers。
 */
import { registerPlatformModelRoutes } from "@/town/gateway/api/ModelApiRoutes.js";
import { registerPlatformInstantRoutes } from "@/town/gateway/instant/InstantApiRoutes.js";
import { registerPlatformChannelAccountRoutes } from "@/town/gateway/api/ChannelAccountApiRoutes.js";
import { registerPlatformEnvRoutes } from "@/town/gateway/api/EnvApiRoutes.js";
import { registerPlatformAgentStatusRoutes } from "@/town/gateway/api/AgentStatusApiRoutes.js";
import { registerPlatformPluginRoutes } from "@/town/gateway/api/PluginApiRoutes.js";
import { registerDashboardTaskApiRoutes } from "@/town/gateway/api/DashboardTaskApiRoutes.js";
import { registerDashboardSessionApiRoutes } from "@/town/gateway/api/DashboardSessionApiRoutes.js";
import { registerDashboardOverviewApiRoutes } from "@/town/gateway/api/DashboardOverviewApiRoutes.js";
import { registerDashboardRuntimeApiRoutes } from "@/town/gateway/api/DashboardRuntimeApiRoutes.js";
import { buildPlatformWorkloadBlockPayload } from "@/town/gateway/GatewaySupport.js";
/**
 * 注册平台控制面 API 路由。
 */
export function registerPlatformApiRoutes(params) {
    const { app, handlers } = params;
    app.get("/health", async (c) => {
        return c.json({
            status: "ok",
            type: "console",
        });
    });
    app.get("/api/ui/agents", async (c) => {
        try {
            const requestedAgentId = handlers.readRequestedAgentId(c.req.raw);
            const payload = await handlers.buildAgentsResponse(requestedAgentId);
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/start", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const payload = await handlers.startAgentByProjectRoot(rawProject, {
                initializeIfNeeded: body.initializeIfNeeded === true,
                initialization: body.initialization,
            });
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/create", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const initResult = await handlers.initializeAgentProject(rawProject, {
                id: body.id,
                modelId: body.modelId,
                forceOverwriteShipJson: body.forceOverwriteShipJson,
            });
            if (body.autoStart === false) {
                return c.json({
                    success: true,
                    created: true,
                    started: false,
                    projectRoot: initResult.projectRoot,
                    id: initResult.id,
                    message: "created",
                });
            }
            const payload = await handlers.startAgentByProjectRoot(initResult.projectRoot);
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/system/pick-directory", async (c) => {
        try {
            const directoryPath = await handlers.pickDirectoryPath();
            return c.json({ success: true, directoryPath });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/inspect", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const inspection = await handlers.inspectAgentDirectory(rawProject);
            return c.json({ success: true, inspection });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/local-models", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            const payload = await handlers.listLocalModels(rawProject || undefined);
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/execution", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const payload = await handlers.updateAgentExecution(rawProject, {
                modelId: body.modelId,
            });
            return c.json({
                success: true,
                ...payload,
                restartRequired: true,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/restart", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const forceRestart = body.force === true;
            const checks = await handlers.inspectAgentRestartSafety(rawProject);
            const hasBlocking = checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
            if (hasBlocking && !forceRestart) {
                return c.json(buildPlatformWorkloadBlockPayload("restart", checks), 409);
            }
            const payload = await handlers.restartAgentByProjectRoot(rawProject);
            return c.json({
                ...payload,
                activeContexts: checks.activeContexts,
                activeTasks: checks.activeTasks,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/agents/stop", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const rawProject = String(body.projectRoot || body.agentId || "").trim();
            if (!rawProject) {
                return c.json({ success: false, error: "projectRoot is required" }, 400);
            }
            const forceStop = body.force === true;
            const checks = await handlers.inspectAgentRestartSafety(rawProject);
            const hasBlocking = checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
            if (hasBlocking && !forceStop) {
                return c.json(buildPlatformWorkloadBlockPayload("stop", checks), 409);
            }
            const payload = await handlers.stopAgentByProjectRoot(rawProject);
            return c.json({
                ...payload,
                activeContexts: checks.activeContexts,
                activeTasks: checks.activeTasks,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.get("/api/ui/config-status", async (c) => {
        try {
            const requestedAgentId = handlers.readRequestedAgentId(c.req.raw);
            const payload = await handlers.buildConfigStatusResponse(requestedAgentId);
            return c.json(payload);
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    app.post("/api/ui/command/execute", async (c) => {
        try {
            const body = (await c.req.json().catch(() => ({})));
            const requestedAgentId = String(body.agentId || handlers.readRequestedAgentId(c.req.raw) || "").trim();
            if (!requestedAgentId) {
                return c.json({ success: false, error: "agentId is required" }, 400);
            }
            const command = String(body.command || "").trim();
            if (!command) {
                return c.json({ success: false, error: "command is required" }, 400);
            }
            const selectedAgent = await handlers.resolveAgentById(requestedAgentId);
            if (!selectedAgent) {
                return c.json({
                    success: false,
                    error: "Agent not found in managed agent registry",
                }, 404);
            }
            const timeoutRaw = Number.parseInt(String(body.timeoutMs || ""), 10);
            const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
                ? Math.min(timeoutRaw, 120_000)
                : 45_000;
            const result = await handlers.executeShellCommand({
                command,
                cwd: selectedAgent.projectRoot,
                timeoutMs,
            });
            return c.json({
                success: true,
                agentId: selectedAgent.id,
                result,
            });
        }
        catch (error) {
            return c.json({ success: false, error: String(error) }, 500);
        }
    });
    registerPlatformModelRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        buildModelResponse: (requestedAgentId) => handlers.buildModelResponse(requestedAgentId),
    });
    registerPlatformInstantRoutes({
        app,
        resolveAgentById: (requestedAgentId) => handlers.resolveAgentById(requestedAgentId),
    });
    registerPlatformChannelAccountRoutes({ app });
    registerPlatformEnvRoutes({ app });
    registerPlatformAgentStatusRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    registerPlatformPluginRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    registerDashboardTaskApiRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    registerDashboardSessionApiRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    registerDashboardOverviewApiRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    registerDashboardRuntimeApiRoutes({
        app,
        readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
        resolveSelectedAgent: (requestedAgentId) => handlers.resolveSelectedAgent(requestedAgentId),
        agentRpcPool: handlers.agentRpcPool,
    });
    app.get("/*", async (c) => {
        const reqPath = String(c.req.path || "/");
        if (reqPath.startsWith("/api/")) {
            return c.json({ success: false, error: "Not Found" }, 404);
        }
        return handlers.serveFrontendPath(c, reqPath);
    });
}
//# sourceMappingURL=PlatformApiRoutes.js.map