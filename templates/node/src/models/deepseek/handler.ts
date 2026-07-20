/**
 * DeepSeek AIChannel。
 *
 * 关键点（中文）
 * - 使用 @ai-sdk/deepseek 提供的 createDeepSeek。
 * - baseURL 保持 /v1，与 DeepSeek OpenAI-compatible 接口一致。
 */

import { DeepSeekChannel } from "../deepseek-channel.js";

export const deepseek = new DeepSeekChannel({
  id: "deepseek",
  env_key: "DEEPSEEK_API_KEY",
  base_url: "https://api.deepseek.com/v1",
});
