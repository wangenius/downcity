/**
 * City AIService 模型路由。
 *
 * 关键点（中文）
 * - 聚合 `/api/ui/model*` 路由，避免网关主文件过长。
 * - Town 不再提供模型池 CRUD，只负责读取 City AIService 模型目录与更新 agent 绑定。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
export declare function registerPlatformModelRoutes(params: {
    app: Hono;
    readRequestedAgentId: (request: Request) => string;
    resolveSelectedAgent: (requestedAgentId: string) => Promise<PlatformAgentOption | null>;
    buildModelResponse: (requestedAgentId: string) => Promise<{
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
}): void;
//# sourceMappingURL=ModelApiRoutes.d.ts.map