/**
 * Console 模型池服务。
 *
 * 关键点（中文）
 * - 统一封装 provider/model 的增删改查与测试逻辑，供 CLI 与 Console API 共同复用。
 * - 删除保护、引用检查、输入校验都在这里收敛，避免多处实现漂移。
 * - Provider 的密钥仅返回脱敏视图，避免在 UI 或 CLI 输出中泄露明文。
 */
import type { StoredModel, StoredModelProvider } from "@downcity/agent";
/**
 * ModelPoolService：提供 CLI / UI 共用的模型池管理能力。
 */
export declare class ModelPoolService {
    /**
     * 读取模型池快照。
     */
    listPool(): Promise<{
        providers: Array<{
            id: string;
            type: string;
            baseUrl?: string;
            hasApiKey: boolean;
            apiKeyMasked?: string;
            createdAt: string;
            updatedAt: string;
        }>;
        models: Array<{
            id: string;
            providerId: string;
            name: string;
            temperature?: number;
            maxTokens?: number;
            topP?: number;
            frequencyPenalty?: number;
            presencePenalty?: number;
            anthropicVersion?: string;
            isPaused: boolean;
            createdAt: string;
            updatedAt: string;
        }>;
        providerIds: string[];
        modelIds: string[];
    }>;
    /**
     * 读取单个 provider 以及它绑定的模型。
     */
    getProviderUsage(providerId: string): Promise<{
        provider: StoredModelProvider;
        models: StoredModel[];
    }>;
    /**
     * 读取单个 model 以及它被哪些 agent 项目引用。
     */
    getModelUsage(modelId: string): Promise<{
        model: StoredModel;
        references: Array<{
            projectRoot: string;
            shipJsonPath: string;
            agentId?: string;
        }>;
    }>;
    /**
     * 新增或更新 provider。
     */
    upsertProvider(input: {
        id: string;
        type: string;
        baseUrl?: string;
        apiKey?: string;
        clearBaseUrl?: boolean;
        clearApiKey?: boolean;
    }): Promise<{
        providerId: string;
        provider: {
            id: string;
            type: string;
            baseUrl?: string;
            hasApiKey: boolean;
            apiKeyMasked?: string;
        };
    }>;
    /**
     * 删除 provider。
     */
    removeProvider(providerId: string): Promise<void>;
    /**
     * 测试 provider 并返回发现结果。
     */
    testProvider(providerId: string): Promise<{
        providerId: string;
        discoveredModels: string[];
        modelCount: number;
        status?: number;
    }>;
    /**
     * 发现 provider 模型并可选自动写入模型池。
     */
    discoverProvider(params: {
        providerId: string;
        autoAdd?: boolean;
        prefix?: string;
    }): Promise<{
        providerId: string;
        discoveredModels: string[];
        modelCount: number;
        autoAdded: Array<{
            modelId: string;
            modelName: string;
        }>;
    }>;
    /**
     * 新增或更新 model。
     */
    upsertModel(input: {
        id: string;
        providerId: string;
        name: string;
        temperature?: unknown;
        maxTokens?: unknown;
        topP?: unknown;
        frequencyPenalty?: unknown;
        presencePenalty?: unknown;
        anthropicVersion?: string;
        isPaused?: boolean;
    }): Promise<{
        modelId: string;
    }>;
    /**
     * 删除 model。
     */
    removeModel(modelId: string): Promise<void>;
    /**
     * 设置 model pause 状态。
     */
    setModelPaused(modelId: string, isPaused: boolean): Promise<void>;
    /**
     * 测试 model 可调用性（真实推理调用）。
     */
    testModel(modelId: string, prompt?: string): Promise<{
        modelId: string;
        prompt: string;
        text: string;
    }>;
}
//# sourceMappingURL=ModelPoolService.d.ts.map