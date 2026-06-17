/**
 * DeepSeek provider。
 *
 * 关键点（中文）
 * - 使用 @ai-sdk/deepseek 提供的 createDeepSeek。
 * - baseURL 保持 /v1，与 DeepSeek OpenAI-compatible 接口一致。
 */

import { DeepSeekProvider } from "../deepseek-provider.js";

export const deepseek = new DeepSeekProvider({
  id: "deepseek",
  envKey: "DEEPSEEK_API_KEY",
  baseURL: "https://api.deepseek.com/v1",
  passthroughModel: "deepseek-v4-flash",
});
