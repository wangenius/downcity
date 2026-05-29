/**
 * Worker OpenAI-Compatible Provider 工具模块。
 *
 * 关键说明（中文）
 * - 统一复用 core 中的共享 OpenAI-compatible Provider 实现
 * - Worker 侧只负责静态绑定 `createOpenAI`，不再维护重复 action 逻辑
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions, type Provider } from "@downcity/infra";

/**
 * 创建 Worker 侧 OpenAI-compatible Provider。
 */
export function createOpenAIProvider(options: OpenAICompatibleProviderOptions): Provider {
  return createOpenAICompatibleProvider(options, createOpenAI);
}
