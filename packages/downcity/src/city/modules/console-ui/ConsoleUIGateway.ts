/**
 * Console UI 网关。
 *
 * 关键点（中文）
 * - UI 由 console 进程独立托管，不依赖单个 agent 启动参数。
 * - 提供统一的多 agent 选择能力，并把 `/api/*` 代理到选中 agent。
 */

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "url";
import { registerConsoleUiGatewayRoutes } from "@/city/modules/console-ui/ConsoleUIGatewayRoutes.js";
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
} from "@/city/modules/console-ui/gateway/AgentCatalog.js";
import {
  executeConsoleUiShellCommand,
  initializeConsoleUiAgentProject,
  inspectConsoleUiAgentRestartSafety,
  pickConsoleUiDirectoryPath,
  restartConsoleUiAgentByProjectRoot,
  startConsoleUiAgentByProjectRoot,
  stopConsoleUiAgentByProjectRoot,
  updateConsoleUiAgentExecution,
} from "@/city/modules/console-ui/gateway/AgentActions.js";
import { serveConsoleUiFrontendPath } from "@/city/modules/console-ui/gateway/FrontendAssets.js";
import {
  buildConsoleUiUpstreamUrl,
  forwardConsoleUiRequest,
} from "@/city/modules/console-ui/gateway/Proxy.js";
import type {
  ConsoleUiAgentOption,
  ConsoleUiAgentsResponse,
  ConsoleUiConfigFileStatusItem,
  ConsoleUiConfigStatusResponse,
  ConsoleUiAgentDirectoryInspection,
} from "@/shared/types/ConsoleUI.js";
import type { AgentProjectInitializationResult } from "@/shared/types/AgentProject.js";
import { AuthService } from "@/city/runtime/auth/AuthService.js";
import { registerAuthRoutes } from "@/city/runtime/auth/AuthRoutes.js";
import {
  CONSOLE_UI_AUTH_ROUTE_POLICIES,
  createRouteAuthGuardMiddleware,
} from "@/city/runtime/auth/RoutePolicy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 当前 DC 版本号（用于 Console Overview 显示）。
 */
const DC_VERSION = (() => {
  try {
    const pkg = fs.readJsonSync(path.join(__dirname, "../../../../package.json")) as {
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
  private readonly authService: AuthService;

  constructor() {
    // 关键点（中文）：src/main/ui 与 bin/main/ui 都回退到 packages/downcity/public。
    this.publicDir = path.join(__dirname, "../../../../public");
    this.app = new Hono();
    this.authService = new AuthService();

    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-DC-Agent"],
      }),
    );
    this.app.use(
      "*",
      createRouteAuthGuardMiddleware(
        this.authService,
        CONSOLE_UI_AUTH_ROUTE_POLICIES,
      ),
    );

    this.setupRoutes();
  }

  /**
   * 注册网关路由。
   */
  private setupRoutes(): void {
    registerAuthRoutes({
      app: this.app,
      authService: this.authService,
    });
    registerConsoleUiGatewayRoutes({
      app: this.app,
      handlers: {
        readRequestedAgentId: (request) => this.readRequestedAgentId(request),
        buildAgentsResponse: (requestedAgentId) => this.buildAgentsResponse(requestedAgentId),
        initializeAgentProject: (projectRoot, initialization) =>
          this.initializeAgentProject(projectRoot, initialization),
        startAgentByProjectRoot: (projectRoot, options) => this.startAgentByProjectRoot(projectRoot, options),
        updateAgentExecution: (projectRoot, input) => this.updateAgentExecution(projectRoot, input),
        pickDirectoryPath: () => this.pickDirectoryPath(),
        inspectAgentDirectory: (projectRoot) => this.inspectAgentDirectory(projectRoot),
        inspectAgentRestartSafety: (projectRoot) => this.inspectAgentRestartSafety(projectRoot),
        restartAgentByProjectRoot: (projectRoot) => this.restartAgentByProjectRoot(projectRoot),
        stopAgentByProjectRoot: (projectRoot) => this.stopAgentByProjectRoot(projectRoot),
        buildConfigStatusResponse: (requestedAgentId) => this.buildConfigStatusResponse(requestedAgentId),
        resolveAgentById: (requestedAgentId) => this.resolveAgentById(requestedAgentId),
        executeShellCommand: (args) => this.executeShellCommand(args),
        buildModelResponse: (requestedAgentId) => this.buildModelResponse(requestedAgentId),
        resolveSelectedAgent: (requestedAgentId) => this.resolveSelectedAgent(requestedAgentId),
        buildUpstreamUrl: (requestUrl, baseUrl) => this.buildUpstreamUrl(requestUrl, baseUrl),
        forwardRequest: (request, upstreamUrl) => this.forwardRequest(request, upstreamUrl),
        serveFrontendPath: (c, reqPath) => this.serveFrontendPath(c, reqPath),
      },
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
   * - 模型池来自 console 全局 SQLite，而不是某个 agent。
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
    authToken?: string;
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

  private async initializeAgentProject(projectRoot: string, initialization: {
    agentName?: unknown;
    executionMode?: unknown;
    modelId?: unknown;
    agentType?: unknown;
    forceOverwriteShipJson?: unknown;
  }): Promise<AgentProjectInitializationResult> {
    return initializeConsoleUiAgentProject({
      projectRoot,
      agentName: initialization.agentName,
      executionMode: initialization.executionMode,
      modelId: initialization.modelId,
      agentType: initialization.agentType,
      forceOverwriteShipJson: initialization.forceOverwriteShipJson,
    });
  }

  private async startAgentByProjectRoot(projectRoot: string, options?: {
    initializeIfNeeded?: boolean;
    initialization?: {
      agentName?: unknown;
      executionMode?: unknown;
      modelId?: unknown;
      agentType?: unknown;
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
      cliPath: path.resolve(__dirname, "../cli/Index.js"),
      initializeIfNeeded: options?.initializeIfNeeded,
      initialization: options?.initialization,
    });
  }

  private async updateAgentExecution(projectRoot: string, input: {
    executionMode?: unknown;
    modelId?: unknown;
    agentType?: unknown;
  }): Promise<{
    projectRoot: string;
    executionMode: "model" | "acp";
    modelId?: string;
    agentType?: "codex" | "claude" | "kimi";
  }> {
    return updateConsoleUiAgentExecution({
      projectRoot,
      executionMode: input.executionMode,
      modelId: input.modelId,
      agentType: input.agentType,
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
      cliPath: path.resolve(__dirname, "../cli/Index.js"),
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
