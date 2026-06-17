/**
 * Node 侧 DeepSeek Provider。
 *
 * 关键点（中文）
 * - 继承 Provider 基类，复用默认 text / stream 实现。
 * - 覆盖 createClient 绑定 @ai-sdk/deepseek，不再走 OpenAI-compatible 默认实现。
 */

import { createDeepSeek } from "@ai-sdk/deepseek";
import { Provider, type OpenAICompatibleClientConfig } from "@downcity/city";

/**
 * DeepSeek Provider。
 */
export class DeepSeekProvider extends Provider {
  constructor(options: {
    id: string;
    envKey: string;
    baseURL: string;
    passthroughModel: string;
  }) {
    super(options);
  }

  protected createClient({ apiKey, baseURL }: OpenAICompatibleClientConfig) {
    return createDeepSeek({ apiKey, baseURL });
  }
}
