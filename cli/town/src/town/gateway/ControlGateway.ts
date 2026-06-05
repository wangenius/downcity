/**
 * 控制面网关。
 *
 * 关键点（中文）
 * - UI 由控制面进程独立托管，不依赖单个 agent 启动参数。
 * - 提供统一的多 agent 选择能力，并通过 RPC 访问选中 agent。
 */

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import http from "node:http";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "url";
import { registerPlatformApiRoutes } from "@/town/gateway/api/PlatformApiRoutes.js";
import {
  registerAgentSdkPublishRoutes,
  type AgentSdkPublishRoutesRuntime,
} from "@/town/gateway/api/AgentSdkPublishRoutes.js";
import {
  buildPlatformAgentsResponse,
  buildPlatformConfigStatusResponse,
  buildPlatformModelResponse,
  inspectPlatformAgentDirectory,
  listKnownPlatformAgents,
  readPlatformConfigFileStatus,
  readRequestedPlatformAgentId,
  resolvePlatformAgentById,
  resolveSelectedPlatformAgent,
} from "@/town/gateway/AgentCatalog.js";
import {
  executeAgentProjectShellCommand,
  initializePlatformAgentProject,
  inspectManagedAgentRestartSafety,
  pickPlatformAgentDirectoryPath,
  restartManagedAgentByProjectRoot,
  startManagedAgentByProjectRoot,
  stopManagedAgentByProjectRoot,
  updatePlatformAgentExecution,
} from "@/town/gateway/AgentActions.js";
import { serveControlPlaneFrontendPath } from "@/town/gateway/FrontendAssets.js";
import { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";
import { listPluginAuthPolicies } from "@downcity/agent";
import type {
  PlatformAgentOption,
  PlatformAgentsResponse,
  PlatformConfigFileStatusItem,
  PlatformConfigStatusResponse,
  PlatformAgentDirectoryInspection,
  PlatformLocalModelsResponse,
} from "@downcity/agent";
import type { AgentProjectInitializationResult } from "@downcity/agent";
import { createBuiltinPlugins } from "@downcity/plugins";
import { AuthService } from "@/town/auth/AuthService.js";
import { registerAuthRoutes } from "@/town/auth/AuthRoutes.js";
import {
  CONTROL_PLANE_AUTH_ROUTE_POLICIES,
  createRouteAuthGuardMiddleware,
} from "@/town/auth/RoutePolicy.js";
import { resolveTownCliPath } from "@/shared/TownCliPath.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 当前 DC 版本号（用于 control plane overview 显示）。
 */
const DC_VERSION = (() => {
  const candidate_package_paths = [
    // 关键点（中文）：downcity 聚合包复制后的 town runtime 位于 `<pkg>/town/control`。
    path.join(__dirname, "../package.json"),
    // 关键点（中文）：workspace 内部包构建后位于 `cli/town/bin/control`。
    path.join(__dirname, "../../package.json"),
  ];

  for (const package_path of candidate_package_paths) {
    try {
      const pkg = fs.readJsonSync(package_path) as {
        version?: string;
      };
      const version = String(pkg?.version || "").trim();
      if (version) return version;
    } catch {
      // 关键点（中文）：不同构建布局会命中不同候选路径，失败时继续尝试下一个。
    }
  }

  return "unknown";
})();

/**
 * 控制面网关启动参数。
 */
export interface ControlGatewayStartOptions {
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
 * 控制面网关。
 */
export class ControlGateway {
  private app: Hono;
  private server: ReturnType<typeof http.createServer> | null = null;
  private agentSdkPublishRuntime: AgentSdkPublishRoutesRuntime | null = null;
  private readonly publicDir: string;
  private readonly authService: AuthService;
  private readonly agentRpcPool: AgentRpcPool;

  constructor() {
    // 关键点（中文）：Console UI 构建产物随 Town CLI 一起托管，聚合包会复制到对应 public 目录。
    this.publicDir = path.join(__dirname, "../../public");
    this.app = new Hono();
    this.authService = new AuthService();
    this.agentRpcPool = new AgentRpcPool({
      resolveAgentById: (requestedAgentId) => this.resolveAgentById(requestedAgentId),
    });

    this.app.use("*", logger());
    this.app.use(
      "*",
      cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization", "X-Town-Agent"],
      }),
    );
    this.app.use(
      "*",
      createRouteAuthGuardMiddleware(
        this.authService,
        [
          ...CONTROL_PLANE_AUTH_ROUTE_POLICIES,
          ...listPluginAuthPolicies(createBuiltinPlugins()),
        ],
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
    this.agentSdkPublishRuntime = registerAgentSdkPublishRoutes({
      app: this.app,
      handlers: {
        agentRpcPool: this.agentRpcPool,
      },
    });
    registerPlatformApiRoutes({
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
        listLocalModels: (projectRoot) => this.listLocalModels(projectRoot),
        inspectAgentRestartSafety: (projectRoot) => this.inspectAgentRestartSafety(projectRoot),
        restartAgentByProjectRoot: (projectRoot) => this.restartAgentByProjectRoot(projectRoot),
        stopAgentByProjectRoot: (projectRoot) => this.stopAgentByProjectRoot(projectRoot),
        buildConfigStatusResponse: (requestedAgentId) => this.buildConfigStatusResponse(requestedAgentId),
        resolveAgentById: (requestedAgentId) => this.resolveAgentById(requestedAgentId),
        executeShellCommand: (args) => this.executeShellCommand(args),
        buildModelResponse: (requestedAgentId) => this.buildModelResponse(requestedAgentId),
        resolveSelectedAgent: (requestedAgentId) => this.resolveSelectedAgent(requestedAgentId),
        serveFrontendPath: (c, reqPath) => this.serveFrontendPath(c, reqPath),
        agentRpcPool: this.agentRpcPool,
      },
    });
  }

  private readRequestedAgentId(request: Request): string {
    return readRequestedPlatformAgentId(request);
  }

  private async pickDirectoryPath(): Promise<string> {
    return pickPlatformAgentDirectoryPath();
  }

  private async listKnownAgents(): Promise<PlatformAgentOption[]> {
    return listKnownPlatformAgents();
  }

  private async buildAgentsResponse(
    requestedAgentId: string,
  ): Promise<PlatformAgentsResponse> {
    return buildPlatformAgentsResponse({
      requestedAgentId,
      cityVersion: DC_VERSION,
      agentRpcPool: this.agentRpcPool,
    });
  }

  /**
   * 构建 City AIService Model 面板响应。
   *
   * 关键点（中文）
   * - 模型目录来自 City AIService，而不是 Town 本地模型池。
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
    return buildPlatformModelResponse({
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
    scope: "platform" | "agent";
    label: string;
    filePath: string;
  }): Promise<PlatformConfigFileStatusItem> {
    return readPlatformConfigFileStatus(params);
  }

  /**
   * 构建配置文件状态响应。
   *
   * 关键点（中文）
   * - `platform` 维度始终返回。
   * - `agent` 维度仅在存在选中 agent 时返回，避免误导。
   */
  private async buildConfigStatusResponse(
    requestedAgentId: string,
  ): Promise<PlatformConfigStatusResponse> {
    return buildPlatformConfigStatusResponse({
      requestedAgentId,
      cityVersion: DC_VERSION,
    });
  }

  private async resolveSelectedAgent(
    requestedAgentId: string,
  ): Promise<PlatformAgentOption | null> {
    return resolveSelectedPlatformAgent(requestedAgentId, DC_VERSION, {
      agentRpcPool: this.agentRpcPool,
    });
  }

  /**
   * 根据 id 查找 agent（允许离线 agent，用于 command 页面）。
   */
  private async resolveAgentById(
    requestedAgentId: string,
  ): Promise<PlatformAgentOption | null> {
    return resolvePlatformAgentById(requestedAgentId);
  }

  /**
   * 探测目录状态，用于“打开文件夹”流程。
   */
  private async inspectAgentDirectory(
    projectRoot: string,
  ): Promise<PlatformAgentDirectoryInspection> {
    return inspectPlatformAgentDirectory(projectRoot);
  }

  /**
   * 列出可直接用于 local executor 的本地 GGUF 模型。
   */
  private async listLocalModels(
    projectRoot?: string,
  ): Promise<PlatformLocalModelsResponse> {
    return { success: true, modelsDir: "~/.models", models: [] };
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
    return executeAgentProjectShellCommand(params);
  }

  private async initializeAgentProject(projectRoot: string, initialization: {
    id?: unknown;
    modelId?: unknown;
    forceOverwriteShipJson?: unknown;
  }): Promise<AgentProjectInitializationResult> {
    return initializePlatformAgentProject({
      projectRoot,
      id: initialization.id,
      modelId: initialization.modelId,
      forceOverwriteShipJson: initialization.forceOverwriteShipJson,
    });
  }

  private async startAgentByProjectRoot(projectRoot: string, options?: {
    initializeIfNeeded?: boolean;
    initialization?: {
      id?: unknown;
      modelId?: unknown;
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
    return startManagedAgentByProjectRoot({
      projectRoot,
      cliPath: resolveTownCliPath(),
      initializeIfNeeded: options?.initializeIfNeeded,
      initialization: options?.initialization,
    });
  }

  private async updateAgentExecution(projectRoot: string, input: {
    modelId?: unknown;
  }): Promise<{
    projectRoot: string;
    modelId: string;
  }> {
    return updatePlatformAgentExecution({
      projectRoot,
      modelId: input.modelId,
    });
  }


  private async inspectAgentRestartSafety(projectRoot: string): Promise<{
    activeContexts: string[];
    activeTasks: string[];
  }> {
    return inspectManagedAgentRestartSafety({
      projectRoot,
      listKnownAgents: () => this.listKnownAgents(),
      agentRpcPool: this.agentRpcPool,
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
    return restartManagedAgentByProjectRoot({
      projectRoot,
      cliPath: resolveTownCliPath(),
    });
  }

  private async stopAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    stopped: boolean;
    pid?: number;
    message?: string;
  }> {
    return stopManagedAgentByProjectRoot(projectRoot);
  }

  private async serveFrontendPath(c: Context, reqPath: string): Promise<Response> {
    return serveControlPlaneFrontendPath({
      context: c,
      publicDir: this.publicDir,
      requestPath: reqPath,
    });
  }

  /**
   * 启动 UI 网关。
   */
  async start(options: ControlGatewayStartOptions): Promise<void> {
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
          const abort_controller = new AbortController();
          const request = new Request(url.toString(), {
            method,
            headers: new Headers(req.headers as Record<string, string>),
            body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
            signal: abort_controller.signal,
          });
          res.on("close", () => abort_controller.abort());
          const response = await this.app.fetch(request);
          res.statusCode = response.status;
          for (const [key, value] of response.headers.entries()) {
            res.setHeader(key, value);
          }
          if (!response.body) {
            res.end();
            return;
          }
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
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
    await this.agentSdkPublishRuntime?.close();
    await this.agentRpcPool.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

export function createControlGateway(): ControlGateway {
  return new ControlGateway();
}
