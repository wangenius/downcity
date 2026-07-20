/**
 * Node 侧 DeepSeek AIChannel 实现。
 *
 * 关键点（中文）
 * - AIChannel.stream 是唯一语言模型执行入口。
 * - 在 stream 内创建 @ai-sdk/deepseek 模型并适配为 City 标准流。
 */

import { createDeepSeek } from "@ai-sdk/deepseek";
import {
  AIChannel,
  read_required_env,
  type AIChannelStreamInput,
  type LanguageModelV3StreamResult,
} from "@downcity/city";

/**
 * DeepSeek AIChannel。
 */
export class DeepSeekChannel extends AIChannel {
  constructor(options: {
    id: string;
    env_key: string;
    base_url: string;
  }) {
    super({ ...options, ai_sdk_provider_id: "deepseek" });
  }

  protected async stream(
    input: AIChannelStreamInput,
  ): Promise<LanguageModelV3StreamResult> {
    const deepseek = createDeepSeek({
      apiKey: read_required_env(input, this.env_key ?? ""),
      baseURL: this.base_url,
    });
    const model = deepseek(input.model.upstream_model);
    return model.doStream(input.call);
  }
}
