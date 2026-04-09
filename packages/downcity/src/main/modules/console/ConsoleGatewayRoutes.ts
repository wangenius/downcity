/**
 * ConsoleGatewayRoutes：Console 网关路由注册。
 *
 * 关键点（中文）
 * - 路由注册从 `ConsoleGateway` 宿主类中拆出，避免网关门面继续膨胀。
 * - 这里不持有状态，只消费宿主提供的 handlers。
 */

import type { Hono, Context } from "hono";
import { registerConsoleModelRoutes } from "@/main/modules/console/ModelApiRoutes.js";
import { registerConsoleInlineInstantRoutes } from "@/main/modules/console/InlineInstantRoutes.js";
import { registerConsoleChannelAccountRoutes } from "@/main/modules/console/ChannelAccountApiRoutes.js";
import { registerConsoleEnvRoutes } from "@/main/modules/console/EnvApiRoutes.js";
import { registerConsoleAgentStatusRoutes } from "@/main/modules/console/AgentStatusApiRoutes.js";
import { registerConsolePluginRoutes } from "@/main/modules/console/PluginApiRoutes.js";
import type {
  ConsoleAgentDirectoryInspection,
  ConsoleAgentOption,
  ConsoleAgentsResponse,
  ConsoleConfigFileStatusItem,
  ConsoleConfigStatusResponse,
  ConsoleLocalModelsResponse,
} from "@/shared/types/Console.js";
import type { AgentProjectInitializationResult } from "@/shared/types/AgentProject.js";
import { buildConsoleWorkloadBlockPayload } from "@/main/modules/console/gateway/GatewaySupport.js";

/**
 * Console 路由宿主能力。
 */
