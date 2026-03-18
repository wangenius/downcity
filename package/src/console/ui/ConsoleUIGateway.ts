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
import { spawn } from "node:child_process";
import fs from "fs-extra";
import path from "node:path";
import { basename } from "node:path";
import { fileURLToPath } from "url";
import {
  startDaemonProcess,
  stopDaemonProcess,
  getDaemonLogPath,
  getDaemonMetaPath,
  isProcessAlive,
  readDaemonPid,
} from "@/console/daemon/Manager.js";
import { buildRunArgsFromOptions } from "@/console/daemon/CliArgs.js";
import { ensureRuntimeModelBindingReady } from "@/console/daemon/ProjectSetup.js";
import {
  getProfileMdPath,
  getShipJsonPath,
  getShipMemoryIndexPath,
  getShipSchemaPath,
  getShipContextRootDirPath,
  getSoulMdPath,
  getUserMdPath,
} from "@/console/env/Paths.js";
import { listConsoleAgents } from "@/console/runtime/ConsoleRegistry.js";
import {
  getConsoleAgentRegistryPath,
  getConsolePidPath,
  getConsoleShipDbPath,
  getConsoleUiPidPath,
} from "@/console/runtime/ConsolePaths.js";
import { ConsoleStore } from "@utils/store/index.js";
import { registerConsoleUiModelRoutes } from "@/console/ui/ModelApiRoutes.js";
import { registerConsoleUiChannelAccountRoutes } from "@/console/ui/ChannelAccountApiRoutes.js";
import { getSmaExtensions, listExtensionRuntimes } from "@/console/extension/Manager.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  ConsoleUiConfigFileStatusItem,
  ConsoleUiConfigStatusResponse,
} from "@/types/ConsoleUI.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_RUNTIME_PORT = 5314;
const DEFAULT_RUNTIME_HOST = "127.0.0.1";

/**
 * 当前 SMA 版本号（用于 Console Overview 显示）。
 */
