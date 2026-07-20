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
  resolve_upstream_model,
  type LanguageModelV3CallOptions,
  type LanguageModelV3StreamResult,
  type Context,
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
    super(options);
  }

  protected async stream(
    ctx: Context,
    call: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const deepseek = createDeepSeek({
      apiKey: read_required_env(ctx, this.env_key ?? ""),
      baseURL: this.base_url,
    });
    const model = deepseek(
      resolve_upstream_model(ctx),
    );
    return this.stream_ai_sdk_model(ctx, call, model);
  }
}
