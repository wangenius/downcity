/**
 * PlatformApiRoutes：平台控制面 API 路由注册。
 *
 * 关键点（中文）
 * - 路由注册从 `ControlGateway` 宿主类中拆出，避免网关门面继续膨胀。
 * - 这里不持有状态，只消费宿主提供的 handlers。
 */
import type { Hono, Context } from "hono";
import type { AgentRpcPool } from "@/town/gateway/AgentRpcPool.js";
import type { PlatformAgentDirectoryInspection, PlatformAgentOption, PlatformAgentsResponse, PlatformConfigStatusResponse, PlatformLocalModelsResponse } from "@downcity/agent";
import type { AgentProjectInitializationResult } from "@downcity/agent";
/**
 * 控制面路由宿主能力。
 */
export interface PlatformApiRouteHandlers {
    /** 读取请求中的 agentId。 */
    readRequestedAgentId(request: Request): string;
    /** 构建 agents 响应。 */
    buildAgentsResponse(requestedAgentId: string): Promise<PlatformAgentsResponse>;
    /** 初始化 agent 项目骨架。 */
    initializeAgentProject(projectRoot: string, initialization: {
        id?: unknown;
        modelId?: unknown;
        forceOverwriteShipJson?: unknown;
    }): Promise<AgentProjectInitializationResult>;
    /** 通过目录启动 agent。 */
    startAgentByProjectRoot(projectRoot: string, options?: {
        initializeIfNeeded?: boolean;
        initialization?: {
            id?: unknown;
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
    /** 更新 agent 执行绑定。 */
    updateAgentExecution(projectRoot: string, input: {
        modelId?: unknown;
    }): Promise<{
        projectRoot: string;
        modelId: string;
    }>;
    /** 选择系统目录。 */
    pickDirectoryPath(): Promise<string>;
    inspectAgentDirectory(projectRoot: string): Promise<PlatformAgentDirectoryInspection>;
    /** 列出本地 GGUF 模型。 */
    listLocalModels(projectRoot?: string): Promise<PlatformLocalModelsResponse>;
    /** 探测 agent 目录状态。 */
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
    buildConfigStatusResponse(requestedAgentId: string): Promise<PlatformConfigStatusResponse>;
    /** 根据 id 查找 agent。 */
    resolveAgentById(requestedAgentId: string): Promise<PlatformAgentOption | null>;
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
    resolveSelectedAgent(requestedAgentId: string): Promise<PlatformAgentOption | null>;
    /** 托管前端静态资源。 */
    serveFrontendPath(c: Context, reqPath: string): Promise<Response>;
    /** Town 维护的 Agent RPC 连接池。 */
    agentRpcPool: AgentRpcPool;
}
/**
 * 注册平台控制面 API 路由。
 */
export declare function registerPlatformApiRoutes(params: {
    app: Hono;
    handlers: PlatformApiRouteHandlers;
}): void;
//# sourceMappingURL=PlatformApiRoutes.d.ts.map