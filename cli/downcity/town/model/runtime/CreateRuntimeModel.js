/**
 * CreateRuntimeModel：Town 宿主侧 LanguageModel 工厂。
 *
 * 关键点（中文）
 * - `@downcity/agent` 只消费 `LanguageModel`，不再负责模型池解析。
 * - Town 负责把 `execution.modelId` 解析成平台模型池中的 provider/model 配置。
 * - 这里统一承接 CLI、control plane、inline instant 等宿主场景的模型创建逻辑。
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createHuggingFace } from "@ai-sdk/huggingface";
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createOpenResponses } from "@ai-sdk/open-responses";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getLogger, } from "@downcity/agent";
import { PlatformStore } from "../../platform/store/index.js";
function normalizeRuntimeEnv(env) {
    const resolved = {};
    if (!env)
        return resolved;
    for (const [key, value] of Object.entries(env)) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey)
            continue;
        if (value === undefined || value === null)
            continue;
        resolved[normalizedKey] = String(value);
    }
    return resolved;
}
function readProjectExecutionBinding(config) {
    const execution = config.execution;
    if (!execution || typeof execution !== "object")
        return null;
    if (execution.type !== "api")
        return null;
    const modelId = String(execution.modelId || "").trim();
    if (!modelId)
        return null;
    return {
        type: "api",
        modelId,
    };
}
function buildResponsesUrl(baseUrl) {
    const trimmed = String(baseUrl || "")
        .trim()
        .replace(/\/+$/, "");
    if (!trimmed)
        return "https://api.openai.com/v1/responses";
    if (trimmed.endsWith("/responses"))
        return trimmed;
    return `${trimmed}/responses`;
}
function normalizeOptionalBaseUrl(value) {
    const trimmed = String(value || "")
        .trim()
        .replace(/\/+$/, "");
    return trimmed || undefined;
}
function resolveProviderDefaultBaseUrl(providerType) {
    if (providerType === "deepseek")
        return "https://api.deepseek.com/v1";
    if (providerType === "moonshot-cn")
        return "https://api.moonshot.cn/v1";
    if (providerType === "moonshot-ai")
        return "https://api.moonshot.ai/v1";
    if (providerType === "kimi-code")
        return "https://api.kimi.com/coding/v1";
    if (providerType === "xai")
        return "https://api.x.ai/v1";
    if (providerType === "openrouter")
        return "https://openrouter.ai/api/v1";
    return undefined;
}
function resolveApiKeyFallback(providerType, env) {
    const runtimeEnv = env || {};
    if (providerType === "gemini") {
        return (runtimeEnv.GEMINI_API_KEY ||
            runtimeEnv.GOOGLE_API_KEY ||
            runtimeEnv.GOOGLE_GENERATIVE_AI_API_KEY ||
            runtimeEnv.API_KEY);
    }
    if (providerType === "anthropic") {
        return runtimeEnv.ANTHROPIC_API_KEY || runtimeEnv.API_KEY;
    }
    if (providerType === "deepseek") {
        return (runtimeEnv.DEEPSEEK_API_KEY ||
            runtimeEnv.OPENAI_API_KEY ||
            runtimeEnv.API_KEY);
    }
    if (providerType === "xai") {
        return runtimeEnv.XAI_API_KEY || runtimeEnv.API_KEY;
    }
    if (providerType === "huggingface") {
        return (runtimeEnv.HUGGINGFACE_API_KEY ||
            runtimeEnv.HF_TOKEN ||
            runtimeEnv.API_KEY);
    }
    if (providerType === "openrouter") {
        return runtimeEnv.OPENROUTER_API_KEY || runtimeEnv.API_KEY;
    }
    if (providerType === "moonshot-cn" || providerType === "moonshot-ai") {
        return (runtimeEnv.MOONSHOT_API_KEY ||
            runtimeEnv.KIMI_API_KEY ||
            runtimeEnv.API_KEY);
    }
    if (providerType === "kimi-code") {
        return (runtimeEnv.KIMI_CODE_API_KEY ||
            runtimeEnv.KIMI_API_KEY ||
            runtimeEnv.MOONSHOT_API_KEY ||
            runtimeEnv.API_KEY);
    }
    return runtimeEnv.OPENAI_API_KEY || runtimeEnv.API_KEY;
}
function normalizeProviderType(value) {
    if (value === "anthropic")
        return value;
    if (value === "openai")
        return value;
    if (value === "deepseek")
        return value;
    if (value === "gemini")
        return value;
    if (value === "open-compatible")
        return value;
    if (value === "open-responses")
        return value;
    if (value === "moonshot-cn")
        return value;
    if (value === "moonshot-ai")
        return value;
    if (value === "kimi-code")
        return value;
    if (value === "xai")
        return value;
    if (value === "huggingface")
        return value;
    if (value === "openrouter")
        return value;
    return null;
}
function readFetchUrl(input) {
    if (typeof input === "string")
        return input;
    if (input instanceof URL)
        return input.toString();
    return input.url;
}
function readFetchMethod(input, init) {
    const methodFromInit = String(init?.method || "").trim().toUpperCase();
    if (methodFromInit)
        return methodFromInit;
    if (typeof input === "object" && "method" in input) {
        const requestMethod = String(input.method || "").trim().toUpperCase();
        if (requestMethod)
            return requestMethod;
    }
    return "POST";
}
function createRuntimeModelLoggingFetch(args) {
    const logger = getLogger();
    const baseFetch = globalThis.fetch.bind(globalThis);
    return async (input, init) => {
        const sessionId = args.getSessionRunScope?.()?.sessionId;
        const url = readFetchUrl(input);
        const method = readFetchMethod(input, init);
        try {
            const response = await baseFetch(input, init);
            if (args.enabled) {
                void logger.log("info", "[town] llm.fetch", {
                    kind: "llm_fetch",
                    url,
                    method,
                    status: response.status,
                    ...(sessionId ? { sessionId } : {}),
                });
            }
            return response;
        }
        catch (error) {
            if (args.enabled) {
                void logger.log("error", "[town] llm.fetch.error", {
                    kind: "llm_fetch_error",
                    url,
                    method,
                    error: String(error || "unknown_error"),
                    ...(sessionId ? { sessionId } : {}),
                });
            }
            throw error;
        }
    };
}
async function resolveConfiguredModel(input) {
    const store = new PlatformStore();
    try {
        const resolved = await store.getResolvedModel(input.primaryModelId);
        if (!resolved) {
            throw new Error(`LLM model config not found in platform store: ${input.primaryModelId}`);
        }
        return resolved;
    }
    finally {
        store.close();
    }
}
/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 读取 `execution.modelId`。
 * 2) 从 Town 平台模型池解析 provider/model。
 * 3) 按 provider type 分发到对应 AI SDK 工厂。
 */
