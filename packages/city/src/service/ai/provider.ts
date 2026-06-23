 /**
  * AI Provider 模块。
  *
  * Provider 是第三方 AI 提供商的基类。
  * - 默认提供 OpenAI-compatible 的 text / stream 实现。
  * - 子类通过覆盖 createClient 来绑定不同的 AI SDK provider。
  * - 需要其它模态（image / video / tts / asr）或自定义 openai 透传时，覆盖对应方法。
  */

import { convertToModelMessages, generateText, streamText } from "ai";
import type { LanguageModel, ToolSet, UIMessage } from "ai";
import type { Context } from "../service.js";
import type { ActionFn } from "../action.js";
import type {
  AIProviderBillFn,
  AIProviderChargedOutput,
  AIProviderChargedResponse,
  AIProviderChargeLine,
} from "./charge.js";
import type {
  AIImageProviderCreateResult,
  AIImageProviderFetchResult,
  AIImageProviderResult,
} from "./job-types.js";
import type {
  ModelConfig,
  ModelActions,
  OpenAICompatibleClient,
  OpenAICompatibleClientConfig,
  ProviderOptions,
} from "./types.js";
import {
  buildAssistantMessage,
  buildToolSet,
  readRequiredEnv,
  resolveUpstreamModel,
} from "./helpers.js";

// ===========================================================================
// 内部类型
// ===========================================================================

interface OpenAIActionInput {
  /** 多轮 UIMessage。 */
  messages?: UIMessage[];
  /** 单轮 prompt。 */
  prompt?: string;
  /** OpenAI function tools。 */
  tools?: Record<string, unknown>[];
}

interface ToolCallShape {
  /** tool call 唯一 ID。 */
  toolCallId: string;
  /** tool 名称。 */
  toolName: string;
  /** tool 输入。 */
  input: unknown;
}

interface ResolvedActionInputWithTools {
  /** 已转换为 ai-sdk ToolSet 的 tools。 */
  tools: ToolSet;
  /** 已转换为模型侧 messages 的消息列表。 */
  messages: Awaited<ReturnType<typeof convertToModelMessages>>;
}

interface ResolvedActionInputWithPrompt {
  /** 供单轮调用使用的 prompt 文本。 */
  prompt: string;
}

type ResolvedActionInput =
  | ResolvedActionInputWithTools
  | ResolvedActionInputWithPrompt;

// ===========================================================================
// Provider 基类
// ===========================================================================

 /**
  * AI Provider 基类。
  *
  * 子类通过覆盖方法声明 action，model() 会自动收集并生成 ModelConfig。
  * 默认 text / stream 使用 OpenAI-compatible 协议，覆盖 createClient 即可接入不同上游。
  */
export abstract class Provider {
   /** Provider 唯一 ID。 */
   readonly id: string;
   /** 模型所需环境变量说明。 */
   readonly env?: Record<string, string>;
   /** Provider 的 baseURL（用于自动透传）。 */
   readonly baseURL?: string;
   /** Provider 的环境变量 key。 */
   readonly envKey?: string;
   /** 上游 API 实际模型 ID（自动透传时替换 body.model）。 */
   readonly passthroughModel?: string;

   constructor(options: ProviderOptions) {
     this.id = options.id;
     this.env = options.env ?? (options.envKey ? { [options.envKey]: `${options.id} API Key` } : undefined);
     this.baseURL = options.baseURL;
     this.envKey = options.envKey;
     this.passthroughModel = options.passthroughModel;
   }

   /**
    * 创建 OpenAI-compatible chat client。
    *
    * 子类需要支持 text / stream 时必须覆盖。
    * 默认抛出错误。
    */
   protected createClient(config: OpenAICompatibleClientConfig): OpenAICompatibleClient {
     throw new Error(`Provider ${this.id} does not support text/stream`);
   }

   /**
    * 从输入中提取 prompt 文本。
    *
    * 子类可覆盖以支持多模态 messages 转文本。
    */
   protected extractPrompt(input: OpenAIActionInput): string {
     if (typeof input.prompt === "string") return input.prompt;
     return input.messages
       ?.find((message) => message.role === "user")
       ?.parts?.find((part) => part.type === "text")
       ?.text ?? "";
   }

   /**
    * 为一次完成的调用生成扣费草稿。
    *
    * 默认不返回扣费。真正扣款由 AIService 调用 BalanceService 完成。
    */
   protected bill(ctx: Context, output: unknown): AIProviderChargeLine | undefined {
     return undefined;
   }

   /**
    * 创建当前请求的 chat model。
    */
   private createChatModel(ctx: Context): LanguageModel {
     if (!this.envKey) {
       throw new Error(`Provider ${this.id} is missing envKey`);
     }
     const api_key = readRequiredEnv(ctx, this.envKey);
     const base_url = this.baseURL ?? "https://api.openai.com/v1";
     const upstream_model = resolveUpstreamModel(ctx, this.passthroughModel ?? "");
     return this.createClient({ apiKey: api_key, baseURL: base_url, name: this.id }).chat(upstream_model);
   }

