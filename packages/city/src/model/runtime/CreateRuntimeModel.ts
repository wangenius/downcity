/**
 * CreateRuntimeModel：city 宿主侧 LanguageModel 工厂。
 *
 * 关键点（中文）
 * - `@downcity/agent` 只消费 `LanguageModel`，不再负责模型池解析。
 * - `city` 负责把 `execution.modelId` 解析成平台模型池中的 provider/model 配置。
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
import type { LanguageModel } from "ai";
import {
  getLogger,
  type DowncityConfig,
  type LlmProviderType,
  type StoredModel,
  type StoredModelProvider,
} from "@downcity/agent";
import { PlatformStore } from "@/platform/store/index.js";

type ModelLogContext = {
  /**
   * 当前 session 标识，用于 LLM 请求日志追踪。
   */
  sessionId?: string;
};

type RuntimeModelFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

type RuntimeModelFactoryInput = {
  /**
   * 当前项目配置。
   *
   * 关键点（中文）
   * - 这里只依赖 `execution.modelId` 与 `llm.logMessages`。
   * - provider/model 详情统一从平台模型池读取。
   */
  config: DowncityConfig;
  /**
   * 可选 session run scope。
   *
   * 关键点（中文）
   * - 仅用于把 sessionId 透传到 LLM 请求日志元数据。
   */
  getSessionRunScope?: () => ModelLogContext | undefined;
};

function readProjectExecutionBinding(
  config: DowncityConfig,
): { type: "api"; modelId: string } | null {
  const execution = config.execution;
  if (!execution || typeof execution !== "object") return null;
  if (execution.type !== "api") return null;
  const modelId = String(execution.modelId || "").trim();
  if (!modelId) return null;
  return {
    type: "api",
    modelId,
  };
}

function buildResponsesUrl(baseUrl?: string): string {
  const trimmed = String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1/responses";
  if (trimmed.endsWith("/responses")) return trimmed;
  return `${trimmed}/responses`;
}

function normalizeOptionalBaseUrl(value: string | undefined): string | undefined {
  const trimmed = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  return trimmed || undefined;
}

function resolveProviderDefaultBaseUrl(
  providerType: LlmProviderType,
): string | undefined {
  if (providerType === "deepseek") return "https://api.deepseek.com/v1";
  if (providerType === "moonshot-cn") return "https://api.moonshot.cn/v1";
  if (providerType === "moonshot-ai") return "https://api.moonshot.ai/v1";
  if (providerType === "kimi-code") return "https://api.kimi.com/coding/v1";
  if (providerType === "xai") return "https://api.x.ai/v1";
  if (providerType === "openrouter") return "https://openrouter.ai/api/v1";
  return undefined;
}

function resolveEnvPlaceholder(value: string | undefined): string | undefined {
  if (!value) return value;
  if (value.startsWith("${") && value.endsWith("}")) {
    const envVar = value.slice(2, -1);
    return process.env[envVar];
  }
  return value;
}

function resolveApiKeyFallback(providerType: LlmProviderType): string | undefined {
  if (providerType === "gemini") {
    return (
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.API_KEY
    );
  }
  if (providerType === "anthropic") {
    return process.env.ANTHROPIC_API_KEY || process.env.API_KEY;
  }
  if (providerType === "deepseek") {
    return (
      process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.API_KEY
    );
  }
  if (providerType === "xai") {
    return process.env.XAI_API_KEY || process.env.API_KEY;
  }
  if (providerType === "huggingface") {
    return (
      process.env.HUGGINGFACE_API_KEY ||
      process.env.HF_TOKEN ||
      process.env.API_KEY
    );
  }
  if (providerType === "openrouter") {
    return process.env.OPENROUTER_API_KEY || process.env.API_KEY;
  }
  if (providerType === "moonshot-cn" || providerType === "moonshot-ai") {
    return (
      process.env.MOONSHOT_API_KEY ||
      process.env.KIMI_API_KEY ||
      process.env.API_KEY
    );
  }
  if (providerType === "kimi-code") {
    return (
      process.env.KIMI_CODE_API_KEY ||
      process.env.KIMI_API_KEY ||
      process.env.MOONSHOT_API_KEY ||
      process.env.API_KEY
    );
  }
  return process.env.OPENAI_API_KEY || process.env.API_KEY;
}

function normalizeProviderType(value: unknown): LlmProviderType | null {
  if (value === "anthropic") return value;
  if (value === "openai") return value;
  if (value === "deepseek") return value;
  if (value === "gemini") return value;
  if (value === "open-compatible") return value;
  if (value === "open-responses") return value;
  if (value === "moonshot-cn") return value;
  if (value === "moonshot-ai") return value;
  if (value === "kimi-code") return value;
  if (value === "xai") return value;
  if (value === "huggingface") return value;
  if (value === "openrouter") return value;
  return null;
}

function readFetchUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readFetchMethod(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): string {
  const methodFromInit = String(init?.method || "").trim().toUpperCase();
  if (methodFromInit) return methodFromInit;
  if (typeof input === "object" && "method" in input) {
    const requestMethod = String(input.method || "").trim().toUpperCase();
    if (requestMethod) return requestMethod;
  }
  return "POST";
}