export async function createRuntimeModel(input) {
    const logger = getLogger();
    const runtimeEnv = normalizeRuntimeEnv(input.env);
    const execution = readProjectExecutionBinding(input.config);
    if (!execution) {
        await logger.log("warn", "No agent execution configured");
        throw new Error("No agent execution configured");
    }
    const configLog = input.config.llm?.logMessages;
    const logLlmMessages = typeof configLog === "boolean" ? configLog : true;
    const loggingFetch = createRuntimeModelLoggingFetch({
        enabled: logLlmMessages,
        getSessionRunScope: input.getSessionRunScope,
    });
    const primaryModelId = execution.modelId;
    const { model: modelConfig, provider: providerConfig } = await resolveConfiguredModel({
        ...input,
        primaryModelId,
    });
    if (modelConfig.isPaused === true) {
        await logger.log("warn", `LLM model is paused in platform store: ${primaryModelId}`);
        throw new Error(`LLM model is paused: ${primaryModelId}`);
    }
    const providerKey = providerConfig.id;
    const providerType = normalizeProviderType(providerConfig.type);
    if (!providerType) {
        await logger.log("warn", `Unsupported LLM provider type: ${providerConfig.type}`);
        throw new Error(`Unsupported LLM provider type: ${providerConfig.type}`);
    }
    const resolvedModel = String(modelConfig.name || "").trim();
    if (!resolvedModel) {
        await logger.log("warn", "No LLM model name configured");
        throw new Error("No LLM model name configured");
    }
    const resolvedBaseUrl = normalizeOptionalBaseUrl(providerConfig.baseUrl || resolveProviderDefaultBaseUrl(providerType));
    let resolvedApiKey = String(providerConfig.apiKey || "").trim() || undefined;
    if (!resolvedApiKey) {
        resolvedApiKey = resolveApiKeyFallback(providerType, runtimeEnv);
    }
    if (!resolvedApiKey) {
        await logger.log("warn", "No API Key configured, will use simulation mode");
        throw new Error("No API Key configured, will use simulation mode");
    }
    await logger.log("info", `[main] model primary=${primaryModelId} provider=${providerType}/${providerKey} name=${resolvedModel}${resolvedBaseUrl ? ` baseUrl=${resolvedBaseUrl}` : ""}`, {
        kind: "llm_model_ready",
        primaryModel: primaryModelId,
        providerType,
        providerKey,
        model: resolvedModel,
        ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
        logMessages: logLlmMessages,
    });
    if (providerType === "anthropic") {
        const anthropicProvider = createAnthropic({
            apiKey: resolvedApiKey,
            baseURL: resolvedBaseUrl,
            fetch: loggingFetch,
        });
        return anthropicProvider(resolvedModel);
    }
    if (providerType === "gemini") {
        const googleProvider = createGoogleGenerativeAI({
            apiKey: resolvedApiKey,
            baseURL: resolvedBaseUrl,
            fetch: loggingFetch,
        });
        return googleProvider(resolvedModel);
    }
    if (providerType === "open-responses") {
        const responsesProvider = createOpenResponses({
            url: buildResponsesUrl(resolvedBaseUrl),
            name: providerKey,
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return responsesProvider(resolvedModel);
    }
    if (providerType === "open-compatible") {
        const compatibleProvider = createOpenAICompatible({
            name: providerKey,
            baseURL: resolvedBaseUrl || "https://api.openai.com/v1",
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return compatibleProvider(resolvedModel);
    }
    if (providerType === "kimi-code") {
        const compatibleProvider = createOpenAICompatible({
            name: providerKey,
            baseURL: resolvedBaseUrl || "https://api.kimi.com/coding/v1",
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return compatibleProvider(resolvedModel);
    }
    if (providerType === "moonshot-cn" || providerType === "moonshot-ai") {
        const moonshotProvider = createMoonshotAI({
            baseURL: resolvedBaseUrl,
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return moonshotProvider(resolvedModel);
    }
    if (providerType === "xai") {
        const xaiProvider = createXai({
            baseURL: resolvedBaseUrl,
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return xaiProvider(resolvedModel);
    }
    if (providerType === "huggingface") {
        const huggingFaceProvider = createHuggingFace({
            baseURL: resolvedBaseUrl,
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return huggingFaceProvider(resolvedModel);
    }
    if (providerType === "openrouter") {
        const openRouterProvider = createOpenRouter({
            baseURL: resolvedBaseUrl,
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return openRouterProvider(resolvedModel);
    }
    if (providerType === "deepseek") {
        const deepseekCompatibleProvider = createOpenAICompatible({
            name: providerKey,
            baseURL: resolvedBaseUrl || "https://api.deepseek.com/v1",
            apiKey: resolvedApiKey,
            fetch: loggingFetch,
        });
        return deepseekCompatibleProvider(resolvedModel);
    }
    const openaiProvider = createOpenAI({
        apiKey: resolvedApiKey,
        baseURL: resolvedBaseUrl,
        fetch: loggingFetch,
    });
    return openaiProvider(resolvedModel);
}
//# sourceMappingURL=CreateRuntimeModel.js.map