/**
 * Console UI 网关。
 *
 * 关键点（中文）
 * - UI 由 console 进程独立托管，不依赖单个 agent 启动参数。
 * - 提供统一的多 agent 选择能力，并把 `/api/*` 代理到选中 agent runtime。
 */

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";
import { basename } from "node:path";
import { fileURLToPath } from "url";
import {
  getDaemonLogPath,
  getDaemonMetaPath,
  isProcessAlive,
  readDaemonPid,
} from "@/console/daemon/Manager.js";
import { getShipJsonPath } from "@/console/env/Paths.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
} from "@/types/ConsoleUI.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RUNTIME_PORT = 3000;
const DEFAULT_RUNTIME_HOST = "127.0.0.1";

type DaemonMetaLike = {
  args?: unknown;
};

type ShipJsonLike = {
  name?: unknown;
  start?: {
    host?: unknown;
    port?: unknown;
  };
};

/**
 * Console UI 启动参数。
 */
export interface ConsoleUiGatewayStartOptions {
  /**
   * UI 监听端口。
   */
  port: number;

  /**
   * UI 监听主机。
   */
  host: string;
}

/**
 * Console UI 网关。
 */
export class ConsoleUIGateway {
  private app: Hono;
  private server: ReturnType<typeof http.createServer> | null = null;
  private readonly publicDir: string;

