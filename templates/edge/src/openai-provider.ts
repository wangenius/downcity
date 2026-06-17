 /**
  * Worker OpenAI-compatible Provider。
  *
  * 关键点（中文）
  * - 继承 Provider 基类，默认拥有 text / stream 能力。
  * - 覆盖 createClient 静态绑定 @ai-sdk/openai。
  */

 import { createOpenAI } from "@ai-sdk/openai";
 import { Provider, type OpenAICompatibleClientConfig } from "@downcity/city";

 /**
  * OpenAI-compatible Provider。
  */
 export class OpenAIProvider extends Provider {
   constructor(options: {
     id: string;
     envKey: string;
     baseURL: string;
     passthroughModel: string;
   }) {
     super(options);
   }

   protected createClient({ apiKey, baseURL }: OpenAICompatibleClientConfig) {
     return createOpenAI({ apiKey, baseURL });
   }
 }
