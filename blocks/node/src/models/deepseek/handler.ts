/**
 * DeepSeek provider（OpenAI-compatible）
 *
 * baseURL 含 /v1，与 ai-sdk 默认 https://api.openai.com/v1 保持一致。
 */

import { createOpenAIProvider } from "../Provider.js";

export const deepseek = createOpenAIProvider({
  id: "deepseek",
  envKey: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com/v1",
  defaultModelId: "deepseek-v4-flash",
});