   /**
    * 将输入解析成 prompt 或 tools+messages。
    */
   private async resolveActionInput(input: OpenAIActionInput): Promise<ResolvedActionInput> {
     const tools = buildToolSet(input.tools);
     if (!tools) {
       return { prompt: this.extractPrompt(input) };
     }
     return {
       tools,
       messages: await convertToModelMessages(input.messages ?? [], { tools }),
     };
   }

   /**
    * 文本生成 action（OpenAI-compatible 默认实现）。
    */
   async text(ctx: Context): Promise<AIProviderChargedOutput<UIMessage>> {
     const input = ctx.input as OpenAIActionInput;
     const resolved_input = await this.resolveActionInput(input);
     const model = this.createChatModel(ctx);

     if ("tools" in resolved_input) {
       const result = await generateText({
         model,
         messages: resolved_input.messages,
         tools: resolved_input.tools,
       });
       return buildAssistantMessage(result.text, ctx, {
         finishReason: result.finishReason,
         usage: result.usage,
         toolCalls: result.toolCalls as ToolCallShape[],
       });
     }

     const result = await generateText({
       model,
       prompt: resolved_input.prompt,
       temperature: 1,
     });
     return buildAssistantMessage(result.text, ctx, {
       finishReason: result.finishReason,
       usage: result.usage,
     });
   }

   /**
    * 流式生成 action（OpenAI-compatible 默认实现）。
    */
   async stream(ctx: Context): Promise<AIProviderChargedResponse> {
     const input = ctx.input as OpenAIActionInput;
     const resolved_input = await this.resolveActionInput(input);
     const model = this.createChatModel(ctx);

     if ("tools" in resolved_input) {
      const result = streamText({
        model,
        messages: resolved_input.messages,
        tools: resolved_input.tools,
      });
      return {
        response: result.toUIMessageStreamResponse(),
      };
    }

    const result = streamText({
      model,
      prompt: resolved_input.prompt,
      temperature: 1,
    });
    return {
      response: result.toUIMessageStreamResponse(),
    };
  }

   /**
    * 图片任务创建 action。
    *
    * 子类实现图片生成时覆盖，负责创建并启动 provider 侧图片任务。
    */
   image_create?(ctx: Context): Promise<AIImageProviderCreateResult>;

   /**
    * 图片任务抓取 action。
    *
    * 子类实现图片生成时覆盖，负责根据 provider 任务状态抓取上游结果。
    */
   image_fetch?(ctx: Context): Promise<AIImageProviderFetchResult>;

   /**
    * 图片任务查询 action。
    *
    * 该方法保留为类型兼容，AIService 图片能力默认使用 image_fetch。
    */
   image_result?(ctx: Context): Promise<AIImageProviderResult>;

   /**
    * 视频生成 action。
    */
   video?(ctx: Context): Promise<AIProviderChargedOutput<UIMessage>>;

   /**
    * 语音合成 action。
    */
   tts?(ctx: Context): Promise<AIProviderChargedResponse>;

   /**
    * 语音识别 action。
    */
   asr?(ctx: Context): Promise<AIProviderChargedResponse>;

   /**
    * OpenAI 兼容 /chat/completions action。
    *
    * 未覆盖时由 AIService 自动透传。
    */
   openai?(ctx: Context): Promise<AIProviderChargedResponse>;

   /**
    * 生成模型配置。
    *
    * 自动收集当前 Provider 实例上定义的 action 方法。
    */
   model(spec: {
     id: string;
     name: string;
     description?: string;
     tags?: string[];
     meta?: Record<string, unknown>;
     default?: boolean | string[];
     bill?: AIProviderBillFn;
   }): ModelConfig {
     const actions: ModelActions = {};
     const all_modalities = [
       "text",
       "stream",
       "image_create",
       "image_fetch",
       "image_result",
       "video",
       "tts",
       "asr",
       "openai",
     ] as const;

     for (const modality of all_modalities) {
       const fn = (this as unknown as Record<string, unknown>)[modality];
       if (typeof fn !== "function") continue;

       // text / stream 默认由基类实现，只有子类显式覆盖或提供了 createClient 才暴露
       if (modality === "text" || modality === "stream") {
         const is_overridden = fn !== (Provider.prototype as unknown as Record<string, unknown>)[modality];
         const has_create_client = this.createClient !== Provider.prototype.createClient;
         if (!is_overridden && !has_create_client) continue;
       }

       actions[modality] = fn.bind(this) as ActionFn;
     }

     return {
       id: spec.id,
       provider_id: this.id,
       name: spec.name,
       description: spec.description,
       tags: spec.tags,
       meta: spec.meta,
       default: spec.default,
       env: this.env,
       baseURL: this.baseURL,
       envKey: this.envKey,
       passthroughModel: this.passthroughModel,
       actions,
       bill: spec.bill ?? this.bill.bind(this),
     };
   }
}
