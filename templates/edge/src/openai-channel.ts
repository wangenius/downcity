 /**
 * Worker OpenAI-compatible AIChannel 实现。
  *
  * 关键点（中文）
 * - AIChannel.stream 是唯一语言模型执行入口。
  * - 在 stream 内明确选择 OpenAI Chat Completions 模型协议。
  */

 import { createOpenAI } from "@ai-sdk/openai";
 import {
   AIChannel,
   read_required_env,
   type AIChannelStreamInput,
   type LanguageModelV3StreamResult,
 } from "@downcity/city";

 /**
  * OpenAI-compatible AIChannel。
  */
 export class OpenAICompatibleChannel extends AIChannel {
   constructor(options: {
     id: string;
     env_key: string;
     base_url: string;
   }) {
     super({ ...options, ai_sdk_provider_id: "openai" });
   }

   protected async stream(
     input: AIChannelStreamInput,
   ): Promise<LanguageModelV3StreamResult> {
     const openai = createOpenAI({
       apiKey: read_required_env(input, this.env_key ?? ""),
       baseURL: this.base_url,
     });
     const model = openai.chat(input.model.upstream_model);
     return model.doStream(input.call);
   }
 }
