/**
 * Provider 封装 — 基于 @downcity/infra 的 Provider 类。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions, type Provider } from "@downcity/infra";

/**
 * 创建 Node 侧 OpenAI-compatible Provider。
 */
export function createOpenAIProvider(options: OpenAICompatibleProviderOptions): Provider {
  return createOpenAICompatibleProvider(options, createOpenAI);
}
