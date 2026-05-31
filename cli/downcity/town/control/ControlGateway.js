/**
 * 控制面网关。
 *
 * 关键点（中文）
 * - UI 由控制面进程独立托管，不依赖单个 agent 启动参数。
 * - 提供统一的多 agent 选择能力，并把 `/api/*` 代理到选中 agent。
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "url";
import { registerPlatformApiRoutes } from "../control/PlatformApiRoutes.js";
import { buildPlatformAgentsResponse, buildPlatformConfigStatusResponse, buildPlatformModelResponse, inspectPlatformAgentDirectory, listKnownPlatformAgents, readPlatformConfigFileStatus, readRequestedPlatformAgentId, resolvePlatformAgentById, resolveSelectedPlatformAgent, } from "../control/gateway/AgentCatalog.js";
import { executeAgentProjectShellCommand, initializePlatformAgentProject, inspectManagedAgentRestartSafety, pickPlatformAgentDirectoryPath, restartManagedAgentByProjectRoot, startManagedAgentByProjectRoot, stopManagedAgentByProjectRoot, updatePlatformAgentExecution, } from "../control/gateway/AgentActions.js";
import { serveControlPlaneFrontendPath } from "../control/gateway/FrontendAssets.js";
import { buildPlatformUpstreamUrl, forwardPlatformRequest, } from "../control/gateway/Proxy.js";
import { listPluginAuthPolicies } from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { AuthService } from "../http/auth/AuthService.js";
import { registerAuthRoutes } from "../http/auth/AuthRoutes.js";
import { CONTROL_PLANE_AUTH_ROUTE_POLICIES, createRouteAuthGuardMiddleware, } from "../http/auth/RoutePolicy.js";
import { resolveTownCliPath } from "../shared/TownCliPath.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * 当前 DC 版本号（用于 control plane overview 显示）。
 */