const SMA_VERSION = (() => {
  try {
    const pkg = fs.readJsonSync(path.join(__dirname, "../../../package.json")) as {
      version?: string;
    };
    const version = String(pkg?.version || "").trim();
    return version || "unknown";
  } catch {
    return "unknown";
  }
})();

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
          channelAccountId?: unknown;
        };
        feishu?: {
          enabled?: unknown;
          channelAccountId?: unknown;
        };
        qq?: {
          enabled?: unknown;
          channelAccountId?: unknown;
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

    this.app.post("/api/ui/agents/start", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          agentId?: unknown;
          projectRoot?: unknown;
        };
        const rawProject = String(body.projectRoot || body.agentId || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const projectRoot = path.resolve(rawProject);
        const payload = await this.startAgentByProjectRoot(projectRoot);
        return c.json(payload);
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.post("/api/ui/agents/restart", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          agentId?: unknown;
          projectRoot?: unknown;
          force?: unknown;
        };
        const rawProject = String(body.projectRoot || body.agentId || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const projectRoot = path.resolve(rawProject);
        const forceRestart = body.force === true;
        const checks = await this.inspectAgentRestartSafety(projectRoot);
        const hasBlocking =
          checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
        if (hasBlocking && !forceRestart) {
          const contextLabel =
            checks.activeContexts.length > 0
              ? `contexts: ${checks.activeContexts.join(", ")}`
              : "";
          const taskLabel =
            checks.activeTasks.length > 0
              ? `tasks: ${checks.activeTasks.join(", ")}`
              : "";
          const detail = [contextLabel, taskLabel].filter(Boolean).join(" | ");
          return c.json(
            {
              success: false,
              error: detail
                ? `Agent has running workload, restart blocked (${detail})`
                : "Agent has running workload, restart blocked",
              activeContexts: checks.activeContexts,
              activeTasks: checks.activeTasks,
            },
            409,
          );
        }
        const payload = await this.restartAgentByProjectRoot(projectRoot);
        return c.json({
          ...payload,
          activeContexts: checks.activeContexts,
          activeTasks: checks.activeTasks,
        });
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.post("/api/ui/agents/stop", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          agentId?: unknown;
          projectRoot?: unknown;
          force?: unknown;
        };
        const rawProject = String(body.projectRoot || body.agentId || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const projectRoot = path.resolve(rawProject);
        const forceStop = body.force === true;
        const checks = await this.inspectAgentRestartSafety(projectRoot);
        const hasBlocking =
          checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
        if (hasBlocking && !forceStop) {
          const contextLabel =
            checks.activeContexts.length > 0
              ? `contexts: ${checks.activeContexts.join(", ")}`
              : "";
          const taskLabel =
            checks.activeTasks.length > 0
              ? `tasks: ${checks.activeTasks.join(", ")}`
              : "";
          const detail = [contextLabel, taskLabel].filter(Boolean).join(" | ");
          return c.json(
            {
              success: false,
              error: detail
                ? `Agent has running workload, stop blocked (${detail})`
                : "Agent has running workload, stop blocked",
              activeContexts: checks.activeContexts,
              activeTasks: checks.activeTasks,
            },
            409,
          );
        }
        const payload = await this.stopAgentByProjectRoot(projectRoot);
        return c.json({
          ...payload,
          activeContexts: checks.activeContexts,
          activeTasks: checks.activeTasks,
        });
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

    this.app.post("/api/ui/command/execute", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          agentId?: unknown;
          command?: unknown;
          timeoutMs?: unknown;
        };
        const requestedAgentId = String(
          body.agentId || this.readRequestedAgentId(c.req.raw) || "",
        ).trim();
        if (!requestedAgentId) {
          return c.json({ success: false, error: "agentId is required" }, 400);
        }
        const command = String(body.command || "").trim();
        if (!command) {
          return c.json({ success: false, error: "command is required" }, 400);
        }

        const selectedAgent = await this.resolveAgentById(requestedAgentId);
        if (!selectedAgent) {
          return c.json(
            {
              success: false,
              error: "Agent not found in console registry",
            },
            404,
          );
        }

        const timeoutRaw = Number.parseInt(String(body.timeoutMs || ""), 10);
        const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0
          ? Math.min(timeoutRaw, 120_000)
          : 45_000;

        const result = await this.executeShellCommand({
          command,
          cwd: selectedAgent.projectRoot,
          timeoutMs,
        });
        return c.json({
          success: true,
          agentId: selectedAgent.id,
          result,
        });
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.get("/api/ui/extensions", async (c) => {
      try {
        const runtimes = listExtensionRuntimes();
        const extensions = getSmaExtensions();
        const extensionConfigMap = new Map(
          extensions.map((extension) => {
            const actions = Object.entries(extension.actions || {}).map(
              ([actionName, action]) => ({
                name: actionName,
                supportsCommand: Boolean(action?.command),
                supportsApi: Boolean(action?.api),
                commandDescription: String(action?.command?.description || "").trim(),
                apiMethod: String(action?.api?.method || "").trim().toUpperCase(),
                apiPath: String(action?.api?.path || "").trim(),
              }),
            );
            return [
              extension.name,
              {
                lifecycle: {
                  start: Boolean(extension.lifecycle?.start),
                  stop: Boolean(extension.lifecycle?.stop),
                  command: Boolean(extension.lifecycle?.command),
                },
                actions,
              },
            ] as const;
          }),
        );
        return c.json({
          success: true,
          extensions: runtimes.map((item) => ({
            ...item,
            config: extensionConfigMap.get(item.name) || {
              lifecycle: { start: false, stop: false, command: false },
              actions: [],
            },
          })),
        });
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
    registerConsoleUiChannelAccountRoutes({
      app: this.app,
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
                "No running agent found. Start one via `sma agent start` first.",
            },
            503,
          );
        }

        if (!selection.baseUrl) {
          return c.json(
            {
              success: false,
              error: "Selected agent runtime endpoint is unavailable.",
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
    let daemonArgHost: string | undefined;
    let daemonArgPort: number | undefined;

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
      host: daemonArgHost || DEFAULT_RUNTIME_HOST,
      port: daemonArgPort || DEFAULT_RUNTIME_PORT,
    };
  }

  private async buildAgentOption(
    projectRoot: string,
    startedAt: string,
    updatedAt: string,
    stoppedAt?: string,
  ): Promise<ConsoleUiAgentOption | null> {
    const daemonPid = await readDaemonPid(projectRoot);
    const running = Boolean(daemonPid && isProcessAlive(daemonPid));

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

    const chatProfiles = running
      ? await this.resolveAgentChatProfiles({
          baseUrl: `http://${endpoint.host}:${endpoint.port}`,
        })
      : [];

    return {
      id: projectRoot,
      name: displayName,
      projectRoot,
      running,
      host: running ? endpoint.host : undefined,
      port: running ? endpoint.port : undefined,
      baseUrl: running ? `http://${endpoint.host}:${endpoint.port}` : undefined,
      startedAt,
      updatedAt,
      stoppedAt: String(stoppedAt || "").trim() || undefined,
      daemonPid: running ? daemonPid || undefined : undefined,
      logPath: running ? getDaemonLogPath(projectRoot) : undefined,
      chatProfiles,
      primaryModelId: String(ship?.model?.primary || "").trim() || undefined,
    };
  }

  private async resolveAgentChatProfiles(params: {
    baseUrl: string;
  }): Promise<Array<{
    channel: string;
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
          // 关键点（中文）：只展示已启动渠道，未启动渠道不进入侧边栏 chat 分组。
          if (!running) return null;
          const linkState = String(row?.linkState || "").trim();
          const statusText = String(row?.statusText || "").trim();
          return {
            channel,
            ...(linkState ? { linkState } : {}),
            ...(statusText ? { statusText } : {}),
          };
        })
        .filter(
          (
            item,
          ): item is {
            channel: string;
            linkState?: string;
            statusText?: string;
          } => item !== null,
        );
    } catch {
      return [];
    }
  }

  private async listKnownAgents(): Promise<ConsoleUiAgentOption[]> {
    const entries = await listConsoleAgents();
    const agents: ConsoleUiAgentOption[] = [];

    for (const entry of entries) {
      const projectRoot = path.resolve(String(entry.projectRoot || "").trim());
      if (!projectRoot) continue;
      const option = await this.buildAgentOption(
        projectRoot,
        String(entry.startedAt || ""),
        String(entry.updatedAt || ""),
        String(entry.stoppedAt || ""),
      );
      if (!option) continue;
      agents.push(option);
    }

    return agents.sort((a, b) => {
      const runningA = a.running === true ? 1 : 0;
      const runningB = b.running === true ? 1 : 0;
      if (runningA !== runningB) return runningB - runningA;
      return a.name.localeCompare(b.name);
    });
  }

  private selectAgentId(
    agents: ConsoleUiAgentOption[],
    requestedAgentId: string,
  ): string {
    const requested = String(requestedAgentId || "").trim();
    if (requested) {
      const requestedAgent = agents.find((agent) => agent.id === requested);
      if (requestedAgent?.running === true) return requested;
    }
    const running = agents.find((agent) => agent.running === true);
    if (running) return running.id;
    // 关键点（中文）：没有运行中 agent 时不返回历史/离线 id，避免 UI 持续请求并触发 503 噪音。
    return "";
  }

  private async buildAgentsResponse(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentsResponse> {
    const agents = await this.listKnownAgents();
    const selectedAgentId = this.selectAgentId(agents, requestedAgentId);
    return {
      success: true,
      smaVersion: SMA_VERSION,
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
        key: "ship_db",
        scope: "console",
        label: "Console ship.db",
        filePath: getConsoleShipDbPath(),
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
    const selected = payload.agents.find(
      (agent) => agent.id === payload.selectedAgentId,
    );
    if (!selected || selected.running !== true) return null;
    return selected;
  }

  /**
   * 根据 id 查找 agent（允许离线 agent，用于 command 页面）。
   */
  private async resolveAgentById(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentOption | null> {
    const targetId = String(requestedAgentId || "").trim();
    if (!targetId) return null;
    const agents = await this.listKnownAgents();
    return agents.find((item) => item.id === targetId) || null;
  }

  /**
   * 在 agent 项目目录中执行 shell 命令。
   *
   * 关键点（中文）
   * - 默认 shell 使用 zsh，保持与 CLI 使用习惯一致。
   * - 输出做大小限制，避免单次命令把 UI 网关进程内存打满。
   */
  private async executeShellCommand(params: {
    command: string;
    cwd: string;
    timeoutMs: number;
  }): Promise<{
    command: string;
    cwd: string;
    exitCode: number | null;
    signal: string;
    timedOut: boolean;
    durationMs: number;
    stdout: string;
    stderr: string;
  }> {
    const command = String(params.command || "").trim();
    const cwd = path.resolve(String(params.cwd || "").trim() || ".");
    const timeoutMs = Math.max(1_000, Math.min(Number(params.timeoutMs || 45_000), 120_000));
    const startedAt = Date.now();

    return await new Promise((resolve, reject) => {
      const child = spawn("/bin/zsh", ["-lc", command], {
        cwd,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const MAX_OUTPUT_BYTES = 200_000;
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | null = null;
      let hardKillTimer: NodeJS.Timeout | null = null;

      // 关键点（中文）：超时先尝试 SIGTERM，仍未退出再兜底 SIGKILL。
      killTimer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        hardKillTimer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 1_200);
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        if (!chunk) return;
        if (Buffer.byteLength(stdout, "utf-8") >= MAX_OUTPUT_BYTES) return;
        stdout += String(chunk);
      });

      child.stderr.on("data", (chunk) => {
        if (!chunk) return;
        if (Buffer.byteLength(stderr, "utf-8") >= MAX_OUTPUT_BYTES) return;
        stderr += String(chunk);
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        if (hardKillTimer) clearTimeout(hardKillTimer);
        reject(error);
      });

      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        if (killTimer) clearTimeout(killTimer);
        if (hardKillTimer) clearTimeout(hardKillTimer);
        resolve({
          command,
          cwd,
          exitCode: code,
          signal: signal || "",
          timedOut,
          durationMs: Date.now() - startedAt,
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        });
      });
    });
  }

  private async startAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    started: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
  }> {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    const daemonPid = await readDaemonPid(normalizedRoot);
    if (daemonPid && isProcessAlive(daemonPid)) {
      return {
        success: true,
        projectRoot: normalizedRoot,
        started: false,
        pid: daemonPid,
        logPath: getDaemonLogPath(normalizedRoot),
        message: "already_running",
      };
    }

    const profilePath = getProfileMdPath(normalizedRoot);
    const shipPath = getShipJsonPath(normalizedRoot);
    if (!(await fs.pathExists(profilePath)) || !(await fs.pathExists(shipPath))) {
      throw new Error(
        `Project not ready: ${normalizedRoot}. Required files: PROFILE.md and ship.json`,
      );
    }

    ensureRuntimeModelBindingReady(normalizedRoot);
    const args = await buildRunArgsFromOptions(normalizedRoot, {});
    const cliPath = path.resolve(__dirname, "../commands/Index.js");
    const started = await startDaemonProcess({
      projectRoot: normalizedRoot,
      cliPath,
      args,
    });
    return {
      success: true,
      projectRoot: normalizedRoot,
      started: true,
      pid: started.pid,
      logPath: started.logPath,
      message: "started",
    };
  }

  private async inspectAgentRestartSafety(projectRoot: string): Promise<{
    activeContexts: string[];
    activeTasks: string[];
  }> {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    const activeContexts: string[] = [];
    const activeTasks: string[] = [];

    const contextRootDir = getShipContextRootDirPath(normalizedRoot);
    if (await fs.pathExists(contextRootDir)) {
      const entries = await fs.readdir(contextRootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const lockFilePath = path.join(contextRootDir, entry.name, "messages", ".context.lock");
        if (!(await fs.pathExists(lockFilePath))) continue;
        try {
          activeContexts.push(decodeURIComponent(entry.name));
        } catch {
          activeContexts.push(entry.name);
        }
      }
    }

    const knownAgents = await this.listKnownAgents();
    const targetAgent = knownAgents.find(
      (item) => path.resolve(String(item.projectRoot || "")) === normalizedRoot,
    );
    if (targetAgent?.running === true && targetAgent.baseUrl) {
      try {
        const tasksUrl = new URL("/api/tui/tasks", targetAgent.baseUrl).toString();
        const tasksResponse = await fetch(tasksUrl);
        if (tasksResponse.ok) {
          const payload = (await tasksResponse.json().catch(() => ({}))) as {
            tasks?: Array<{ title?: unknown }>;
          };
          const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
          for (const task of tasks) {
            const title = String(task?.title || "").trim();
            if (!title) continue;
            const runsUrl = new URL(
              `/api/tui/tasks/${encodeURIComponent(title)}/runs?limit=1`,
              targetAgent.baseUrl,
            ).toString();
            const runsResponse = await fetch(runsUrl);
            if (!runsResponse.ok) continue;
            const runsPayload = (await runsResponse.json().catch(() => ({}))) as {
              runs?: Array<{ inProgress?: unknown }>;
            };
            const firstRun = Array.isArray(runsPayload.runs)
              ? runsPayload.runs[0]
              : null;
            if (firstRun?.inProgress === true) {
              activeTasks.push(title);
            }
          }
        }
      } catch {
        // ignore runtime check failures
      }
    }

    return {
      activeContexts: Array.from(new Set(activeContexts)),
      activeTasks: Array.from(new Set(activeTasks)),
    };
  }

  private async restartAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    restarted: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
  }> {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    await stopDaemonProcess({ projectRoot: normalizedRoot }).catch(() => ({
      stopped: false,
    }));
    const started = await this.startAgentByProjectRoot(normalizedRoot);
    return {
      success: true,
      projectRoot: normalizedRoot,
      restarted: true,
      pid: started.pid,
      logPath: started.logPath,
      message: "restarted",
    };
  }

  private async stopAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    stopped: boolean;
    pid?: number;
    message?: string;
  }> {
    const normalizedRoot = path.resolve(String(projectRoot || "").trim() || ".");
    const result = await stopDaemonProcess({ projectRoot: normalizedRoot });
    return {
      success: true,
      projectRoot: normalizedRoot,
      stopped: result.stopped === true,
      pid: result.pid,
      message: result.stopped ? "stopped" : "already_stopped",
    };
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
