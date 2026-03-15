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
import {
  getProfileMdPath,
  getShipJsonPath,
  getShipMemoryIndexPath,
  getShipSchemaPath,
  getSoulMdPath,
  getUserMdPath,
} from "@/console/env/Paths.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import {
  getConsoleAgentRegistryPath,
  getConsoleDotenvPath,
  getConsolePidPath,
  getConsoleShipDbPath,
  getConsoleShipJsonPath,
  getConsoleUiPidPath,
} from "@/console/runtime/ConsolePaths.js";
import { ConsoleStore } from "@utils/store/index.js";
import { registerConsoleUiModelRoutes } from "@/console/ui/ModelApiRoutes.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  ConsoleUiConfigFileStatusItem,
  ConsoleUiConfigStatusResponse,
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
  model?: {
    primary?: unknown;
  };
  services?: {
    chat?: {
      channels?: {
        telegram?: {
          enabled?: unknown;
          botToken?: unknown;
        };
        feishu?: {
          enabled?: unknown;
          appId?: unknown;
        };
        qq?: {
          enabled?: unknown;
          appId?: unknown;
        };
      };
    };
  };
  start?: {
    host?: unknown;
    port?: unknown;
  };
};

type ChatChannelStatusLike = {
  channel?: unknown;
  enabled?: unknown;
  configured?: unknown;
  running?: unknown;
  linkState?: unknown;
  statusText?: unknown;
  detail?: Record<string, unknown>;
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

    this.app.get("/api/ui/config-status", async (c) => {
      try {
        const requestedAgentId = this.readRequestedAgentId(c.req.raw);
        const payload = await this.buildConfigStatusResponse(requestedAgentId);
        return c.json(payload);
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    registerConsoleUiModelRoutes({
      app: this.app,
      readRequestedAgentId: (request) => this.readRequestedAgentId(request),
      resolveSelectedAgent: (requestedAgentId) =>
        this.resolveSelectedAgent(requestedAgentId),
      buildModelResponse: (requestedAgentId) =>
        this.buildModelResponse(requestedAgentId),
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

    // 关键点（中文）：托管 Vite 构建产物（含 `/assets/*`）并支持 SPA fallback。
    this.app.get("/*", async (c) => {
      const reqPath = String(c.req.path || "/");
      if (reqPath.startsWith("/api/")) {
        return c.json({ success: false, error: "Not Found" }, 404);
      }
      return this.serveFrontendPath(c, reqPath);
    });
  }

  private resolveContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") return "text/html; charset=utf-8";
    if (ext === ".css") return "text/css; charset=utf-8";
    if (ext === ".js" || ext === ".mjs") {
      return "application/javascript; charset=utf-8";
    }
    if (ext === ".json") return "application/json; charset=utf-8";
    if (ext === ".svg") return "image/svg+xml";
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".ico") return "image/x-icon";
    if (ext === ".webp") return "image/webp";
    if (ext === ".map") return "application/json; charset=utf-8";
    if (ext === ".woff") return "font/woff";
    if (ext === ".woff2") return "font/woff2";
    return "application/octet-stream";
  }

  private async serveFrontendPath(c: Context, reqPath: string): Promise<Response> {
    const cleanPath = reqPath === "/" ? "/index.html" : reqPath;
    const safePath = cleanPath.startsWith("/") ? cleanPath.slice(1) : cleanPath;
    const candidatePath = path.resolve(this.publicDir, safePath);
    const publicRoot = path.resolve(this.publicDir);
    const isInsidePublic =
      candidatePath === publicRoot ||
      candidatePath.startsWith(`${publicRoot}${path.sep}`);
    if (!isInsidePublic) {
      return c.text("Forbidden", 403);
    }

    if (await fs.pathExists(candidatePath)) {
      const stat = await fs.stat(candidatePath);
      if (stat.isFile()) {
        const content = await fs.readFile(candidatePath);
        return c.body(content, 200, {
          "Content-Type": this.resolveContentType(candidatePath),
          "Cache-Control":
            safePath.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        });
      }
    }

    // SPA fallback
    const indexPath = path.join(this.publicDir, "index.html");
    if (!(await fs.pathExists(indexPath))) {
      return c.text("Console UI frontend not found. Build console-ui first.", 503);
    }
    const html = await fs.readFile(indexPath, "utf-8");
    return c.body(html, 200, {
      "Content-Type": "text/html; charset=utf-8",
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
    let ship: ShipJsonLike | null = null;
    try {
      const shipPath = getShipJsonPath(projectRoot);
      if (await fs.pathExists(shipPath)) {
        ship = (await fs.readJson(shipPath)) as ShipJsonLike;
        const name = String(ship?.name || "").trim();
        if (name) displayName = name;
      }
    } catch {
      // ignore
    }

    const chatProfiles = await this.resolveAgentChatProfiles({
      ship,
      baseUrl: `http://${endpoint.host}:${endpoint.port}`,
    });

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
      chatProfiles,
      primaryModelId: String(ship?.model?.primary || "").trim() || undefined,
    };
  }

  private normalizeChatIdentity(params: {
    channel: string;
    detail?: Record<string, unknown>;
    ship?: ShipJsonLike | null;
  }): string {
    const channel = params.channel;
    const detail = params.detail || {};
    const shipChannels = params.ship?.services?.chat?.channels;
    if (channel === "telegram") {
      const botUsername = String(detail.botUsername || "").trim();
      if (botUsername) return `@${botUsername.replace(/^@+/, "")}`;
      return "telegram bot";
    }
    if (channel === "qq") {
      // 关键点（中文）：QQ 优先展示可读名称，其次展示 appId，避免退化为固定文案。
      const qqBotName = String(
        detail.botName || detail.nickname || detail.username || "",
      ).trim();
      if (qqBotName) return qqBotName;
      const appId = String(detail.appId || shipChannels?.qq?.appId || "").trim();
      return appId ? `app:${appId}` : "qq bot";
    }
    if (channel === "feishu") {
      const appId = String(shipChannels?.feishu?.appId || "").trim();
      return appId ? `app:${appId}` : "feishu bot";
    }
    return `${channel} bot`;
  }

  private async resolveAgentChatProfiles(params: {
    ship?: ShipJsonLike | null;
    baseUrl: string;
  }): Promise<Array<{
    channel: string;
    identity: string;
    linkState?: string;
    statusText?: string;
  }>> {
    try {
      const upstreamUrl = new URL("/api/services/command", params.baseUrl).toString();
      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          serviceName: "chat",
          command: "status",
          payload: {},
        }),
      });
      if (!response.ok) return [];
      const payload = (await response.json().catch(() => ({}))) as {
        success?: unknown;
        data?: {
          channels?: ChatChannelStatusLike[];
        };
      };
      const rows = Array.isArray(payload?.data?.channels) ? payload.data.channels : [];
      return rows
        .map((row) => {
          const channel = String(row?.channel || "").trim();
          if (!channel) return null;
          const running =
            typeof row?.running === "boolean"
              ? row.running
              : (() => {
                  const linkState = String(row?.linkState || "").trim();
                  return linkState === "connected" || linkState === "unknown";
                })();
          // 关键点（中文）：只展示已启动渠道，未启动渠道不进入 chat identity 面板。
          if (!running) return null;
          const linkState = String(row?.linkState || "").trim();
          const statusText = String(row?.statusText || "").trim();
          const detail =
            row?.detail && typeof row.detail === "object"
              ? row.detail
              : undefined;
          return {
            channel,
            identity: this.normalizeChatIdentity({
              channel,
              detail,
              ship: params.ship,
            }),
            ...(linkState ? { linkState } : {}),
            ...(statusText ? { statusText } : {}),
          };
        })
        .filter(
          (
            item,
          ): item is {
            channel: string;
            identity: string;
            linkState?: string;
            statusText?: string;
          } => item !== null,
        );
    } catch {
      return [];
    }
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

  /**
   * 构建 Global Model 面板响应。
   *
   * 关键点（中文）
   * - 模型池来自 console 全局 SQLite，而不是某个 agent runtime。
   * - `agentPrimaryModelId` 仅用于展示当前选中 agent 的项目绑定。
   */
  private async buildModelResponse(requestedAgentId: string): Promise<{
    success: boolean;
    model: {
      primaryModelId: string;
      primaryModelName: string;
      providerKey: string;
      providerType: string;
      baseUrl: string;
      agentPrimaryModelId: string;
      availableModels: Array<{
        id: string;
        name: string;
        providerKey: string;
        providerType: string;
        isPaused: boolean;
      }>;
    };
  }> {
    const selectedAgent = await this.resolveSelectedAgent(requestedAgentId);
    let agentPrimaryModelId = "";
    if (selectedAgent) {
      try {
        const shipPath = getShipJsonPath(selectedAgent.projectRoot);
        if (await fs.pathExists(shipPath)) {
          const ship = (await fs.readJson(shipPath)) as ShipJsonLike;
          agentPrimaryModelId = String(ship?.model?.primary || "").trim();
        }
      } catch {
        // ignore parse errors
      }
    }

    const store = new ConsoleStore();
    try {
      const models = store.listModels();
      const providers = await store.listProviders();
      const providerMap = new Map(providers.map((x) => [x.id, x] as const));
      const activeModel = agentPrimaryModelId
        ? models.find((x) => x.id === agentPrimaryModelId)
        : undefined;
      const providerKey = String(activeModel?.providerId || "").trim();
      const provider = providerKey ? providerMap.get(providerKey) : undefined;

      return {
        success: true,
        model: {
          primaryModelId: agentPrimaryModelId,
          primaryModelName: String(activeModel?.name || "").trim(),
          providerKey,
          providerType: String(provider?.type || "").trim(),
          baseUrl: String(provider?.baseUrl || "").trim(),
          agentPrimaryModelId,
          availableModels: models.map((model) => {
            const providerConfig = providerMap.get(model.providerId);
            return {
              id: model.id,
              name: model.name,
              providerKey: model.providerId,
              providerType: String(providerConfig?.type || "").trim(),
              isPaused: model.isPaused === true,
            };
          }),
        },
      };
    } finally {
      store.close();
    }
  }

  /**
   * 读取单个配置文件状态。
   *
   * 关键点（中文）
   * - 不抛出异常，统一返回 `status/reason` 便于 UI 汇总展示。
   * - 使用最小探测维度：存在性、文件类型、可读性、大小、修改时间。
   */
  private async readConfigFileStatus(params: {
    key: string;
    scope: "console" | "agent";
    label: string;
    filePath: string;
  }): Promise<ConsoleUiConfigFileStatusItem> {
    const filePath = path.resolve(String(params.filePath || ""));
    if (!filePath) {
      return {
        key: params.key,
        scope: params.scope,
        label: params.label,
        path: String(params.filePath || ""),
        exists: false,
        isFile: false,
        readable: false,
        sizeBytes: 0,
        mtime: "",
        status: "error",
        reason: "invalid_path",
      };
    }

    try {
      const stat = await fs.stat(filePath);
      const isFile = stat.isFile();
      if (!isFile) {
        return {
          key: params.key,
          scope: params.scope,
          label: params.label,
          path: filePath,
          exists: true,
          isFile: false,
          readable: false,
          sizeBytes: Number(stat.size || 0),
          mtime: stat.mtime.toISOString(),
          status: "error",
          reason: "not_a_file",
        };
      }

      let readable = true;
      try {
        await fs.access(filePath, fs.constants.R_OK);
      } catch {
        readable = false;
      }

      return {
        key: params.key,
        scope: params.scope,
        label: params.label,
        path: filePath,
        exists: true,
        isFile: true,
        readable,
        sizeBytes: Number(stat.size || 0),
        mtime: stat.mtime.toISOString(),
        status: readable ? "ok" : "error",
        reason: readable ? "ok" : "permission_denied",
      };
    } catch (error) {
      const message = String(error || "").toLowerCase();
      const missing = message.includes("enoent");
      return {
        key: params.key,
        scope: params.scope,
        label: params.label,
        path: filePath,
        exists: false,
        isFile: false,
        readable: false,
        sizeBytes: 0,
        mtime: "",
        status: missing ? "missing" : "error",
        reason: missing ? "file_not_found" : "stat_failed",
      };
    }
  }

  /**
   * 构建配置文件状态响应。
   *
   * 关键点（中文）
   * - `console` 维度始终返回。
   * - `agent` 维度仅在存在选中 agent 时返回，避免误导。
   */
  private async buildConfigStatusResponse(
    requestedAgentId: string,
  ): Promise<ConsoleUiConfigStatusResponse> {
    const selectedAgent = await this.resolveSelectedAgent(requestedAgentId);

    const consoleChecks = await Promise.all([
      this.readConfigFileStatus({
        key: "ship_json",
        scope: "console",
        label: "Console ship.json",
        filePath: getConsoleShipJsonPath(),
      }),
      this.readConfigFileStatus({
        key: "ship_db",
        scope: "console",
        label: "Console ship.db",
        filePath: getConsoleShipDbPath(),
      }),
      this.readConfigFileStatus({
        key: "dotenv",
        scope: "console",
        label: "Console .env",
        filePath: getConsoleDotenvPath(),
      }),
      this.readConfigFileStatus({
        key: "console_pid",
        scope: "console",
        label: "Console PID",
        filePath: getConsolePidPath(),
      }),
      this.readConfigFileStatus({
        key: "ui_pid",
        scope: "console",
        label: "Console UI PID",
        filePath: getConsoleUiPidPath(),
      }),
      this.readConfigFileStatus({
        key: "agents_registry",
        scope: "console",
        label: "Agents Registry",
        filePath: getConsoleAgentRegistryPath(),
      }),
    ]);

    let agentChecks: ConsoleUiConfigFileStatusItem[] = [];
    if (selectedAgent) {
      const cwd = selectedAgent.projectRoot;
      agentChecks = await Promise.all([
        this.readConfigFileStatus({
          key: "profile_md",
          scope: "agent",
          label: "PROFILE.md",
          filePath: getProfileMdPath(cwd),
        }),
        this.readConfigFileStatus({
          key: "soul_md",
          scope: "agent",
          label: "SOUL.md",
          filePath: getSoulMdPath(cwd),
        }),
        this.readConfigFileStatus({
          key: "user_md",
          scope: "agent",
          label: "USER.md",
          filePath: getUserMdPath(cwd),
        }),
        this.readConfigFileStatus({
          key: "ship_json",
          scope: "agent",
          label: "Agent ship.json",
          filePath: getShipJsonPath(cwd),
        }),
        this.readConfigFileStatus({
          key: "ship_schema",
          scope: "agent",
          label: ".ship/schema/ship.schema.json",
          filePath: getShipSchemaPath(cwd),
        }),
        this.readConfigFileStatus({
          key: "memory_index",
          scope: "agent",
          label: ".ship/memory/index.sqlite",
          filePath: getShipMemoryIndexPath(cwd),
        }),
      ]);
    }

    return {
      success: true,
      selectedAgentId: selectedAgent?.id || "",
      selectedAgentName: selectedAgent?.name || "",
      items: [...consoleChecks, ...agentChecks],
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
