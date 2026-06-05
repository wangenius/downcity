/**
 * AgentHttpGateway：Town 托管的 Agent HTTP 网关。
 *
 * 职责说明（中文）
 * - 由 `town agent start` 启动 HTTP 入口，对外承载控制面、plugin 与 SDK HTTP 路由。
 * - Agent 进程本体只暴露本机 RPC；HTTP server 生命周期归 Town CLI 管理。
 * - HTTP route 实现放在 Town 内部，Agent 只提供 runtime/context/sessionCollection。
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { logger as serverLogger } from "@downcity/agent/internal/utils/logger/Logger.js";
import { createExecuteRouter } from "./http/execute/execute.js";
import { healthRouter } from "./http/health/health.js";
import { createPluginsRouter } from "./http/plugins/plugins.js";
import { createStaticRouter } from "./http/static/static.js";
import { createControlRouter } from "./http/control/ControlRouter.js";
import { createSdkRouter } from "./http/sdk/Router.js";
/**
 * 创建 Agent HTTP 网关 Hono 应用。
 */
export function createAgentHttpGatewayApp(options) {
    const app = new Hono();
    app.use("*", logger());
    app.use("*", cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
    }));
    // 关键点（中文）：HTTP 协议面由 Town 装配，Agent 只提供 runtime/context。
    app.route("/", createStaticRouter({
        getAgentRuntime: options.getAgentRuntime,
    }));
    app.route("/", healthRouter);
    app.route("/", createPluginsRouter({
        getAgentContext: options.getAgentContext,
    }));
    app.route("/", createExecuteRouter({
        getAgentRuntime: options.getAgentRuntime,
    }));
    app.route("/", createControlRouter({
        getAgentRuntime: options.getAgentRuntime,
        getAgentContext: options.getAgentContext,
    }));
    if (options.sessionCollection) {
        app.route("/", createSdkRouter(options.sessionCollection));
    }
    for (const plugin of options.getAgentContext().agent.pluginInstances.values()) {
        plugin.http?.server?.register({
            app,
            getContext: options.getAgentContext,
            pluginName: plugin.name,
        });
    }
    return app;
}
/**
 * 启动 Town 托管的 Agent HTTP 网关。
 */
export async function startAgentHttpGateway(options) {
    const app = createAgentHttpGatewayApp(options);
    const server = createNodeServer(app, options);
    await new Promise((resolve) => {
        server.listen(options.port, options.host, () => {
            serverLogger.info(`🚀 Town Agent HTTP gateway started: http://${options.host}:${options.port}`);
            resolve();
        });
    });
    return {
        app,
        server,
        async stop() {
            await serverLogger.saveAllLogs();
            await new Promise((resolve) => {
                server.close(() => resolve());
            });
            serverLogger.info("Town Agent HTTP gateway stopped");
        },
    };
}
/**
 * 创建 Node HTTP Server 适配层。
 */
function createNodeServer(app, options) {
    return http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || "/", `http://${options.host}:${options.port}`);
            const method = req.method || "GET";
            const bodyBuffer = await readRequestBody(req);
            const request = new Request(url.toString(), {
                method,
                headers: new Headers(req.headers),
                body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
            });
            const response = await app.fetch(request);
            res.statusCode = response.status;
            for (const [key, value] of response.headers.entries()) {
                res.setHeader(key, value);
            }
            if (!response.body) {
                res.end();
                return;
            }
            const bodyStream = Readable.fromWeb(response.body);
            bodyStream.pipe(res);
            await finished(bodyStream).catch(() => undefined);
        }
        catch {
            res.statusCode = 500;
            res.end("Internal Server Error");
        }
    });
}
/**
 * 读取原生请求体。
 */
async function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}
//# sourceMappingURL=AgentHttpGateway.js.map