/**
 * AgentServer：主 HTTP 服务入口。
 *
 * 分层约束（中文）
 * - server 负责编排与依赖注入，可调用 core / services。
 * - 不把 server 状态反向泄露给 service 业务层。
 * - 路由层只做协议适配，业务逻辑下沉到模块注册与调度器。
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { logger as server_logger } from "../../utils/logger/Logger.js";
import { withContextRequestContext } from "../../core/context/RequestContext.js";
import http from "node:http";
import fs from "fs-extra";
import path from "path";
import { getShipPublicDirPath } from "../project/Paths.js";
import type { ShipContextMetadataV1 } from "../../core/types/ContextMessage.js";
import {
  getServiceRuntimeState,
  getRuntimeState,
} from "./RuntimeState.js";
import { getProcessServiceBindings } from "../service/ServiceProcessBindings.js";
import {
  controlServiceRuntime,
  listServiceRuntimes,
  registerAllServicesForServer,
  runServiceCommand,
} from "../service/Registry.js";

/**
 * 启动参数。
 */
export interface StartOptions {
  port: number;
  host: string;
}

/**
 * AgentServer。
 *
 * 关键职责（中文）
 * - 注册公共中间件与基础路由。
 * - 注册 services 暴露的统一路由。
 * - 处理 `/api/execute` 的请求解析、上下文装配与调度调用。
 */
export class AgentServer {
  private app: Hono;
  private server: ReturnType<typeof import("http").createServer> | null = null;

