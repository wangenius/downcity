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
import type { Hono as HonoType } from "hono";
import { createExecuteRouter } from "./http/execute/execute.js";
import { healthRouter } from "./http/health/health.js";
import { createPluginsRouter } from "./http/plugins/plugins.js";
import { createStaticRouter } from "./http/static/static.js";
import { createControlRouter } from "./http/control/ControlRouter.js";
import { createShellRouter } from "./http/shell/shell.js";
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { Shell } from "@downcity/shell";

/**
 * Agent HTTP 网关启动参数。
 */
export interface AgentHttpGatewayStartOptions {
  /** HTTP 服务监听端口。 */
  port: number;
  /** HTTP 服务监听主机。 */
  host: string;
  /** 当前 agent runtime 读取函数。 */
  getAgentRuntime: () => AgentRuntime;
  /** 当前 agent context 读取函数。 */
  getAgentContext: () => AgentContext;
  /** 可选 SDK transport 子路由（来自 `@downcity/server` 的 `AgentHTTP.router()`）。 */
  sdkRouter?: HonoType;
  /** 可选 Shell 绑定。 */
  getShell?: () => Shell | undefined;
}

/**
 * Agent HTTP 网关运行实例。
 */
export interface AgentHttpGatewayInstance {
  /** Hono 应用实例。 */
  app: Hono;
  /** 原生 HTTP Server 实例。 */
  server: http.Server;
  /** 停止当前服务。 */
  stop(): Promise<void>;
}

/**
 * 创建 Agent HTTP 网关 Hono 应用。
 */
export function createAgentHttpGatewayApp(
  options: Pick<
    AgentHttpGatewayStartOptions,
    "getAgentRuntime" | "getAgentContext" | "sdkRouter" | "getShell"
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

  // 关键点（中文）：HTTP 协议面由 Town 装配，Agent 只提供 runtime/context。
  app.route("/", createStaticRouter({
    getAgentRuntime: options.getAgentRuntime,
  }));
  app.route("/", healthRouter);
  app.route("/", createPluginsRouter({
    getAgentContext: options.getAgentContext,
  }));
  app.route("/", createShellRouter({
    getShell: () => options.getShell?.(),
  }));
  app.route("/", createExecuteRouter({
    getAgentRuntime: options.getAgentRuntime,
  }));
  app.route("/", createControlRouter({
    getAgentRuntime: options.getAgentRuntime,
    getAgentContext: options.getAgentContext,
  }));
  if (options.sdkRouter) {
    app.route("/", options.sdkRouter);
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
export async function startAgentHttpGateway(
  options: AgentHttpGatewayStartOptions,
): Promise<AgentHttpGatewayInstance> {
  const app = createAgentHttpGatewayApp(options);
  const server = createNodeServer(app, options);

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, () => {
      serverLogger.info(
        `🚀 Town Agent HTTP gateway started: http://${options.host}:${options.port}`,
      );
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
      serverLogger.info("Town Agent HTTP gateway stopped");
    },
  };
}

/**
 * 创建 Node HTTP Server 适配层。
 */
function createNodeServer(
  app: Hono,
  options: AgentHttpGatewayStartOptions,
): http.Server {
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
