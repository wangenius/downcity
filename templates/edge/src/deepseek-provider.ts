 /**
  * Edge DeepSeek Provider。
  *
  * 关键点（中文）
  * - 继承 Provider 基类，复用默认 text / stream 实现。
  * - 覆盖 createClient 绑定 @ai-sdk/deepseek。
  * - 覆盖 extractPrompt 把多模态 content 规整为纯文本，避免 DeepSeek 收到 image_url 后失败。
  * - 覆盖 openai 做 /chat/completions 透传 + body 归一化。
  */

 import { createDeepSeek } from "@ai-sdk/deepseek";
 import type { UIMessage } from "ai";
 import {
   Provider,
   type Context,
   type AIProviderChargedResponse,
   type OpenAICompatibleClientConfig,
   normalizeTextOnlyOpenAICompatibleBody,
   readRequiredEnv,
   resolveUpstreamModel,
   trimTrailingSlash,
 } from "@downcity/city";

 interface DeepSeekActionInput {
   /** 多轮 UIMessage。 */
   messages?: UIMessage[];
   /** 单轮 prompt。 */
   prompt?: string;
   /** OpenAI function tools。 */
   tools?: Record<string, unknown>[];
 }

 /**
  * DeepSeek Provider。
  */
 export class DeepSeekProvider extends Provider {
   constructor() {
     super({
       id: "deepseek",
       envKey: "DEEPSEEK_API_KEY",
       baseURL: "https://api.deepseek.com/v1",
       passthroughModel: "deepseek-v4-flash",
     });
   }

   protected createClient({ apiKey, baseURL }: OpenAICompatibleClientConfig) {
     return createDeepSeek({ apiKey, baseURL });
   }

   protected extractPrompt(input: DeepSeekActionInput): string {
     if (typeof input.prompt === "string") return input.prompt;
     return input.messages
       ?.find((message) => message.role === "user")
       ?.parts?.map((part) => (part.type === "text" ? part.text : ""))
       .filter(Boolean)
       .join("\n") ?? "";
   }

   async openai(ctx: Context): Promise<AIProviderChargedResponse> {
     const api_key = readRequiredEnv(ctx, this.envKey ?? "");
     const body = normalizeTextOnlyOpenAICompatibleBody(
       ctx.input as Record<string, unknown>,
       resolveUpstreamModel(ctx, this.passthroughModel ?? ""),
     );
     const response = await fetch(`${trimTrailingSlash(this.baseURL ?? "")}/chat/completions`, {
       method: "POST",
       headers: {
         Authorization: `Bearer ${api_key}`,
         "Content-Type": "application/json",
       },
       body: JSON.stringify(body),
     });
     return { response };
   }
 }
