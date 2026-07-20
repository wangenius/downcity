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
   resolve_upstream_model,
   type LanguageModelV3CallOptions,
   type LanguageModelV3StreamResult,
   type Context,
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
     super(options);
   }

   protected async stream(
     ctx: Context,
     call: LanguageModelV3CallOptions,
   ): Promise<LanguageModelV3StreamResult> {
     const openai = createOpenAI({
       apiKey: read_required_env(ctx, this.env_key ?? ""),
       baseURL: this.base_url,
     });
     const model = openai.chat(
       resolve_upstream_model(ctx),
     );
     return this.stream_ai_sdk_model(ctx, call, model);
   }
 }
