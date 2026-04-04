/**
 * Agent HTTP Server 装配模块。
 *
 * 职责说明：
 * 1. 创建主 Hono 应用并挂载各路由模块。
 * 2. 管理 Node HTTP Server 的启动与停止。
 * 3. 保持 server 层只做协议装配，不混入具体路由实现。
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import { logger as serverLogger } from "@shared/utils/logger/Logger.js";
import { executeRouter } from "@/city/modules/http/execute/execute.js";
import { healthRouter } from "@/city/modules/http/health/health.js";
import {
  ensureServiceActionRoutesRegistered,
  servicesRouter,
} from "@/city/modules/http/services/services.js";
import { pluginsRouter } from "@/city/modules/http/plugins/plugins.js";
import { staticRouter } from "@/city/modules/http/static/static.js";
import { dashboardRouter } from "@/city/modules/http/dashboard/Router.js";
import { registerAuthRoutes } from "@city/runtime/auth/AuthRoutes.js";
import { AuthService } from "@city/runtime/auth/AuthService.js";
import { createRouteAuthGuardMiddleware } from "@city/runtime/auth/RoutePolicy.js";

/**
 * Server 启动参数。
 */
export interface ServerStartOptions {
  /** HTTP 服务监听端口。 */
  port: number;
  /** HTTP 服务监听主机。 */
  host: string;
}

/**
 * Server 运行实例。
 */
export interface ServerInstance {
  /** Hono 应用实例。 */
  app: Hono;
  /** 原生 HTTP Server 实例。 */
  server: http.Server;
  /** 停止当前服务。 */
  stop(): Promise<void>;
}

/**
 * 创建主 Hono 应用。
 */
export function createServerApp(): Hono {
  const app = new Hono();
  const authService = new AuthService();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use("*", createRouteAuthGuardMiddleware(authService));

  // 关键点（中文）：service action 路由在 runtime ready 后再注册，避免命令级 import 副作用。
  ensureServiceActionRoutesRegistered();

  // 关键点（中文）：按路由域挂载，server 模块只保留装配职责。
  app.route("/", staticRouter);
  app.route("/", healthRouter);
  app.route("/", servicesRouter);
  app.route("/", pluginsRouter);
  app.route("/", executeRouter);
  app.route("/", dashboardRouter);
  registerAuthRoutes({ app, authService });

  return app;
}

/**
 * 启动主 HTTP 服务。
 */
export async function startServer(
  options: ServerStartOptions,
): Promise<ServerInstance> {
  const app = createServerApp();
  const server = createNodeServer(app, options);

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => {
      serverLogger.info(
        `🚀 Agent Server started: http://${options.host}:${options.port}`,
      );
      serverLogger.info("Available APIs:");
      resolve();
    });
  });

  return {
    app,
    server,
    async stop(): Promise<void> {
      await serverLogger.saveAllLogs();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      serverLogger.info("Agent Server stopped");
    },
  };
}

/**
 * 创建 Node HTTP Server 适配层。
 */
function createNodeServer(app: Hono, options: ServerStartOptions): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${options.host}:${options.port}`);
      const method = req.method || "GET";
      const bodyBuffer = await readRequestBody(req);
      const request = new Request(url.toString(), {
        method,
        headers: new Headers(req.headers as Record<string, string>),
        body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
      });

      const response = await app.fetch(request);
      res.statusCode = response.status;
      for (const [key, value] of response.headers.entries()) {
        res.setHeader(key, value);
      }
      const body = await response.text();
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
}

/**
 * 读取原生请求体。
 */
async function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
