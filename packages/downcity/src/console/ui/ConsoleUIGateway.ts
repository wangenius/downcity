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
import { fileURLToPath } from "url";
import { initializeAgentProject } from "@/console/project/AgentInitializer.js";
import { registerConsoleUiModelRoutes } from "@/console/ui/ModelApiRoutes.js";
import { registerConsoleUiChannelAccountRoutes } from "@/console/ui/ChannelAccountApiRoutes.js";
import { registerConsoleUiEnvRoutes } from "@/console/ui/EnvApiRoutes.js";
import { registerConsoleUiAgentRuntimeRoutes } from "@/console/ui/AgentRuntimeApiRoutes.js";
import { registerConsoleUiPluginRoutes } from "@/console/ui/PluginApiRoutes.js";
import {
  buildConsoleUiAgentsResponse,
  buildConsoleUiConfigStatusResponse,
  buildConsoleUiModelResponse,
  inspectConsoleUiAgentDirectory,
  listKnownConsoleAgents,
  readConsoleUiConfigFileStatus,
  readRequestedConsoleAgentId,
  resolveConsoleAgentById,
  resolveSelectedConsoleAgent,
} from "@/console/ui/gateway/AgentCatalog.js";
import {
  executeConsoleUiShellCommand,
  inspectConsoleUiAgentRestartSafety,
  pickConsoleUiDirectoryPath,
  restartConsoleUiAgentByProjectRoot,
  startConsoleUiAgentByProjectRoot,
  stopConsoleUiAgentByProjectRoot,
} from "@/console/ui/gateway/AgentActions.js";
import { serveConsoleUiFrontendPath } from "@/console/ui/gateway/FrontendAssets.js";
import {
  buildConsoleUiUpstreamUrl,
  forwardConsoleUiRequest,
} from "@/console/ui/gateway/Proxy.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  ConsoleUiConfigFileStatusItem,
  ConsoleUiConfigStatusResponse,
  ConsoleUiAgentDirectoryInspection,
} from "@/types/ConsoleUI.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 当前 DC 版本号（用于 Console Overview 显示）。
 */