  constructor() {
    this.app = new Hono();
    // Middleware
    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      }),
    );

    // Routes
    this.setupRoutes();
  }

  /**
   * 注册所有 HTTP 路由。
   *
   * 关键点（中文）
   * - 静态资源与 `.ship/public` 暴露路径分离。
   * - `registerAllServicesForServer` 是模块扩展主入口。
   * - `/api/execute` 负责把请求转为 context 任务并执行。
   */
  private setupRoutes(): void {
    // Static file service (frontend pages)
    this.app.get("/", async (c) => {
      const indexPath = path.join(
        getRuntimeState().rootPath,
        "public",
        "index.html",
      );
      if (await fs.pathExists(indexPath)) {
        const content = await fs.readFile(indexPath, "utf-8");
        return c.body(content, 200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
        });
      }
      return c.text("ShipMyAgent Agent Server", 200);
    });

    this.app.get("/styles.css", async (c) => {
      const cssPath = path.join(
        getRuntimeState().rootPath,
        "public",
        "styles.css",
      );
      if (await fs.pathExists(cssPath)) {
        const content = await fs.readFile(cssPath, "utf-8");
        return c.body(content, 200, {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-cache",
        });
      }
      return c.text("Not Found", 404);
    });

    this.app.get("/app.js", async (c) => {
      const jsPath = path.join(
        getRuntimeState().rootPath,
        "public",
        "app.js",
      );
      if (await fs.pathExists(jsPath)) {
        const content = await fs.readFile(jsPath, "utf-8");
        return c.body(content, 200, {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        });
      }
      return c.text("Not Found", 404);
    });

    // Public file service: `.ship/public/*` -> `/ship/public/*`
    this.app.get("/ship/public/*", async (c) => {
      const root = getShipPublicDirPath(getRuntimeState().rootPath);
      const prefix = "/ship/public/";
      const requestPath = c.req.path;
      const rel = requestPath.startsWith(prefix)
        ? requestPath.slice(prefix.length)
        : "";
      if (!rel) return c.text("Not Found", 404);

      const full = path.resolve(root, rel);
      const rootResolved = path.resolve(root);
      if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) {
        return c.text("Forbidden", 403);
      }

      try {
        const stat = await fs.stat(full);
        if (!stat.isFile()) return c.text("Not Found", 404);
      } catch {
        return c.text("Not Found", 404);
      }

      const ext = path.extname(full).toLowerCase();
      const contentType =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : ext === ".js"
              ? "application/javascript; charset=utf-8"
              : ext === ".json"
                ? "application/json; charset=utf-8"
                : ext === ".txt" || ext === ".md"
                  ? "text/plain; charset=utf-8"
                  : ext === ".pdf"
                    ? "application/pdf"
                    : ext === ".png"
                      ? "image/png"
                      : ext === ".jpg" || ext === ".jpeg"
                        ? "image/jpeg"
                        : "application/octet-stream";

      const buf = await fs.readFile(full);
      return c.body(buf, 200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });
    });

    // Health check
    this.app.get("/health", (c) => {
      return c.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Get Agent status
    this.app.get("/api/status", (c) => {
      return c.json({
        name: "shipmyagent",
        status: "running",
        timestamp: new Date().toISOString(),
      });
    });

    // service runtime list
    this.app.get("/api/services/list", (c) => {
      return c.json({
        success: true,
        services: listServiceRuntimes(),
      });
    });

    // service runtime control
    this.app.post("/api/services/control", async (c) => {
      let body: { serviceName?: string; action?: string } | null = null;
      try {
        body = (await c.req.json()) as { serviceName?: string; action?: string };
      } catch {
        return c.json({ success: false, error: "Invalid JSON body" }, 400);
      }

      const serviceName = String(body?.serviceName || "").trim();
      const action = String(body?.action || "").trim().toLowerCase();
      if (!serviceName) {
        return c.json({ success: false, error: "serviceName is required" }, 400);
      }
      if (!["start", "stop", "restart", "status"].includes(action)) {
        return c.json({ success: false, error: `Invalid action: ${action}` }, 400);
      }

      const result = await controlServiceRuntime({
        serviceName,
        action: action as "start" | "stop" | "restart" | "status",
        context: getServiceRuntimeState(),
      });
      return c.json(result, result.success ? 200 : 400);
    });

    // service command bridge
    this.app.post("/api/services/command", async (c) => {
      let body:
        | {
            serviceName?: string;
            command?: string;
            payload?: Record<string, string | number | boolean | null>;
          }
        | null = null;
      try {
        body = (await c.req.json()) as {
          serviceName?: string;
          command?: string;
          payload?: Record<string, string | number | boolean | null>;
        };
      } catch {
        return c.json({ success: false, error: "Invalid JSON body" }, 400);
      }

      const serviceName = String(body?.serviceName || "").trim();
      const command = String(body?.command || "").trim();
      if (!serviceName) {
        return c.json({ success: false, error: "serviceName is required" }, 400);
      }
      if (!command) {
        return c.json({ success: false, error: "command is required" }, 400);
      }

      const result = await runServiceCommand({
        serviceName,
        command,
        payload: body?.payload,
        context: getServiceRuntimeState(),
      });
      return c.json(result, result.success ? 200 : 400);
    });

    // 统一注册服务路由（chat / skill / task / future）
    registerAllServicesForServer(this.app, getServiceRuntimeState());

    // Execute instruction
    // `/api/execute` 分段流程（中文）
    // 1) 请求解析与参数校验
    // 2) context/request context 注入
    // 3) 执行结果提取与历史落盘
    // 4) 错误兜底与 HTTP 返回
    this.app.post("/api/execute", async (c) => {
      // [阶段1] 请求解析：读取 body 文本并做 JSON 解析。
      let bodyText;
      try {
        bodyText = await c.req.text();
      } catch {
        return c.json(
          { success: false, message: "Unable to read request body" },
          400,
        );
      }

      if (!bodyText) {
        return c.json(
          { success: false, message: "Request body is empty" },
          400,
        );
      }

      let body;
      try {
        body = JSON.parse(bodyText) as {
          instructions?: string;
          chatId?: string;
          userId?: string;
          actorId?: string;
          messageId?: string;
        };
      } catch {
        return c.json(
          {
            success: false,
            message: `JSON parse failed: ${bodyText.substring(0, 50)}...`,
          },
          400,
        );
      }

      // [阶段1] 参数归一化：将请求字段映射为内部统一变量。
      const instructions = body?.instructions;
      const chatId =
        typeof body?.chatId === "string" && body.chatId.trim()
          ? body.chatId.trim()
          : "default";
      const actorId =
        typeof body?.userId === "string" && body.userId.trim()
          ? body.userId.trim()
          : typeof body?.actorId === "string" && body.actorId.trim()
            ? body.actorId.trim()
            : "api";

      if (!instructions) {
        return c.json(
          { success: false, message: "Missing instructions field" },
          400,
        );
      }

      try {
        // [阶段2] 上下文注入：构造 contextId，并写入一条 user 消息到上下文消息。
        const contextId = `api:chat:${chatId}`;
        const runtime = getRuntimeState();
        const messageId =
          typeof body?.messageId === "string" ? body.messageId : undefined;
        await runtime.contextManager.appendUserMessage({
          channel: "api",
          targetId: chatId,
          contextId,
          actorId: actorId,
          messageId,
          text: String(instructions),
        });

        // [阶段2] 执行：在 withContextRequestContext 下运行 agent，保证下游可读取会话上下文。
        // API 场景同样会落盘 context messages，但它不是“平台消息回发”场景：
        // - 不提供 dispatcher 回发能力（响应通过 HTTP body 返回）
        const result = await withContextRequestContext(
          {
            contextId,
            targetId: chatId,
            actorId: actorId,
            messageId,
          },
          () =>
            runtime.contextManager.getAgent(contextId).run({
              contextId,
              query: instructions,
            }),
        );

        // [阶段3] 结果提取：优先拿 chat_send 的最终文本，其次回退到 message 文本。
        const userVisible =
          getProcessServiceBindings().pickLastSuccessfulChatSendText(
            result.assistantMessage,
          );
        try {
          // [阶段3] 上下文消息落盘：优先 append assistantMessage；缺失时生成文本消息兜底。
          const store = runtime.contextManager.getContextStore(contextId);
          const assistantMessage = result.assistantMessage;
          if (assistantMessage && typeof assistantMessage === "object") {
            await store.append(assistantMessage);
            void runtime.contextManager.afterContextUpdatedAsync(contextId);
          } else if (userVisible && userVisible.trim()) {
            const metadata: Omit<ShipContextMetadataV1, "v" | "ts"> = {
              contextId,
              channel: "api",
              targetId: chatId,
              actorId: "bot",
              messageId,
              extra: {
                via: "api_execute",
                note: "assistant_message_missing",
              },
            };
            await store.append(
              store.createAssistantTextMessage({
                text: userVisible,
                metadata,
                kind: "normal",
                source: "egress",
              }),
            );
            void runtime.contextManager.afterContextUpdatedAsync(contextId);
          }
        } catch {
          // ignore
        }

        return c.json(result);
      } catch (error) {
        // [阶段4] 错误兜底：统一返回 500 + 可读错误文本。
        return c.json({ success: false, message: String(error) }, 500);
      }
    });
  }

  /**
   * 启动 HTTP 服务。
   */
  async start(options: StartOptions): Promise<void> {
    const { port, host } = options;

    // Start server
    return new Promise((resolve) => {
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || "/", `http://${host}:${port}`);
          const method = req.method || "GET";

          // Collect body
          const bodyBuffer = await new Promise<Buffer>((resolveBody, reject) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => resolveBody(Buffer.concat(chunks)));
            req.on("error", reject);
          });

          // Create a simple request adapter
          const request = new Request(url.toString(), {
            method,
            headers: new Headers(req.headers as Record<string, string>),
            body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
          });

          const response = await this.app.fetch(request);

          // Convert Response to HTTP response
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

      this.server = server;
      server.listen(port, host, () => {
        server_logger.info(`🚀 Agent Server started: http://${host}:${port}`);
        server_logger.info("Available APIs:");
        server_logger.info("  GET  /health - Health check");
        server_logger.info("  GET  /api/status - Agent status");
        server_logger.info("  GET  /api/services/list - Service runtime list");
        server_logger.info("  POST /api/services/control - Service runtime control");
        server_logger.info("  POST /api/services/command - Service command bridge");
        server_logger.info("  POST /api/execute - Execute instruction");
        server_logger.info("  POST /api/chat/send - Chat service");
        server_logger.info("  POST /api/skill/load - Skill service");
        server_logger.info("  POST /api/task/create - Task service");
        resolve();
      });
    });
  }

  /**
   * 停止 HTTP 服务。
   */
  async stop(): Promise<void> {
    if (this.server) {
      await server_logger.saveAllLogs();
      this.server.close();
      server_logger.info("Agent Server stopped");
    }
  }

  getApp(): Hono {
    return this.app;
  }
}
