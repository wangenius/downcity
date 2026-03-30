/**
 * LLM provider/model factory.
 *
 * 设计目标（中文，关键点）
 * - 这是“核心能力”，不应该依赖 server/RuntimeContext（避免隐式初始化时序）。
 * - 运行时按 `model.primary`（agent 绑定）从 console 全局 `llm.models` / `llm.providers` 解析最终模型。
 * - Agent、Memory extractor 等都可以复用同一套模型构造逻辑。
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
import { type LanguageModel } from "ai";
import { createLlmLoggingFetch } from "@utils/logger/Fetch.js";
import { getLogger } from "@utils/logger/Logger.js";
import type { DowncityConfig } from "@/types/DowncityConfig.js";
import type { LlmProviderType } from "@/types/LlmConfig.js";
import { ConsoleStore } from "@utils/store/index.js";

type ModelLogContext = {
  sessionId?: string;
  requestId?: string;
};

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

/**
 * provider 默认 baseUrl。
 *
 * 关键点（中文）
 * - 当 `downcity.json.llm.providers.<id>.baseUrl` 省略时，按 provider type 自动补全。
 * - 保持“只配置 provider type + apiKey + modelName”也能跑通常见 provider。
 */
function resolveProviderDefaultBaseUrl(
  providerType: LlmProviderType,
): string | undefined {
  if (providerType === "deepseek") return "https://api.deepseek.com/v1";
  if (providerType === "moonshot") return "https://api.moonshot.cn/v1";
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
  if (providerType === "moonshot") {
    return (
      process.env.MOONSHOT_API_KEY ||
      process.env.KIMI_API_KEY ||
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
  if (value === "moonshot") return value;
  if (value === "xai") return value;
  if (value === "huggingface") return value;
  if (value === "openrouter") return value;
  return null;
}

/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 读取 `model.primary`，定位 console 全局 `llm.models[primary]`。
 * 2) 由模型配置中的 `provider` 字段定位 `llm.providers[providerKey]`。
 * 3) 解析 model/baseUrl/apiKey（支持 `${ENV}` 占位符）。
 * 4) 创建带日志拦截的 fetch，并按 provider type 分发到 SDK 工厂。
 */
export async function createModel(input: {
  config: DowncityConfig;
  getRequestContext?: () => ModelLogContext | undefined;
  store?: ConsoleStore;
}): Promise<LanguageModel> {
  const logger = getLogger();

  const primaryModelId = String(input.config.model?.primary || "").trim();
  if (!primaryModelId) {
    await logger.log("warn", "No agent model.primary configured");
    throw Error("No agent model.primary configured");
  }

  const store = input.store || new ConsoleStore();
  const resolved = await store.getResolvedModel(primaryModelId);
  if (!input.store) {
    store.close();
  }
  if (!resolved) {
    await logger.log("warn", `LLM model config not found in sqlite store: ${primaryModelId}`);
    throw Error(`LLM model config not found in sqlite store: ${primaryModelId}`);
  }
  const selectedModelConfig = resolved.model;
  const selectedProviderConfig = resolved.provider;
  if (selectedModelConfig.isPaused === true) {
    await logger.log(
      "warn",
      `LLM model is paused in sqlite store: ${primaryModelId}`,
    );
    throw Error(`LLM model is paused: ${primaryModelId}`);
  }
  const providerKey = selectedProviderConfig.id;

  const providerType = normalizeProviderType(selectedProviderConfig.type);
  if (!providerType) {
    await logger.log("warn", `Unsupported LLM provider type: ${selectedProviderConfig.type}`);
    throw Error(`Unsupported LLM provider type: ${selectedProviderConfig.type}`);
  }

  const resolvedModel = resolveEnvPlaceholder(selectedModelConfig.name);
  if (!resolvedModel || resolvedModel === "${}") {
    await logger.log("warn", "No LLM model name configured");
    throw Error("No LLM model name configured");
  }

  const resolvedBaseUrl = normalizeOptionalBaseUrl(
    resolveEnvPlaceholder(selectedProviderConfig.baseUrl) ||
      resolveProviderDefaultBaseUrl(providerType),
  );

  let resolvedApiKey = resolveEnvPlaceholder(selectedProviderConfig.apiKey);
  if (!resolvedApiKey) {
    resolvedApiKey = resolveApiKeyFallback(providerType);
  }
  if (!resolvedApiKey) {
    await logger.log("warn", "No API Key configured, will use simulation mode");
    throw Error("No API Key configured, will use simulation mode");
  }

  // 日志策略（中文）：默认开启 LLM 请求日志；可通过 llm.logMessages 关闭。
  const configLog = input.config.llm?.logMessages;
  const logLlmMessages = typeof configLog === "boolean" ? configLog : true;

  // 关键点（中文）：启动阶段只打印一次当前生效模型状态，便于快速确认路由是否正确。
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

  const loggingFetch = createLlmLoggingFetch({
    logger,
    enabled: logLlmMessages,
    getRequestContext: input.getRequestContext,
  });

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
    const compatibleBaseUrl = resolvedBaseUrl || "https://api.openai.com/v1";
    const compatibleProvider = createOpenAICompatible({
      name: providerKey,
      baseURL: compatibleBaseUrl,
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return compatibleProvider(resolvedModel);
  }

  if (providerType === "moonshot") {
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

  // OpenAI-compatible providers（中文）：
  // - openai / deepseek 统一走 OpenAI SDK（Responses/Completions 由 SDK 自适配）。
  const openaiCompatibleProvider = createOpenAI({
    apiKey: resolvedApiKey,
    baseURL: resolvedBaseUrl,
    fetch: loggingFetch as typeof fetch,
  });
  return openaiCompatibleProvider(resolvedModel);
}
