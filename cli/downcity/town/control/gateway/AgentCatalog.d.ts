/**
 * 平台 agent 目录与状态辅助。
 *
 * 关键点（中文）
 * - 负责 agent 列表、选中逻辑、模型面板、配置文件状态等“只读聚合”能力。
 * - 不处理进程控制；启动 / 停止逻辑单独放到 AgentActions 中。
 */
import type { PlatformAgentOption, PlatformAgentsResponse, PlatformConfigFileStatusItem, PlatformConfigStatusResponse, PlatformAgentDirectoryInspection } from "@downcity/agent";
import type { AgentRpcPool } from "../../control/gateway/AgentRpcPool.js";
/**
 * 从请求中读取当前指向的 agent id。
 */
export declare function readRequestedPlatformAgentId(request: Request): string;
type AgentCatalogOptions = {
    /**
     * Town 维护的 Agent RPC 连接池。
     */
    agentRpcPool?: AgentRpcPool;
};
/**
 * 枚举平台控制面注册表中的所有 agent。
 */
export declare function listKnownPlatformAgents(options?: AgentCatalogOptions): Promise<PlatformAgentOption[]>;
/**
 * 构建 agent 列表响应。
 */
export declare function buildPlatformAgentsResponse(params: {
    requestedAgentId: string;
    cityVersion: string;
    agentRpcPool?: AgentRpcPool;
}): Promise<PlatformAgentsResponse>;
/**
 * 解析当前选中的运行中 agent。
 */
export declare function resolveSelectedPlatformAgent(requestedAgentId: string, cityVersion: string, options?: AgentCatalogOptions): Promise<PlatformAgentOption | null>;
/**
 * 按 id 查找 agent，允许离线状态。
 */
export declare function resolvePlatformAgentById(requestedAgentId: string): Promise<PlatformAgentOption | null>;
/**
 * 探测目录是否已具备 agent 运行条件。
 */
export declare function inspectPlatformAgentDirectory(projectRoot: string): Promise<PlatformAgentDirectoryInspection>;
/**
 * 构建 City AIService Model 面板响应。
 *
 * 关键点（中文）
 * - 读取当前选中 agent 的 `execution.modelId`，再去 City AIService 模型目录补全展示信息。
 * - Town 这里只返回可绑定模型视图，不维护 provider/model 配置。
 */
export declare function buildPlatformModelResponse(params: {
    requestedAgentId: string;
    cityVersion: string;
}): Promise<{
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
/**
 * 读取单个配置文件状态。
 */
export declare function readPlatformConfigFileStatus(params: {
    key: string;
    scope: "platform" | "agent";
    label: string;
    filePath: string;
}): Promise<PlatformConfigFileStatusItem>;
/**
 * 构建配置状态响应。
 */
export declare function buildPlatformConfigStatusResponse(params: {
    requestedAgentId: string;
    cityVersion: string;
}): Promise<PlatformConfigStatusResponse>;
export {};
//# sourceMappingURL=AgentCatalog.d.ts.map