const DC_VERSION = (() => {
    const candidate_package_paths = [
        // 关键点（中文）：downcity 聚合包复制后的 town runtime 位于 `<pkg>/town/control`。
        path.join(__dirname, "../package.json"),
        // 关键点（中文）：workspace 内部包构建后位于 `cli/town/bin/control`。
        path.join(__dirname, "../../package.json"),
    ];
    for (const package_path of candidate_package_paths) {
        try {
            const pkg = fs.readJsonSync(package_path);
            const version = String(pkg?.version || "").trim();
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
 * 控制面网关。
 */
export class ControlGateway {
    app;
    server = null;
    publicDir;
    authService;
    constructor() {
        // 关键点（中文）：Console UI 构建产物随 Town CLI 一起托管，聚合包会复制到对应 public 目录。
        this.publicDir = path.join(__dirname, "../../public");
        this.app = new Hono();
        this.authService = new AuthService();
        this.app.use("*", logger());
        this.app.use("*", cors({
            origin: "*",
            allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            allowHeaders: ["Content-Type", "Authorization", "X-Town-Agent"],
        }));
        this.app.use("*", createRouteAuthGuardMiddleware(this.authService, [
            ...CONTROL_PLANE_AUTH_ROUTE_POLICIES,
            ...listPluginAuthPolicies(createBuiltinPlugins()),
        ]));
        this.setupRoutes();
    }
    /**
     * 注册网关路由。
     */
    setupRoutes() {
        registerAuthRoutes({
            app: this.app,
            authService: this.authService,
        });
        registerPlatformApiRoutes({
            app: this.app,
            handlers: {
                readRequestedAgentId: (request) => this.readRequestedAgentId(request),
                buildAgentsResponse: (requestedAgentId) => this.buildAgentsResponse(requestedAgentId),
                initializeAgentProject: (projectRoot, initialization) => this.initializeAgentProject(projectRoot, initialization),
                startAgentByProjectRoot: (projectRoot, options) => this.startAgentByProjectRoot(projectRoot, options),
                updateAgentExecution: (projectRoot, input) => this.updateAgentExecution(projectRoot, input),
                pickDirectoryPath: () => this.pickDirectoryPath(),
                inspectAgentDirectory: (projectRoot) => this.inspectAgentDirectory(projectRoot),
                listLocalModels: (projectRoot) => this.listLocalModels(projectRoot),
                inspectAgentRestartSafety: (projectRoot) => this.inspectAgentRestartSafety(projectRoot),
                restartAgentByProjectRoot: (projectRoot) => this.restartAgentByProjectRoot(projectRoot),
                stopAgentByProjectRoot: (projectRoot) => this.stopAgentByProjectRoot(projectRoot),
                buildConfigStatusResponse: (requestedAgentId) => this.buildConfigStatusResponse(requestedAgentId),
                resolveAgentById: (requestedAgentId) => this.resolveAgentById(requestedAgentId),
                executeShellCommand: (args) => this.executeShellCommand(args),
                buildModelResponse: (requestedAgentId) => this.buildModelResponse(requestedAgentId),
                resolveSelectedAgent: (requestedAgentId) => this.resolveSelectedAgent(requestedAgentId),
                buildUpstreamUrl: (requestUrl, baseUrl) => this.buildUpstreamUrl(requestUrl, baseUrl),
                forwardRequest: (request, upstreamUrl) => this.forwardRequest(request, upstreamUrl),
                serveFrontendPath: (c, reqPath) => this.serveFrontendPath(c, reqPath),
            },
        });
    }
    readRequestedAgentId(request) {
        return readRequestedPlatformAgentId(request);
    }
    async pickDirectoryPath() {
        return pickPlatformAgentDirectoryPath();
    }
    async listKnownAgents() {
        return listKnownPlatformAgents();
    }
    async buildAgentsResponse(requestedAgentId) {
        return buildPlatformAgentsResponse({
            requestedAgentId,
            cityVersion: DC_VERSION,
        });
    }
    /**
     * 构建 Global Model 面板响应。
     *
     * 关键点（中文）
     * - 模型池来自控制面全局 SQLite，而不是某个 agent。
     * - `agentPrimaryModelId` 仅用于展示当前选中 agent 的项目绑定。
     */
    async buildModelResponse(requestedAgentId) {
        return buildPlatformModelResponse({
            requestedAgentId,
            cityVersion: DC_VERSION,
        });
    }
    /**
     * 读取单个配置文件状态。
     *
     * 关键点（中文）
     * - 不抛出异常，统一返回 `status/reason` 便于 UI 汇总展示。
     * - 使用最小探测维度：存在性、文件类型、可读性、大小、修改时间。
     */
    async readConfigFileStatus(params) {
        return readPlatformConfigFileStatus(params);
    }
    /**
     * 构建配置文件状态响应。
     *
     * 关键点（中文）
     * - `platform` 维度始终返回。
     * - `agent` 维度仅在存在选中 agent 时返回，避免误导。
     */
    async buildConfigStatusResponse(requestedAgentId) {
        return buildPlatformConfigStatusResponse({
            requestedAgentId,
            cityVersion: DC_VERSION,
        });
    }
    async resolveSelectedAgent(requestedAgentId) {
        return resolveSelectedPlatformAgent(requestedAgentId, DC_VERSION);
    }
    /**
     * 根据 id 查找 agent（允许离线 agent，用于 command 页面）。
     */
    async resolveAgentById(requestedAgentId) {
        return resolvePlatformAgentById(requestedAgentId);
    }
    /**
     * 探测目录状态，用于“打开文件夹”流程。
     */
    async inspectAgentDirectory(projectRoot) {
        return inspectPlatformAgentDirectory(projectRoot);
    }
    /**
     * 列出可直接用于 local executor 的本地 GGUF 模型。
     */
    async listLocalModels(projectRoot) {
        return { success: true, modelsDir: "~/.models", models: [] };
    }
    /**
     * 在 agent 项目目录中执行 shell 命令。
     *
     * 关键点（中文）
     * - 默认 shell 使用 zsh，保持与 CLI 使用习惯一致。
     * - 输出做大小限制，避免单次命令把 UI 网关进程内存打满。
     */
    async executeShellCommand(params) {
        return executeAgentProjectShellCommand(params);
    }
    async initializeAgentProject(projectRoot, initialization) {
        return initializePlatformAgentProject({
            projectRoot,
            id: initialization.id,
            modelId: initialization.modelId,
            forceOverwriteShipJson: initialization.forceOverwriteShipJson,
        });
    }
    async startAgentByProjectRoot(projectRoot, options) {
        return startManagedAgentByProjectRoot({
            projectRoot,
            cliPath: resolveTownCliPath(),
            initializeIfNeeded: options?.initializeIfNeeded,
            initialization: options?.initialization,
        });
    }
    async updateAgentExecution(projectRoot, input) {
        return updatePlatformAgentExecution({
            projectRoot,
            modelId: input.modelId,
        });
    }
    async inspectAgentRestartSafety(projectRoot) {
        return inspectManagedAgentRestartSafety({
            projectRoot,
            listKnownAgents: () => this.listKnownAgents(),
        });
    }
    async restartAgentByProjectRoot(projectRoot) {
        return restartManagedAgentByProjectRoot({
            projectRoot,
            cliPath: resolveTownCliPath(),
        });
    }
    async stopAgentByProjectRoot(projectRoot) {
        return stopManagedAgentByProjectRoot(projectRoot);
    }
    buildUpstreamUrl(requestUrl, baseUrl) {
        return buildPlatformUpstreamUrl(requestUrl, baseUrl);
    }
    async forwardRequest(request, upstreamUrl) {
        return forwardPlatformRequest(request, upstreamUrl);
    }
    async serveFrontendPath(c, reqPath) {
        return serveControlPlaneFrontendPath({
            context: c,
            publicDir: this.publicDir,
            requestPath: reqPath,
        });
    }
    /**
     * 启动 UI 网关。
     */
    async start(options) {
        const { port, host } = options;
        await new Promise((resolve) => {
            const server = http.createServer(async (req, res) => {
                try {
                    const url = new URL(req.url || "/", `http://${host}:${port}`);
                    const method = req.method || "GET";
                    const bodyBuffer = await new Promise((onDone, onError) => {
                        const chunks = [];
                        req.on("data", (chunk) => chunks.push(chunk));
                        req.on("end", () => onDone(Buffer.concat(chunks)));
                        req.on("error", onError);
                    });
                    const request = new Request(url.toString(), {
                        method,
                        headers: new Headers(req.headers),
                        body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
                    });
                    const response = await this.app.fetch(request);
                    res.statusCode = response.status;
                    for (const [key, value] of response.headers.entries()) {
                        res.setHeader(key, value);
                    }
                    const output = Buffer.from(await response.arrayBuffer());
                    res.end(output);
                }
                catch {
                    res.statusCode = 500;
                    res.end("Internal Server Error");
                }
            });
            this.server = server;
            server.listen(port, host, () => resolve());
        });
    }
    /**
     * 停止 UI 网关。
     */
    async stop() {
        if (!this.server)
            return;
        const server = this.server;
        this.server = null;
        await new Promise((resolve) => {
            server.close(() => resolve());
        });
    }
}
export function createControlGateway() {
    return new ControlGateway();
}
//# sourceMappingURL=ControlGateway.js.map