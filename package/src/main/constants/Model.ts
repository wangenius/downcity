/**
 * LLM 预设常量。
 *
 * 关键点（中文）
 * - 管理 init 模型预设清单。
 * - 避免模型与 providerType 的映射散落硬编码。
 */
import type { LlmProviderType } from "@main/types/LlmConfig.js";

/**
 * Init 可选模型预设。
 *
 * 关键点（中文）
 * - value（key）会作为模型名称写入 `llm.models.<active>.name`。
 * - `providerType` 用于生成默认 provider 配置。
 */
export const MODEL_PRESETS: Record<
  string,
  {
    title: string;
    providerType: LlmProviderType;
  }
> = {
  // Claude 系列
  "claude-sonnet-4-5": {
    title: "Claude Sonnet 4",
    providerType: "anthropic",
  },
  "claude-haiku": {
    title: "Claude Haiku",
    providerType: "anthropic",
  },
  "claude-3-5-sonnet-20241022": {
    title: "Claude 3.5 Sonnet",
    providerType: "anthropic",
  },
  "claude-3-opus-20240229": {
    title: "Claude 3 Opus",
    providerType: "anthropic",
  },
  // OpenAI GPT 系列
  "gpt-4": {
    title: "GPT-4",
    providerType: "openai",
  },
  "gpt-4-turbo": {
    title: "GPT-4 Turbo",
    providerType: "openai",
  },
  "gpt-4o": {
    title: "GPT-4o",
    providerType: "openai",
  },
  "gpt-3.5-turbo": {
    title: "GPT-3.5 Turbo",
    providerType: "openai",
  },
  // DeepSeek
  "deepseek-chat": {
    title: "DeepSeek Chat",
    providerType: "deepseek",
  },
  // Gemini
  "gemini-2.5-pro": {
    title: "Gemini 2.5 Pro",
    providerType: "gemini",
  },
  "gemini-2.5-flash": {
    title: "Gemini 2.5 Flash",
    providerType: "gemini",
  },
  // xAI
  "grok-3": {
    title: "xAI Grok 3",
    providerType: "xai",
  },
  // HuggingFace Router
  "meta-llama/Llama-3.1-8B-Instruct": {
    title: "HF Llama 3.1 8B",
    providerType: "huggingface",
  },
  // OpenRouter
  "openrouter/auto": {
    title: "OpenRouter Auto",
    providerType: "openrouter",
  },
  // Moonshot(Kimi)
  "moonshot-v1-8k": {
    title: "Moonshot v1 8k",
    providerType: "moonshot",
  },
  // OpenAI-compatible（Chat Completions）
  "open-compatible": {
    title: "Open-compatible model",
    providerType: "open-compatible",
  },
  // OpenAI-compatible（Responses）
  "open-responses": {
    title: "Open-responses model",
    providerType: "open-responses",
  },
};
