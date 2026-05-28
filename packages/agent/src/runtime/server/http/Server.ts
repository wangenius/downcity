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
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { logger as serverLogger } from "@/utils/logger/Logger.js";
import { createExecuteRouter } from "@/runtime/server/http/execute/execute.js";
import { healthRouter } from "@/runtime/server/http/health/health.js";
import { createPluginsRouter } from "@/runtime/server/http/plugins/plugins.js";
import { createStaticRouter } from "@/runtime/server/http/static/static.js";
import { createControlRouter } from "@/runtime/server/http/control/ControlRouter.js";
import { createSdkRouter } from "@/runtime/server/http/sdk/Router.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentSessionCollection } from "@/sdk/AgentSdkTypes.js";

/**
 * Server 启动参数。
 */
export interface ServerStartOptions {
  /** HTTP 服务监听端口。 */
  port: number;
  /** HTTP 服务监听主机。 */
  host: string;
  /** 当前 agent runtime 读取函数。 */
  getAgentRuntime: () => AgentRuntime;
  /** 当前 agent context 读取函数。 */
  getAgentContext: () => AgentContext;
  /** 可选 SDK Session 集合绑定。 */
  sessionCollection?: AgentSessionCollection;
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
export function createServerApp(
  options: Pick<
    ServerStartOptions,
    "getAgentRuntime" | "getAgentContext" | "sessionCollection"
  >,
): Hono {
  const app = new Hono();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // 关键点（中文）：按路由域挂载，server 模块只保留装配职责。
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
 * 启动主 HTTP 服务。
 */
export async function startServer(
  options: ServerStartOptions,
): Promise<ServerInstance> {
  const app = createServerApp(options);
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
      if (!response.body) {
        res.end();
        return;
      }
      const bodyStream = Readable.fromWeb(
        response.body as unknown as globalThis.ReadableStream<Uint8Array>,
      );
      bodyStream.pipe(res);
      await finished(bodyStream).catch(() => undefined);
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