function createRuntimeModelLoggingFetch(args: {
  enabled: boolean;
  getSessionRunScope?: () => ModelLogContext | undefined;
}): RuntimeModelFetch {
  const logger = getLogger();
  const baseFetch = globalThis.fetch.bind(globalThis);

  return async (input, init) => {
    const sessionId = args.getSessionRunScope?.()?.sessionId;
    const url = readFetchUrl(input);
    const method = readFetchMethod(input, init);
    try {
      const response = await baseFetch(input, init);
      if (args.enabled) {
        void logger.log("info", "[city] llm.fetch", {
          kind: "llm_fetch",
          url,
          method,
          status: response.status,
          ...(sessionId ? { sessionId } : {}),
        });
      }
      return response;
    } catch (error) {
      if (args.enabled) {
        void logger.log("error", "[city] llm.fetch.error", {
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

async function resolveConfiguredModel(input: RuntimeModelFactoryInput & {
  primaryModelId: string;
}): Promise<{
  model: StoredModel;
  provider: StoredModelProvider;
}> {
  const store = new PlatformStore();
  try {
    const resolved = await store.getResolvedModel(input.primaryModelId);
    if (!resolved) {
      throw new Error(
        `LLM model config not found in platform store: ${input.primaryModelId}`,
      );
    }
    return resolved;
  } finally {
    store.close();
  }
}

/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 读取 `execution.modelId`。
 * 2) 从 city 平台模型池解析 provider/model。
 * 3) 按 provider type 分发到对应 AI SDK 工厂。
 */
export async function createRuntimeModel(
  input: RuntimeModelFactoryInput,
): Promise<LanguageModel> {
  const logger = getLogger();
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
  const { model: modelConfig, provider: providerConfig } =
    await resolveConfiguredModel({
      ...input,
      primaryModelId,
    });

  if (modelConfig.isPaused === true) {
    await logger.log(
      "warn",
      `LLM model is paused in platform store: ${primaryModelId}`,
    );
    throw new Error(`LLM model is paused: ${primaryModelId}`);
  }

  const providerKey = providerConfig.id;
  const providerType = normalizeProviderType(providerConfig.type);
  if (!providerType) {
    await logger.log(
      "warn",
      `Unsupported LLM provider type: ${providerConfig.type}`,
    );
    throw new Error(`Unsupported LLM provider type: ${providerConfig.type}`);
  }

  const resolvedModel = resolveEnvPlaceholder(modelConfig.name);
  if (!resolvedModel || resolvedModel === "${}") {
    await logger.log("warn", "No LLM model name configured");
    throw new Error("No LLM model name configured");
  }

  const resolvedBaseUrl = normalizeOptionalBaseUrl(
    resolveEnvPlaceholder(providerConfig.baseUrl) ||
      resolveProviderDefaultBaseUrl(providerType),
  );

  let resolvedApiKey = resolveEnvPlaceholder(providerConfig.apiKey);
  if (!resolvedApiKey) {
    resolvedApiKey = resolveApiKeyFallback(providerType);
  }
  if (!resolvedApiKey) {
    await logger.log("warn", "No API Key configured, will use simulation mode");
    throw new Error("No API Key configured, will use simulation mode");
  }

  await logger.log(
    "info",
    `[main] model primary=${primaryModelId} provider=${providerType}/${providerKey} name=${resolvedModel}${resolvedBaseUrl ? ` baseUrl=${resolvedBaseUrl}` : ""}`,
    {
      kind: "llm_model_ready",
      primaryModel: primaryModelId,
      providerType,
      providerKey,
      model: resolvedModel,
      ...(resolvedBaseUrl ? { baseUrl: resolvedBaseUrl } : {}),
      logMessages: logLlmMessages,
    },
  );

  if (providerType === "anthropic") {
    const anthropicProvider = createAnthropic({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl,
      fetch: loggingFetch as typeof fetch,
    });
    return anthropicProvider(resolvedModel);
  }

  if (providerType === "gemini") {
    const googleProvider = createGoogleGenerativeAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl,
      fetch: loggingFetch as typeof fetch,
    });
    return googleProvider(resolvedModel);
  }

  if (providerType === "open-responses") {
    const responsesProvider = createOpenResponses({
      url: buildResponsesUrl(resolvedBaseUrl),
      name: providerKey,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return responsesProvider(resolvedModel);
  }

  if (providerType === "open-compatible") {
    const compatibleProvider = createOpenAICompatible({
      name: providerKey,
      baseURL: resolvedBaseUrl || "https://api.openai.com/v1",
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return compatibleProvider(resolvedModel);
  }

  if (providerType === "kimi-code") {
    const compatibleProvider = createOpenAICompatible({
      name: providerKey,
      baseURL: resolvedBaseUrl || "https://api.kimi.com/coding/v1",
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return compatibleProvider(resolvedModel);
  }

  if (providerType === "moonshot-cn" || providerType === "moonshot-ai") {
    const moonshotProvider = createMoonshotAI({
      baseURL: resolvedBaseUrl,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return moonshotProvider(resolvedModel);
  }

  if (providerType === "xai") {
    const xaiProvider = createXai({
      baseURL: resolvedBaseUrl,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return xaiProvider(resolvedModel);
  }

  if (providerType === "huggingface") {
    const huggingFaceProvider = createHuggingFace({
      baseURL: resolvedBaseUrl,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return huggingFaceProvider(resolvedModel);
  }

  if (providerType === "openrouter") {
    const openRouterProvider = createOpenRouter({
      baseURL: resolvedBaseUrl,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return openRouterProvider(resolvedModel);
  }

  if (providerType === "deepseek") {
    const deepseekCompatibleProvider = createOpenAICompatible({
      name: providerKey,
      baseURL: resolvedBaseUrl || "https://api.deepseek.com/v1",
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return deepseekCompatibleProvider(resolvedModel);
  }

  const openaiProvider = createOpenAI({
    apiKey: resolvedApiKey,
    baseURL: resolvedBaseUrl,
    fetch: loggingFetch as typeof fetch,
  });
  return openaiProvider(resolvedModel);
}
