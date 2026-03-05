/**
 * LLM provider/model factory.
 *
 * 设计目标（中文，关键点）
 * - 这是“核心能力”，不应该依赖 server/RuntimeContext（避免隐式初始化时序）
 * - Agent、Memory extractor 等都可以复用同一套模型构造逻辑
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel } from "ai";
import { createLlmLoggingFetch } from "@utils/logger/Fetch.js";
import { getLogger } from "@utils/logger/Logger.js";
import type { ShipConfig } from "@/main/runtime/Config.js";

type ModelLogContext = {
  contextId?: string;
  requestId?: string;
};

/**
 * 创建 LanguageModel 实例。
 *
 * 解析策略（中文）
 * 1) 解析 provider/model/baseUrl/apiKey（含 `${ENV}` 占位符）
 * 2) 创建带日志拦截的 fetch
 * 3) 按 provider 分发到对应 SDK 工厂
 */
export async function createModel(input: {
  config: ShipConfig;
  getRequestContext?: () => ModelLogContext | undefined;
}): Promise<LanguageModel> {
  const logger = getLogger();

  const { provider, apiKey, baseUrl, model } = input.config.llm;
  const resolvedModel = model === "${}" ? undefined : model;
  const resolvedBaseUrl = baseUrl === "${}" ? undefined : baseUrl;

  if (!resolvedModel) {
    await logger.log("warn", "No LLM model configured");
    throw Error("no LLM Model Configured");
  }

  // API Key 解析（中文）：优先 ship.json；若是 `${ENV}` 则转环境变量读取。
  let resolvedApiKey = apiKey;
  if (apiKey && apiKey.startsWith("${") && apiKey.endsWith("}")) {
    const envVar = apiKey.slice(2, -1);
    resolvedApiKey = process.env[envVar];
  }

  // 兜底策略（中文）：按 provider 优先读取对应生态的常见环境变量。
  if (!resolvedApiKey) {
    if (provider === "gemini") {
      resolvedApiKey =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.API_KEY;
    } else {
      resolvedApiKey =
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.API_KEY;
    }
  }

  if (!resolvedApiKey) {
    await logger.log("warn", "No API Key configured, will use simulation mode");
    throw Error("No API Key configured, will use simulation mode");
  }

  // 日志策略（中文）：默认开启 LLM 请求日志，可通过 llm.logMessages 关闭。
  const configLog = input.config.llm?.logMessages;
  const logLlmMessages = typeof configLog === "boolean" ? configLog : true;

  const loggingFetch = createLlmLoggingFetch({
    logger,
    enabled: logLlmMessages,
    getRequestContext: input.getRequestContext,
  });

  if (provider === "anthropic") {
    const anthropicProvider = createAnthropic({
      apiKey: resolvedApiKey,
      fetch: loggingFetch as typeof fetch,
    });
    return anthropicProvider(resolvedModel);
  }

  // Gemini provider（中文）：
  // - 统一复用 OpenAI-compatible SDK 路径，默认指向 Google OpenAI-compatible endpoint。
  if (provider === "gemini") {
    const geminiProvider = createOpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || "https://generativelanguage.googleapis.com/v1beta/openai",
      fetch: loggingFetch as typeof fetch,
    });
    return geminiProvider(resolvedModel);
  }

  // custom provider 走 OpenAI Responses 协议（中文）：
  // - 兼容仅支持 `/v1/responses` 的网关。
  if (provider === "custom") {
    const customProvider = createOpenAI({
      apiKey: resolvedApiKey,
      baseURL: resolvedBaseUrl || "https://api.openai.com/v1",
      fetch: loggingFetch as typeof fetch,
    });
    return customProvider(resolvedModel);
  }

  const openaiProvider = createOpenAI({
    apiKey: resolvedApiKey,
    baseURL: resolvedBaseUrl || "https://api.openai.com/v1",
    fetch: loggingFetch as typeof fetch,
  });
  return openaiProvider(resolvedModel);
}