export interface ConsoleGatewayRouteHandlers {
  /** 读取请求中的 agentId。 */
  readRequestedAgentId(request: Request): string;
  /** 构建 agents 响应。 */
  buildAgentsResponse(requestedAgentId: string): Promise<ConsoleAgentsResponse>;
  /** 初始化 agent 项目骨架。 */
  initializeAgentProject(projectRoot: string, initialization: {
    agentName?: unknown;
    executionMode?: unknown;
    modelId?: unknown;
    localModel?: unknown;
    agentType?: unknown;
    forceOverwriteShipJson?: unknown;
  }): Promise<AgentProjectInitializationResult>;
  /** 通过目录启动 agent。 */
  startAgentByProjectRoot(projectRoot: string, options?: {
    initializeIfNeeded?: boolean;
    initialization?: {
      agentName?: unknown;
      executionMode?: unknown;
      modelId?: unknown;
      localModel?: unknown;
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
  }>;
  /** 更新 agent 执行绑定。 */
  updateAgentExecution(projectRoot: string, input: {
    executionMode?: unknown;
    modelId?: unknown;
    localModel?: unknown;
    agentType?: unknown;
  }): Promise<{
    projectRoot: string;
    executionMode: "api" | "acp" | "local";
    modelId?: string;
    agentType?: "codex" | "claude" | "kimi";
  }>;
  /** 选择系统目录。 */
  pickDirectoryPath(): Promise<string>;
  /** 探测 agent 目录状态。 */
  inspectAgentDirectory(projectRoot: string): Promise<ConsoleAgentDirectoryInspection>;
  /** 列出本地 GGUF 模型。 */
  listLocalModels(projectRoot?: string): Promise<ConsoleLocalModelsResponse>;
  /** 检查 agent 停止/重启安全性。 */
  inspectAgentRestartSafety(projectRoot: string): Promise<{
    activeContexts: string[];
    activeTasks: string[];
  }>;
  /** 重启 agent。 */
  restartAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    restarted: boolean;
    pid?: number;
    logPath?: string;
    message?: string;
  }>;
  /** 停止 agent。 */
  stopAgentByProjectRoot(projectRoot: string): Promise<{
    success: boolean;
    projectRoot: string;
    stopped: boolean;
    pid?: number;
    message?: string;
  }>;
  /** 构建 config-status 响应。 */
  buildConfigStatusResponse(requestedAgentId: string): Promise<ConsoleConfigStatusResponse>;
  /** 根据 id 查找 agent。 */
  resolveAgentById(requestedAgentId: string): Promise<ConsoleAgentOption | null>;
  /** 执行 shell 命令。 */
  executeShellCommand(params: {
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
  }>;
  /** 构建 model 响应。 */
  buildModelResponse(requestedAgentId: string): Promise<{
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
  }>;
  /** 解析当前选中的 agent。 */
  resolveSelectedAgent(requestedAgentId: string): Promise<ConsoleAgentOption | null>;
  /** 构建 upstream URL。 */
  buildUpstreamUrl(requestUrl: URL, baseUrl: string): string;
  /** 代理请求。 */
  forwardRequest(request: Request, upstreamUrl: string): Promise<Response>;
  /** 托管前端静态资源。 */
  serveFrontendPath(c: Context, reqPath: string): Promise<Response>;
}

/**
 * 注册 Console 网关路由。
 */
export function registerConsoleGatewayRoutes(params: {
  app: Hono;
  handlers: ConsoleGatewayRouteHandlers;
}): void {
  const { app, handlers } = params;

  app.get("/health", async (c) => {
    return c.json({
      status: "ok",
      type: "console",
    });
  });

  app.get("/api/ui/agents", async (c) => {
    try {
      const requestedAgentId = handlers.readRequestedAgentId(c.req.raw);
      const payload = await handlers.buildAgentsResponse(requestedAgentId);
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/start", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        agentId?: unknown;
        projectRoot?: unknown;
        initializeIfNeeded?: unknown;
        initialization?: {
          agentName?: unknown;
          executionMode?: unknown;
          modelId?: unknown;
          localModel?: unknown;
          agentType?: unknown;
          forceOverwriteShipJson?: unknown;
        };
      };
      const rawProject = String(body.projectRoot || body.agentId || "").trim();
      if (!rawProject) {
        return c.json({ success: false, error: "projectRoot is required" }, 400);
      }
      const payload = await handlers.startAgentByProjectRoot(rawProject, {
        initializeIfNeeded: body.initializeIfNeeded === true,
        initialization: body.initialization,
      });
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/create", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        projectRoot?: unknown;
        agentName?: unknown;
        executionMode?: unknown;
        modelId?: unknown;
        localModel?: unknown;
        agentType?: unknown;
        autoStart?: unknown;
        forceOverwriteShipJson?: unknown;
      };
      const rawProject = String(body.projectRoot || "").trim();
      if (!rawProject) {
        return c.json({ success: false, error: "projectRoot is required" }, 400);
      }
      const initResult = await handlers.initializeAgentProject(rawProject, {
        agentName: body.agentName,
        executionMode: body.executionMode,
        modelId: body.modelId,
        localModel: body.localModel,
        agentType: body.agentType,
        forceOverwriteShipJson: body.forceOverwriteShipJson,
      });
      if (body.autoStart === false) {
        return c.json({
          success: true,
          created: true,
          started: false,
          projectRoot: initResult.projectRoot,
          agentName: initResult.agentName,
          message: "created",
        });
      }
      const payload = await handlers.startAgentByProjectRoot(initResult.projectRoot);
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/system/pick-directory", async (c) => {
    try {
      const directoryPath = await handlers.pickDirectoryPath();
      return c.json({ success: true, directoryPath });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/inspect", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        projectRoot?: unknown;
        agentId?: unknown;
      };
      const rawProject = String(body.projectRoot || body.agentId || "").trim();
      if (!rawProject) {
        return c.json({ success: false, error: "projectRoot is required" }, 400);
      }
      const inspection = await handlers.inspectAgentDirectory(rawProject);
      return c.json({ success: true, inspection });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/local-models", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        projectRoot?: unknown;
        agentId?: unknown;
      };
      const rawProject = String(body.projectRoot || body.agentId || "").trim();
      const payload = await handlers.listLocalModels(rawProject || undefined);
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/execution", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        agentId?: unknown;
        projectRoot?: unknown;
        executionMode?: unknown;
        modelId?: unknown;
        localModel?: unknown;
        agentType?: unknown;
      };
      const rawProject = String(body.projectRoot || body.agentId || "").trim();
      if (!rawProject) {
        return c.json({ success: false, error: "projectRoot is required" }, 400);
      }
      const payload = await handlers.updateAgentExecution(rawProject, {
        executionMode: body.executionMode,
        modelId: body.modelId,
        localModel: body.localModel,
        agentType: body.agentType,
      });
      return c.json({
        success: true,
        ...payload,
        restartRequired: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/restart", async (c) => {
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
      const forceRestart = body.force === true;
      const checks = await handlers.inspectAgentRestartSafety(rawProject);
      const hasBlocking =
        checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
      if (hasBlocking && !forceRestart) {
        return c.json(
          buildConsoleWorkloadBlockPayload("restart", checks),
          409,
        );
      }
      const payload = await handlers.restartAgentByProjectRoot(rawProject);
      return c.json({
        ...payload,
        activeContexts: checks.activeContexts,
        activeTasks: checks.activeTasks,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/agents/stop", async (c) => {
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
      const forceStop = body.force === true;
      const checks = await handlers.inspectAgentRestartSafety(rawProject);
      const hasBlocking =
        checks.activeContexts.length > 0 || checks.activeTasks.length > 0;
      if (hasBlocking && !forceStop) {
        return c.json(
          buildConsoleWorkloadBlockPayload("stop", checks),
          409,
        );
      }
      const payload = await handlers.stopAgentByProjectRoot(rawProject);
      return c.json({
        ...payload,
        activeContexts: checks.activeContexts,
        activeTasks: checks.activeTasks,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/ui/config-status", async (c) => {
    try {
      const requestedAgentId = handlers.readRequestedAgentId(c.req.raw);
      const payload = await handlers.buildConfigStatusResponse(requestedAgentId);
      return c.json(payload);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/ui/command/execute", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        agentId?: unknown;
        command?: unknown;
        timeoutMs?: unknown;
      };
      const requestedAgentId = String(
        body.agentId || handlers.readRequestedAgentId(c.req.raw) || "",
      ).trim();
      if (!requestedAgentId) {
        return c.json({ success: false, error: "agentId is required" }, 400);
      }
      const command = String(body.command || "").trim();
      if (!command) {
        return c.json({ success: false, error: "command is required" }, 400);
      }

      const selectedAgent = await handlers.resolveAgentById(requestedAgentId);
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

      const result = await handlers.executeShellCommand({
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

  registerConsoleModelRoutes({
    app,
    readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
    resolveSelectedAgent: (requestedAgentId) =>
      handlers.resolveSelectedAgent(requestedAgentId),
    buildModelResponse: (requestedAgentId) =>
      handlers.buildModelResponse(requestedAgentId),
  });
  registerConsoleInlineInstantRoutes({
    app,
    resolveAgentById: (requestedAgentId) => handlers.resolveAgentById(requestedAgentId),
  });
  registerConsoleChannelAccountRoutes({ app });
  registerConsoleEnvRoutes({ app });
  registerConsoleAgentStatusRoutes({
    app,
    readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
    resolveSelectedAgent: (requestedAgentId) =>
      handlers.resolveSelectedAgent(requestedAgentId),
  });
  registerConsolePluginRoutes({
    app,
    readRequestedAgentId: (request) => handlers.readRequestedAgentId(request),
    resolveSelectedAgent: (requestedAgentId) =>
      handlers.resolveSelectedAgent(requestedAgentId),
  });

  app.all("/api/*", async (c) => {
    try {
      const reqUrl = new URL(c.req.url);
      if (reqUrl.pathname.startsWith("/api/ui/")) {
        return c.json({ success: false, error: "Not Found" }, 404);
      }

      const requestedAgentId = handlers.readRequestedAgentId(c.req.raw);
      const selection = await handlers.resolveSelectedAgent(requestedAgentId);
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
            error: "Selected agent endpoint is unavailable.",
          },
          503,
        );
      }
      const upstreamUrl = handlers.buildUpstreamUrl(reqUrl, selection.baseUrl);
      const response = await handlers.forwardRequest(c.req.raw, upstreamUrl);
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

  app.get("/*", async (c) => {
    const reqPath = String(c.req.path || "/");
    if (reqPath.startsWith("/api/")) {
      return c.json({ success: false, error: "Not Found" }, 404);
    }
    return handlers.serveFrontendPath(c, reqPath);
  });
}
