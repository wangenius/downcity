/**
 * LLM provider/model factory.
 *
 * 设计目标（中文，关键点）
 * - 这是“核心能力”，不应该依赖 server/RuntimeContext（避免隐式初始化时序）。
 * - 运行时按 `llm.activeModel` 从 `llm.models` / `llm.providers` 解析最终模型。
 * - Agent、Memory extractor 等都可以复用同一套模型构造逻辑。
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel } from "ai";
import { createLlmLoggingFetch } from "@utils/logger/Fetch.js";
import { getLogger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@/main/runtime/Config.js";
import type { LlmProviderType } from "@main/types/LlmConfig.js";

type ModelLogContext = {
  contextId?: string;
  requestId?: string;
};

const DEFAULT_BASE_URL_BY_PROVIDER: Record<LlmProviderType, string> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  custom: "https://api.openai.com/v1",
};

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
  return process.env.OPENAI_API_KEY || process.env.API_KEY;
}

function normalizeProviderType(value: unknown): LlmProviderType | null {
  if (value === "anthropic") return value;
  if (value === "openai") return value;
  if (value === "deepseek") return value;
  if (value === "gemini") return value;
  if (value === "custom") return value;
  return null;
}

/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 读取 `llm.activeModel`，定位 `llm.models[activeModel]`。
 * 2) 由模型配置中的 `provider` 字段定位 `llm.providers[providerKey]`。
 * 3) 解析 model/baseUrl/apiKey（支持 `${ENV}` 占位符）。
 * 4) 创建带日志拦截的 fetch，并按 provider type 分发到 SDK 工厂。
 */
export async function createModel(input: {
  config: ShipConfig;
  getRequestContext?: () => ModelLogContext | undefined;
}): Promise<LanguageModel> {
  const logger = getLogger();
  const llm = input.config.llm;

  const activeModelId = String(llm?.activeModel || "").trim();
  if (!activeModelId) {
    await logger.log("warn", "No active LLM model configured");
    throw Error("No active LLM model configured");
  }

  const selectedModelConfig = llm?.models?.[activeModelId];
  if (!selectedModelConfig || typeof selectedModelConfig !== "object") {
    await logger.log("warn", `LLM model config not found: ${activeModelId}`);
    throw Error(`LLM model config not found: ${activeModelId}`);
  }

  const providerKey = String(selectedModelConfig.provider || "").trim();
  if (!providerKey) {
    await logger.log("warn", `LLM model provider key is missing: ${activeModelId}`);
    throw Error(`LLM model provider key is missing: ${activeModelId}`);
  }

  const selectedProviderConfig = llm?.providers?.[providerKey];
  if (!selectedProviderConfig || typeof selectedProviderConfig !== "object") {
    await logger.log("warn", `LLM provider config not found: ${providerKey}`);
    throw Error(`LLM provider config not found: ${providerKey}`);
  }

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

  const resolvedBaseUrlRaw = resolveEnvPlaceholder(selectedProviderConfig.baseUrl);
  const resolvedBaseUrl = String(
    resolvedBaseUrlRaw || DEFAULT_BASE_URL_BY_PROVIDER[providerType],
  ).trim();

  let resolvedApiKey = resolveEnvPlaceholder(selectedProviderConfig.apiKey);
  if (!resolvedApiKey) {
    resolvedApiKey = resolveApiKeyFallback(providerType);
  }
  if (!resolvedApiKey) {
    await logger.log("warn", "No API Key configured, will use simulation mode");
    throw Error("No API Key configured, will use simulation mode");
  }

  // 日志策略（中文）：默认开启 LLM 请求日志，可通过 llm.logMessages 关闭。
  const configLog = llm?.logMessages;
  const logLlmMessages = typeof configLog === "boolean" ? configLog : true;

  const loggingFetch = createLlmLoggingFetch({
    logger,
    enabled: logLlmMessages,
    getRequestContext: input.getRequestContext,
  });

  if (providerType === "anthropic") {
    const anthropicProvider = createAnthropic({
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return anthropicProvider(resolvedModel);
  }

  // OpenAI-compatible providers（中文）：
  // - openai / deepseek / gemini / custom 统一走 Responses 协议适配层。
  const openaiCompatibleProvider = createOpenAI({
    apiKey: resolvedApiKey,
    baseURL: resolvedBaseUrl,
    fetch: loggingFetch as typeof fetch,
  });
  return openaiCompatibleProvider(resolvedModel);
}
