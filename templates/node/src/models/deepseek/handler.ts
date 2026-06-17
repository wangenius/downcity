/**
 * DeepSeek provider（OpenAI-compatible）
 *
 * baseURL 含 /v1，与 ai-sdk 默认 https://api.openai.com/v1 保持一致。
 */

import { OpenAIProvider } from "../Provider.js";

export const deepseek = new OpenAIProvider({
  id: "deepseek",
  envKey: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com/v1",
  passthroughModel: "deepseek-v4-flash",
});
