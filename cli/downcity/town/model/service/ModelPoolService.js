/**
 * Console 模型池服务。
 *
 * 关键点（中文）
 * - 统一封装 provider/model 的增删改查与测试逻辑，供 CLI 与 Console API 共同复用。
 * - 删除保护、引用检查、输入校验都在这里收敛，避免多处实现漂移。
 * - Provider 的密钥仅返回脱敏视图，避免在 UI 或 CLI 输出中泄露明文。
 */
import fs from "fs-extra";
import { generateText } from "ai";
import { getDowncityJsonPath } from "../../config/Paths.js";
import { PlatformStore } from "../../platform/store/index.js";
import { listManagedAgentEntries } from "../../process/registry/TownRegistry.js";
import { discoverProviderModels } from "../../model/ModelSupport.js";
import { createRuntimeModel } from "../../model/runtime/CreateRuntimeModel.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "../../env/ProcessEnv.js";
const SUPPORTED_PROVIDER_TYPES = [
    "anthropic",
    "openai",
    "deepseek",
    "gemini",
    "open-compatible",
    "open-responses",
    "moonshot-cn",
    "moonshot-ai",
    "kimi-code",
    "xai",
    "huggingface",
    "openrouter",
];
function maskSecret(value) {
    const raw = String(value || "").trim();
    if (!raw)
        return "";
    if (raw.length <= 8)
        return "***";
    return `${raw.slice(0, 4)}***${raw.slice(-4)}`;
}
function assertProviderType(inputType) {
    const candidate = String(inputType || "").trim();
    if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
        throw new Error(`Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`);
    }
    return candidate;
}
function parseOptionalNumber(input) {
    if (input === undefined || input === null || input === "")
        return undefined;
    const num = Number(input);
    if (!Number.isFinite(num) || Number.isNaN(num)) {
        throw new Error(`Invalid number: ${String(input)}`);
    }
    return num;
}
function parseOptionalPositiveInteger(input) {
    if (input === undefined || input === null || input === "")
        return undefined;
    const num = Number.parseInt(String(input), 10);
    if (!Number.isFinite(num) || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
        throw new Error(`Invalid positive integer: ${String(input)}`);
    }
    return num;
}
function formatModelIds(modelIds) {
    return modelIds.map((modelId) => `"${modelId}"`).join(", ");
}
function formatAgentReference(reference) {
    const agentId = String(reference.agentId || "").trim();
    if (agentId) {
        return `${agentId} (${reference.projectRoot})`;
    }
    return reference.projectRoot;
}
async function listModelReferences(modelId) {
    const references = [];
    const entries = await listManagedAgentEntries();
    for (const entry of entries) {
        const projectRoot = String(entry.projectRoot || "").trim();
        if (!projectRoot)
            continue;
        const shipJsonPath = getDowncityJsonPath(projectRoot);
        if (!(await fs.pathExists(shipJsonPath)))
            continue;
        try {
            const raw = (await fs.readJson(shipJsonPath));
            const executionType = String(raw?.execution?.type || "").trim();
            const candidateModelId = String(raw?.execution?.modelId || "").trim();
            if (executionType !== "api" || candidateModelId !== modelId)
                continue;
            const agentId = String(raw?.id || "").trim() || undefined;
            references.push({
                projectRoot,
                shipJsonPath,
                agentId,
            });
        }
        catch {
            continue;
        }
    }
    return references.sort((a, b) => a.projectRoot.localeCompare(b.projectRoot));
}
/**
 * ModelPoolService：提供 CLI / UI 共用的模型池管理能力。
 */