  constructor() {
    // 关键点（中文）：src/console/ui 与 bin/console/ui 都回退到 package/public。
    this.publicDir = path.join(__dirname, "../../../public");
    this.app = new Hono();

    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-SMA-Agent"],
      }),
    );

    this.setupRoutes();
  }

  /**
   * 注册网关路由。
   */
  private setupRoutes(): void {
    this.app.get("/", async (c) => {
      return this.serveStatic(c, "index.html", "text/html; charset=utf-8");
    });
    this.app.get("/styles.css", async (c) => {
      return this.serveStatic(c, "styles.css", "text/css; charset=utf-8");
    });
    this.app.get("/app.js", async (c) => {
      return this.serveStatic(
        c,
        "app.js",
        "application/javascript; charset=utf-8",
      );
    });

    this.app.get("/health", async (c) => {
      return c.json({
        status: "ok",
        type: "console-ui",
      });
    });

    this.app.get("/api/ui/agents", async (c) => {
      try {
        const requestedAgentId = this.readRequestedAgentId(c.req.raw);
        const payload = await this.buildAgentsResponse(requestedAgentId);
        return c.json(payload);
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    // 关键点（中文）：除 `/api/ui/*` 外，其他 API 一律透传到“当前选中 agent”。
    this.app.all("/api/*", async (c) => {
      try {
        const reqUrl = new URL(c.req.url);
        if (reqUrl.pathname.startsWith("/api/ui/")) {
          return c.json({ success: false, error: "Not Found" }, 404);
        }

        const requestedAgentId = this.readRequestedAgentId(c.req.raw);
        const selection = await this.resolveSelectedAgent(requestedAgentId);
        if (!selection) {
          return c.json(
            {
              success: false,
              error:
                "No running agent found. Start one via `sma agent on` first.",
            },
            503,
          );
        }

        const upstreamUrl = this.buildUpstreamUrl(reqUrl, selection.baseUrl);
        const response = await this.forwardRequest(c.req.raw, upstreamUrl);
        return response;
      } catch (error) {
        return c.json(
          {
            success: false,
            error: `Proxy request failed: ${String(error)}`,
          },
          500,
        );
      }
    });
  }

  private async serveStatic(
    c: Context,
    filename: string,
    contentType: string,
  ): Promise<Response> {
    const filePath = path.join(this.publicDir, filename);
    if (!(await fs.pathExists(filePath))) {
      return c.text("Not Found", 404);
    }
    const content = await fs.readFile(filePath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
  }

  private readRequestedAgentId(request: Request): string {
    const reqUrl = new URL(request.url);
    const queryAgent = String(reqUrl.searchParams.get("agent") || "").trim();
    if (queryAgent) return queryAgent;
    const headerAgent = String(
      request.headers.get("x-sma-agent") || "",
    ).trim();
    if (headerAgent) return headerAgent;
    return "";
  }

  private normalizeHost(input: unknown): string | undefined {
    const value = typeof input === "string" ? input.trim() : "";
    if (!value) return undefined;
    if (value === "0.0.0.0" || value === "::") return "127.0.0.1";
    return value;
  }

  private normalizePort(input: unknown): number | undefined {
    const raw =
      typeof input === "number"
        ? input
        : Number.parseInt(String(input || "").trim(), 10);
    if (!Number.isFinite(raw) || Number.isNaN(raw)) return undefined;
    if (!Number.isInteger(raw) || raw < 1 || raw > 65535) return undefined;
    return raw;
  }

  private pickArgValue(args: string[], flag: string): string | undefined {
    const idx = args.findIndex((item) => item === flag);
    if (idx < 0) return undefined;
    const next = String(args[idx + 1] || "").trim();
    return next || undefined;
  }

  private async resolveRuntimeEndpoint(projectRoot: string): Promise<{
    host: string;
    port: number;
  }> {
    let configHost: string | undefined;
    let configPort: number | undefined;
    let daemonArgHost: string | undefined;
    let daemonArgPort: number | undefined;

    try {
      const shipPath = getShipJsonPath(projectRoot);
      if (await fs.pathExists(shipPath)) {
        const ship = (await fs.readJson(shipPath)) as ShipJsonLike;
        configHost = this.normalizeHost(ship?.start?.host);
        configPort = this.normalizePort(ship?.start?.port);
      }
    } catch {
      // ignore ship parse errors
    }

    try {
      const metaPath = getDaemonMetaPath(projectRoot);
      if (await fs.pathExists(metaPath)) {
        const meta = (await fs.readJson(metaPath)) as DaemonMetaLike;
        const args = Array.isArray(meta.args)
          ? meta.args.map((x) => String(x))
          : [];
        daemonArgHost = this.normalizeHost(this.pickArgValue(args, "--host"));
        daemonArgPort = this.normalizePort(this.pickArgValue(args, "--port"));
      }
    } catch {
      // ignore meta parse errors
    }

    return {
      host: daemonArgHost || configHost || DEFAULT_RUNTIME_HOST,
      port: daemonArgPort || configPort || DEFAULT_RUNTIME_PORT,
    };
  }

  private async buildAgentOption(projectRoot: string, startedAt: string, updatedAt: string): Promise<ConsoleUiAgentOption | null> {
    const daemonPid = await readDaemonPid(projectRoot);
    if (!daemonPid || !isProcessAlive(daemonPid)) {
      return null;
    }

    const endpoint = await this.resolveRuntimeEndpoint(projectRoot);

    let displayName = basename(projectRoot);
    try {
      const shipPath = getShipJsonPath(projectRoot);
      if (await fs.pathExists(shipPath)) {
        const ship = (await fs.readJson(shipPath)) as ShipJsonLike;
        const name = String(ship?.name || "").trim();
        if (name) displayName = name;
      }
    } catch {
      // ignore
    }

    return {
      id: projectRoot,
      name: displayName,
      projectRoot,
      running: true,
      host: endpoint.host,
      port: endpoint.port,
      baseUrl: `http://${endpoint.host}:${endpoint.port}`,
      startedAt,
      updatedAt,
      daemonPid,
      logPath: getDaemonLogPath(projectRoot),
    };
  }

  private async listRunningAgents(): Promise<ConsoleUiAgentOption[]> {
    const entries = await listConsoleAgents();
    const agents: ConsoleUiAgentOption[] = [];

    for (const entry of entries) {
      const projectRoot = path.resolve(String(entry.projectRoot || "").trim());
      if (!projectRoot) continue;
      const option = await this.buildAgentOption(
        projectRoot,
        String(entry.startedAt || ""),
        String(entry.updatedAt || ""),
      );
      if (!option) continue;
      agents.push(option);
    }

    return agents.sort((a, b) => a.name.localeCompare(b.name));
  }

  private selectAgentId(
    agents: ConsoleUiAgentOption[],
    requestedAgentId: string,
  ): string {
    const requested = String(requestedAgentId || "").trim();
    if (requested && agents.some((agent) => agent.id === requested)) {
      return requested;
    }
    return agents[0]?.id || "";
  }

  private async buildAgentsResponse(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentsResponse> {
    const agents = await this.listRunningAgents();
    const selectedAgentId = this.selectAgentId(agents, requestedAgentId);
    return {
      success: true,
      agents,
      selectedAgentId,
    };
  }

  private async resolveSelectedAgent(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentOption | null> {
    const payload = await this.buildAgentsResponse(requestedAgentId);
    if (!payload.selectedAgentId) return null;
    return (
      payload.agents.find((agent) => agent.id === payload.selectedAgentId) ||
      null
    );
  }

  private buildUpstreamUrl(requestUrl: URL, baseUrl: string): string {
    const upstreamPath = new URL(requestUrl.pathname + requestUrl.search, baseUrl);
    upstreamPath.searchParams.delete("agent");
    return upstreamPath.toString();
  }

  private async forwardRequest(
    request: Request,
    upstreamUrl: string,
  ): Promise<Response> {
    const method = request.method || "GET";
    const headers = new Headers();
    for (const [k, v] of request.headers.entries()) {
      const lower = k.toLowerCase();
      if (
        lower === "host" ||
        lower === "content-length" ||
        lower === "x-sma-agent"
      ) {
        continue;
      }
      headers.set(k, v);
    }

    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer());

    const response = await fetch(upstreamUrl, {
      method,
      headers,
      body,
    });
    const buf = Buffer.from(await response.arrayBuffer());
    const outHeaders = new Headers();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    outHeaders.set("content-type", contentType);
    return new Response(buf, {
      status: response.status,
      headers: outHeaders,
    });
  }

  /**
   * 启动 UI 网关。
   */
  async start(options: ConsoleUiGatewayStartOptions): Promise<void> {
    const { port, host } = options;
    await new Promise<void>((resolve) => {
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || "/", `http://${host}:${port}`);
          const method = req.method || "GET";
          const bodyBuffer = await new Promise<Buffer>((onDone, onError) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk) => chunks.push(chunk));
            req.on("end", () => onDone(Buffer.concat(chunks)));
            req.on("error", onError);
          });
          const request = new Request(url.toString(), {
            method,
            headers: new Headers(req.headers as Record<string, string>),
            body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
          });
          const response = await this.app.fetch(request);
          res.statusCode = response.status;
          for (const [key, value] of response.headers.entries()) {
            res.setHeader(key, value);
          }
          const output = Buffer.from(await response.arrayBuffer());
          res.end(output);
        } catch {
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
  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

export function createConsoleUIGateway(): ConsoleUIGateway {
  return new ConsoleUIGateway();
}
