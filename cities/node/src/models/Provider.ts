/**
 * Provider 封装 — 基于 @downcity/city 的 Provider 类。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions, type Provider } from "@downcity/city";

/**
 * 创建 Node 侧 OpenAI-compatible Provider。
 */
export function createOpenAIProvider(options: OpenAICompatibleProviderOptions): Provider {
  return createOpenAICompatibleProvider(options, createOpenAI);
}
