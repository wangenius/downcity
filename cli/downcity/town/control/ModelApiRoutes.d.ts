/**
 * 平台模型管理路由。
 *
 * 关键点（中文）
 * - 聚合 `/api/ui/model*` 路由，避免网关主文件过长。
 * - 统一承接模型池 CRUD、测试、发现与 agent 绑定切换。
 */
import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import { ModelPoolService } from "../model/service/ModelPoolService.js";
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
    modelPoolService?: Pick<ModelPoolService, "listPool" | "upsertProvider" | "removeProvider" | "testProvider" | "discoverProvider" | "upsertModel" | "removeModel" | "setModelPaused" | "testModel">;
}): void;
//# sourceMappingURL=ModelApiRoutes.d.ts.map