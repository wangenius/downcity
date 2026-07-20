 /**
 * Edge DeepSeek AIChannel 实现。
  *
  * 关键点（中文）
 * - AIChannel.stream 是唯一语言模型执行入口。
  * - 在 stream 内创建 @ai-sdk/deepseek 模型并适配为 City 标准流。
 * - `/chat/completions` 由 AIService adapter 统一转换，不在 Channel 中透传。
  */

 import { createDeepSeek } from "@ai-sdk/deepseek";
 import {
   AIChannel,
   type AIChannelStreamInput,
   type LanguageModelV3StreamResult,
   read_required_env,
 } from "@downcity/city";

 /**
 * DeepSeek AIChannel。
 */
 export class DeepSeekChannel extends AIChannel {
   constructor() {
     super({
       id: "deepseek",
       env_key: "DEEPSEEK_API_KEY",
       base_url: "https://api.deepseek.com/v1",
       ai_sdk_provider_id: "deepseek",
     });
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
