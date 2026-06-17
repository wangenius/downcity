/**
 * Hono 与 Node http server 的最小适配层。
 *
 * 关键点（中文）
 * - 该适配层只承担 fetch <-> Node http 的桥接。
 * - AgentHTTP 直接用它把 hono router 跑成独立 Node HTTP server。
 */

import http from "node:http";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { Hono } from "hono";

/**
 * 创建一个把 hono fetch 接到 node http 的 server。
 */
export function createNodeHttpServer(params: {
  /** 入口 Hono 应用。 */
  app: Hono;
  /** 监听主机。 */
  host: string;
  /** 监听端口。 */
  port: number;
}): http.Server {
  const { app, host, port } = params;
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      const method = req.method || "GET";
      const body_buffer = await read_request_body(req);
      const request = new Request(url.toString(), {
        method,
        headers: new Headers(req.headers as Record<string, string>),
        body: body_buffer.length > 0 ? body_buffer : undefined,
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
      const body_stream = Readable.fromWeb(
        response.body as unknown as globalThis.ReadableStream<Uint8Array>,
      );
      body_stream.pipe(res);
      await finished(body_stream).catch(() => undefined);
    } catch {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });
}

/**
 * 读取 Node 原生请求体。
 */
async function read_request_body(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
