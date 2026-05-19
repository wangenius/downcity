/**
 * SDK HTTP Server。
 *
 * 关键点（中文）
 * - 面向 `RemoteAgent` 暴露最小 session 能力集合。
 * - v1 先聚焦 session 创建、列表、history、run、stream、fork。
 */

import http from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Agent } from "@/sdk/Agent.js";

type SdkHttpStartOptions = {
  /**
   * 监听主机。
   */
  host?: string;

  /**
   * 监听端口。
   */
  port?: number;
};

/**
 * SDK HTTP Server 管理器。
 */
export class SdkAgentHttpServer {
  private readonly agent: Agent;
  private server: http.Server | null = null;
  private baseUrlValue: string | null = null;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * 启动 HTTP Server。
   */
  async start(options?: SdkHttpStartOptions): Promise<{ baseUrl: string }> {
    if (this.server && this.baseUrlValue) {
      return { baseUrl: this.baseUrlValue };
    }
    await this.agent.ensureServicesStarted();
    const host = String(options?.host || "127.0.0.1").trim() || "127.0.0.1";
    const port =
      typeof options?.port === "number" && Number.isInteger(options.port)
        ? options.port
        : 15314;

    const app = new Hono();
    app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"],
      }),
    );

    app.get("/api/sdk/sessions", async (c) => {
      return c.json({
        success: true,
        sessions: await this.agent.sessions(),
      });
    });

    app.post("/api/sdk/sessions", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const session = await this.agent.session(
        typeof body?.sessionId === "string" ? body.sessionId : undefined,
      );
      return c.json({
        success: true,
        session: await session.toMetadata(),
      });
    });

    app.get("/api/sdk/sessions/:sessionId/messages", async (c) => {
      const session = await this.agent.session(String(c.req.param("sessionId") || ""));
      return c.json({
        success: true,
        sessionId: session.id,
        messages: await session.history(),
      });
    });

    app.post("/api/sdk/sessions/:sessionId/run", async (c) => {
      const session = await this.agent.session(String(c.req.param("sessionId") || ""));
      const body = await c.req.json().catch(() => ({}));
      const query = String(body?.query || "").trim();
      if (!query) {
        return c.json({ success: false, error: "query is required" }, 400);
      }
      const result = await session.run({ query });
      return c.json({
        success: true,
        sessionId: session.id,
        result,
      });
    });

    app.post("/api/sdk/sessions/:sessionId/fork", async (c) => {
      const session = await this.agent.session(String(c.req.param("sessionId") || ""));
      const body = await c.req.json().catch(() => ({}));
      const forked = await session.fork(
        typeof body?.messageId === "string" ? body.messageId : undefined,
      );
      return c.json({
        success: true,
        session: await forked.toMetadata(),
      });
    });

    app.post("/api/sdk/sessions/:sessionId/stream", async (c) => {
      const session = await this.agent.session(String(c.req.param("sessionId") || ""));
      const body = await c.req.json().catch(() => ({}));
      const query = String(body?.query || "").trim();
      if (!query) {
        return c.json({ success: false, error: "query is required" }, 400);
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          try {
            for await (const event of session.stream({ query })) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify(event)}\n`),
              );
            }
            controller.close();
          } catch (error) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  error: error instanceof Error ? error.message : String(error),
                })}\n`,
              ),
            );
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    });

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://${host}:${port}`);
        const method = req.method || "GET";
        const bodyBuffer = await this.readRequestBody(req);
        const request = new Request(url.toString(), {
          method,
          headers: new Headers(req.headers as Record<string, string>),
          body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
        });
        const response = await app.fetch(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        if (!response.body) {
          res.end();
          return;
        }
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) res.write(Buffer.from(value));
        }
        res.end();
      } catch (error) {
        res.statusCode = 500;
        res.end(String(error));
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(port, host, () => resolve());
    });

    this.server = server;
    this.baseUrlValue = `http://${host}:${port}`;
    return {
      baseUrl: this.baseUrlValue,
    };
  }

  /**
   * 停止 HTTP Server。
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    const current = this.server;
    this.server = null;
    this.baseUrlValue = null;
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }

  private async readRequestBody(
    req: http.IncomingMessage,
  ): Promise<Buffer> {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
}