export class ModelPoolService {
    /**
     * 读取模型池快照。
     */
    async listPool() {
        const store = new PlatformStore();
        try {
            const providersRaw = await store.listProviders();
            const models = store.listModels();
            const providers = providersRaw.map((item) => ({
                id: item.id,
                type: item.type,
                baseUrl: item.baseUrl,
                hasApiKey: String(item.apiKey || "").trim().length > 0,
                apiKeyMasked: maskSecret(item.apiKey),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            }));
            return {
                providers,
                models,
                providerIds: providers.map((x) => x.id),
                modelIds: models.map((x) => x.id),
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 读取单个 provider 以及它绑定的模型。
     */
    async getProviderUsage(providerId) {
        const id = String(providerId || "").trim();
        if (!id)
            throw new Error("providerId cannot be empty");
        const store = new PlatformStore();
        try {
            const provider = await store.getProvider(id);
            if (!provider)
                throw new Error(`Provider not found: ${id}`);
            const models = store
                .listModels()
                .filter((model) => model.providerId === id)
                .sort((a, b) => a.id.localeCompare(b.id));
            return {
                provider,
                models,
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 读取单个 model 以及它被哪些 agent 项目引用。
     */
    async getModelUsage(modelId) {
        const id = String(modelId || "").trim();
        if (!id)
            throw new Error("modelId cannot be empty");
        const store = new PlatformStore();
        try {
            const model = store.getModel(id);
            if (!model)
                throw new Error(`Model not found: ${id}`);
            const references = await listModelReferences(id);
            return {
                model,
                references,
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 新增或更新 provider。
     */
    async upsertProvider(input) {
        const id = String(input.id || "").trim();
        if (!id)
            throw new Error("providerId cannot be empty");
        const type = assertProviderType(input.type);
        if (input.baseUrl !== undefined && input.clearBaseUrl === true) {
            throw new Error("baseUrl and clearBaseUrl cannot be used together");
        }
        if (input.apiKey !== undefined && input.clearApiKey === true) {
            throw new Error("apiKey and clearApiKey cannot be used together");
        }
        const store = new PlatformStore();
        try {
            const current = await store.getProvider(id);
            const nextBaseUrl = input.clearBaseUrl === true
                ? undefined
                : input.baseUrl !== undefined
                    ? String(input.baseUrl || "").trim() || undefined
                    : current?.baseUrl;
            const nextApiKey = input.clearApiKey === true
                ? undefined
                : input.apiKey !== undefined
                    ? String(input.apiKey || "")
                    : current?.apiKey;
            await store.upsertProvider({
                id,
                type,
                baseUrl: nextBaseUrl,
                apiKey: nextApiKey,
            });
            const saved = await store.getProvider(id);
            return {
                providerId: id,
                provider: {
                    id,
                    type,
                    baseUrl: saved?.baseUrl,
                    hasApiKey: String(saved?.apiKey || "").trim().length > 0,
                    apiKeyMasked: maskSecret(saved?.apiKey),
                },
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 删除 provider。
     */
    async removeProvider(providerId) {
        const usage = await this.getProviderUsage(providerId);
        if (usage.models.length > 0) {
            throw new Error(`Provider "${usage.provider.id}" is still referenced by models: ${formatModelIds(usage.models.map((model) => model.id))}. Remove or rebind those models first.`);
        }
        const store = new PlatformStore();
        try {
            store.removeProvider(usage.provider.id);
        }
        finally {
            store.close();
        }
    }
    /**
     * 测试 provider 并返回发现结果。
     */
    async testProvider(providerId) {
        const id = String(providerId || "").trim();
        if (!id)
            throw new Error("providerId cannot be empty");
        const store = new PlatformStore();
        try {
            const provider = await store.getProvider(id);
            if (!provider)
                throw new Error(`Provider not found: ${id}`);
            const discovery = await discoverProviderModels({
                providerId: id,
                providerType: provider.type,
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
            });
            if (!discovery.ok) {
                throw new Error(discovery.error || `provider test failed (${discovery.status || "n/a"})`);
            }
            return {
                providerId: id,
                discoveredModels: discovery.models,
                modelCount: discovery.models.length,
                status: discovery.status,
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 发现 provider 模型并可选自动写入模型池。
     */
    async discoverProvider(params) {
        const providerId = String(params.providerId || "").trim();
        if (!providerId)
            throw new Error("providerId cannot be empty");
        const store = new PlatformStore();
        try {
            const provider = await store.getProvider(providerId);
            if (!provider)
                throw new Error(`Provider not found: ${providerId}`);
            const discovery = await discoverProviderModels({
                providerId,
                providerType: provider.type,
                baseUrl: provider.baseUrl,
                apiKey: provider.apiKey,
            });
            if (!discovery.ok) {
                throw new Error(discovery.error || `provider discover failed (${discovery.status || "n/a"})`);
            }
            const autoAdded = [];
            if (params.autoAdd === true) {
                const prefix = String(params.prefix || "").trim();
                for (const remoteModelName of discovery.models) {
                    const modelName = String(remoteModelName || "").trim();
                    if (!modelName)
                        continue;
                    const modelId = prefix ? `${prefix}${modelName}` : modelName;
                    if (store.getModel(modelId))
                        continue;
                    store.upsertModel({
                        id: modelId,
                        providerId,
                        name: modelName,
                    });
                    autoAdded.push({ modelId, modelName });
                }
            }
            return {
                providerId,
                discoveredModels: discovery.models,
                modelCount: discovery.models.length,
                autoAdded,
            };
        }
        finally {
            store.close();
        }
    }
    /**
     * 新增或更新 model。
     */
    async upsertModel(input) {
        const id = String(input.id || "").trim();
        if (!id)
            throw new Error("modelId cannot be empty");
        const providerId = String(input.providerId || "").trim();
        if (!providerId)
            throw new Error("providerId cannot be empty");
        const name = String(input.name || "").trim();
        if (!name)
            throw new Error("modelName cannot be empty");
        const store = new PlatformStore();
        try {
            const provider = await store.getProvider(providerId);
            if (!provider)
                throw new Error(`Provider not found: ${providerId}`);
            store.upsertModel({
                id,
                providerId,
                name,
                temperature: parseOptionalNumber(input.temperature),
                maxTokens: parseOptionalPositiveInteger(input.maxTokens),
                topP: parseOptionalNumber(input.topP),
                frequencyPenalty: parseOptionalNumber(input.frequencyPenalty),
                presencePenalty: parseOptionalNumber(input.presencePenalty),
                anthropicVersion: String(input.anthropicVersion || "").trim() || undefined,
                isPaused: input.isPaused === true,
            });
            return { modelId: id };
        }
        finally {
            store.close();
        }
    }
    /**
     * 删除 model。
     */
    async removeModel(modelId) {
        const usage = await this.getModelUsage(modelId);
        if (usage.references.length > 0) {
            throw new Error(`Model "${usage.model.id}" is still used by agent projects: ${usage.references.map((reference) => formatAgentReference(reference)).join(", ")}. Switch those projects to another model first.`);
        }
        const store = new PlatformStore();
        try {
            store.removeModel(usage.model.id);
        }
        finally {
            store.close();
        }
    }
    /**
     * 设置 model pause 状态。
     */
    async setModelPaused(modelId, isPaused) {
        const id = String(modelId || "").trim();
        if (!id)
            throw new Error("modelId cannot be empty");
        const store = new PlatformStore();
        try {
            const model = store.getModel(id);
            if (!model)
                throw new Error(`Model not found: ${id}`);
            store.setModelPaused(id, isPaused);
        }
        finally {
            store.close();
        }
    }
    /**
     * 测试 model 可调用性（真实推理调用）。
     */
    async testModel(modelId, prompt) {
        const id = String(modelId || "").trim();
        if (!id)
            throw new Error("modelId cannot be empty");
        const actualPrompt = String(prompt || "").trim() || "Reply with exactly: OK";
        const model = await createRuntimeModel({
            config: {
                id: "console_model_test",
                version: "1.0.0",
                execution: { type: "api", modelId: id },
            },
            env: mergeProcessEnvWithPlatformGlobalEnv(process.env),
        });
        const result = await generateText({
            model,
            prompt: actualPrompt,
        });
        return {
            modelId: id,
            prompt: actualPrompt,
            text: result.text,
        };
    }
}
//# sourceMappingURL=ModelPoolService.js.map