const DC_VERSION = (() => {
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
    // 关键点（中文）：src/console/ui 与 bin/console/ui 都回退到 packages/downcity/public。
    this.publicDir = path.join(__dirname, "../../../public");
    this.app = new Hono();

    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-DC-Agent"],
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
          initializeIfNeeded?: unknown;
          initialization?: {
            agentName?: unknown;
            primaryModelId?: unknown;
            forceOverwriteShipJson?: unknown;
          };
        };
        const rawProject = String(body.projectRoot || body.agentId || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const projectRoot = path.resolve(rawProject);
        const payload = await this.startAgentByProjectRoot(projectRoot, {
          initializeIfNeeded: body.initializeIfNeeded === true,
          initialization: body.initialization,
        });
        return c.json(payload);
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.post("/api/ui/agents/create", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          projectRoot?: unknown;
          agentName?: unknown;
          primaryModelId?: unknown;
          autoStart?: unknown;
          forceOverwriteShipJson?: unknown;
        };
        const rawProject = String(body.projectRoot || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const projectRoot = path.resolve(rawProject);
        const initResult = await initializeAgentProject({
          projectRoot,
          agentName: String(body.agentName || "").trim() || undefined,
          primaryModelId: String(body.primaryModelId || "").trim(),
          forceOverwriteShipJson: body.forceOverwriteShipJson === true,
        });

        const shouldAutoStart = body.autoStart !== false;
        if (!shouldAutoStart) {
          return c.json({
            success: true,
            created: true,
            started: false,
            projectRoot,
            agentName: initResult.agentName,
            message: "created",
          });
        }

        const payload = await this.startAgentByProjectRoot(projectRoot);
        return c.json(payload);
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.post("/api/ui/system/pick-directory", async (c) => {
      try {
        const directoryPath = await this.pickDirectoryPath();
        return c.json({
          success: true,
          directoryPath,
        });
      } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
      }
    });

    this.app.post("/api/ui/agents/inspect", async (c) => {
      try {
        const body = (await c.req.json().catch(() => ({}))) as {
          projectRoot?: unknown;
          agentId?: unknown;
        };
        const rawProject = String(body.projectRoot || body.agentId || "").trim();
        if (!rawProject) {
          return c.json({ success: false, error: "projectRoot is required" }, 400);
        }
        const inspection = await this.inspectAgentDirectory(rawProject);
        return c.json({
          success: true,
          inspection,
        });
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

    registerConsoleUiModelRoutes({
      app: this.app,
      readRequestedAgentId: (request) => this.readRequestedAgentId(request),
      resolveSelectedAgent: (requestedAgentId) =>
        this.resolveSelectedAgent(requestedAgentId),
      buildModelResponse: (requestedAgentId) =>
        this.buildModelResponse(requestedAgentId),
    });
    registerConsoleUiChannelAccountRoutes({ app: this.app });
    registerConsoleUiEnvRoutes({ app: this.app });
    registerConsoleUiAgentRuntimeRoutes({
      app: this.app,
      readRequestedAgentId: (request) => this.readRequestedAgentId(request),
      resolveSelectedAgent: (requestedAgentId) =>
        this.resolveSelectedAgent(requestedAgentId),
    });
    registerConsoleUiPluginRoutes({
      app: this.app,
      readRequestedAgentId: (request) => this.readRequestedAgentId(request),
      resolveSelectedAgent: (requestedAgentId) =>
        this.resolveSelectedAgent(requestedAgentId),
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
                "No running agent found. Start one via `city agent start` first.",
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

  private readRequestedAgentId(request: Request): string {
    return readRequestedConsoleAgentId(request);
  }

  private async pickDirectoryPath(): Promise<string> {
    return pickConsoleUiDirectoryPath();
  }

  private async listKnownAgents(): Promise<ConsoleUiAgentOption[]> {
    return listKnownConsoleAgents();
  }

  private async buildAgentsResponse(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentsResponse> {
    return buildConsoleUiAgentsResponse({
      requestedAgentId,
      cityVersion: DC_VERSION,
    });
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
    return buildConsoleUiModelResponse({
      requestedAgentId,
      cityVersion: DC_VERSION,
    });
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
    return readConsoleUiConfigFileStatus(params);
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
    return buildConsoleUiConfigStatusResponse({
      requestedAgentId,
      cityVersion: DC_VERSION,
    });
  }

  private async resolveSelectedAgent(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentOption | null> {
    return resolveSelectedConsoleAgent(requestedAgentId, DC_VERSION);
  }

  /**
   * 根据 id 查找 agent（允许离线 agent，用于 command 页面）。
   */
  private async resolveAgentById(
    requestedAgentId: string,
  ): Promise<ConsoleUiAgentOption | null> {
    return resolveConsoleAgentById(requestedAgentId);
  }

  /**
   * 探测目录状态，用于“打开文件夹”流程。
   */
  private async inspectAgentDirectory(
    projectRoot: string,
  ): Promise<ConsoleUiAgentDirectoryInspection> {
    return inspectConsoleUiAgentDirectory(projectRoot);
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
    return executeConsoleUiShellCommand(params);
  }

  private async startAgentByProjectRoot(projectRoot: string, options?: {
    initializeIfNeeded?: boolean;
    initialization?: {
      agentName?: unknown;
      primaryModelId?: unknown;
      forceOverwriteShipJson?: unknown;
    };
  }): Promise<{
    success: boolean;
    projectRoot: string;
    started: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
  }> {
    return startConsoleUiAgentByProjectRoot({
      projectRoot,
      cliPath: path.resolve(__dirname, "../commands/Index.js"),
      initializeIfNeeded: options?.initializeIfNeeded,
      initialization: options?.initialization,
    });
  }

  private async inspectAgentRestartSafety(projectRoot: string): Promise<{
    activeContexts: string[];
    activeTasks: string[];
  }> {
    return inspectConsoleUiAgentRestartSafety({
      projectRoot,
      listKnownAgents: () => this.listKnownAgents(),
    });
  }

  private async restartAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    restarted: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
  }> {
    return restartConsoleUiAgentByProjectRoot({
      projectRoot,
      cliPath: path.resolve(__dirname, "../commands/Index.js"),
    });
  }

  private async stopAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    stopped: boolean;
    pid?: number;
    message?: string;
  }> {
    return stopConsoleUiAgentByProjectRoot(projectRoot);
  }

  private buildUpstreamUrl(requestUrl: URL, baseUrl: string): string {
    return buildConsoleUiUpstreamUrl(requestUrl, baseUrl);
  }

  private async forwardRequest(
    request: Request,
    upstreamUrl: string,
  ): Promise<Response> {
    return forwardConsoleUiRequest(request, upstreamUrl);
  }

  private async serveFrontendPath(c: Context, reqPath: string): Promise<Response> {
    return serveConsoleUiFrontendPath({
      context: c,
      publicDir: this.publicDir,
      requestPath: reqPath,
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
