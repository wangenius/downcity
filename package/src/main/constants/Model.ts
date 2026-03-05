/**
 * LLM 预设常量。
 *
 * 关键点（中文）
 * - 管理 provider 默认 baseUrl 与 init 模型预设清单。
 * - 供 init 与运行时共享，避免散落硬编码。
 */
import type { LlmProviderType } from "@main/types/LlmConfig.js";

/**
 * Provider 默认 baseUrl。
 *
 * 关键点（中文）
 * - 仅在用户未显式配置 `llm.providers.<id>.baseUrl` 时兜底使用。
 * - `custom` 默认走 OpenAI 官方地址，便于快速接入 OpenAI-compatible 网关。
 */
export const PROVIDER_DEFAULT_BASE_URLS: Record<LlmProviderType, string> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  custom: "https://api.openai.com/v1",
};

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
  // 自定义模型（name/baseUrl 由环境变量填充）
  custom: {
    title: "Custom model",
    providerType: "custom",
  },
};
