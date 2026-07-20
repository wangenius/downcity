/**
 * Federation AIChannel 基类模块。
 *
 * AIChannel 是 Federation 服务端的上游 AI 执行渠道。语言能力只通过标准
 * LanguageModelV3 `stream(ctx, call)` 暴露，text action 由同一标准流自动派生。
 */

import type {
  AIChannelOptions,
  AICharge,
  AIChargedResult,
  AIImageCreateResult,
  AIImageResult,
  AIModelActions,
  AIModelDefinition,
  AIModelSpec,
  AIModelStream,
  AISDKProviderOptions,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamResult,
} from "../../types/AI.js";
import type { UIMessage } from "ai";
import type { ActionFn } from "../action.js";
import type { Context } from "../service.js";
import { execute_language_model_text } from "./language-model-text.js";
import { read_resolved_reasoning } from "./reasoning.js";

/** Federation 服务端 AI 执行渠道。 */
export abstract class AIChannel {
  /** Channel 唯一 ID。 */
  readonly id: string;
  /** Channel 所需环境变量及管理员说明。 */
  readonly env?: Record<string, string>;
  /** 上游 API 根地址，由子类显式使用。 */
  protected readonly base_url?: string;
  /** 默认 API Key 对应的 Federation env key。 */
  protected readonly env_key?: string;
  /** Channel 级 AI SDK providerOptions 默认值。 */
  private readonly ai_sdk_provider_options?: AISDKProviderOptions;
  /** 按 Federation 模型 ID 保存的模型级 AI SDK providerOptions。 */
  private readonly model_provider_options = new Map<string, AISDKProviderOptions>();

  constructor(options: AIChannelOptions) {
    this.id = options.id;
    this.env = options.env ?? (options.env_key
      ? { [options.env_key]: `${options.id} API Key` }
      : undefined);
    this.base_url = options.base_url;
    this.env_key = options.env_key;
    this.ai_sdk_provider_options = clone_provider_options(
      options.ai_sdk_provider_options,
    );
  }

  /**
   * 可选语言模型执行入口。
   *
   * 子类实现后，该 Channel 注册的模型自动获得 text 与 stream 能力。
   */
  protected stream?(
    ctx: Context,
    call: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult>;

  /**
   * 执行真实 AI SDK LanguageModelV3，并注入服务端私有 providerOptions。
   */
  protected async stream_ai_sdk_model(
    ctx: Context,
    call: LanguageModelV3CallOptions,
    model: LanguageModelV3,
  ): Promise<LanguageModelV3StreamResult> {
    const provider_options = this.build_model_provider_options(ctx, model);
    return model.doStream({
      ...call,
      ...(provider_options ? { providerOptions: provider_options } : {}),
    });
  }

  /**
   * 把 AIService 已校验 reasoning 映射成真实 AI SDK Provider 的选项。
   *
   * 默认实现适用于使用 `reasoningEffort` 的 Provider；其它 Provider 应覆盖。
   */
  protected build_reasoning_provider_options(
    ctx: Context,
    model: LanguageModelV3,
  ): AISDKProviderOptions | undefined {
    const reasoning = read_resolved_reasoning(ctx);
    if (!reasoning) return undefined;
    const provider_id = model.provider.split(".")[0]?.trim();
    if (!provider_id) {
      throw new Error(`AIChannel ${this.id} cannot resolve AI SDK provider id`);
    }
    return {
      [provider_id]: {
        reasoningEffort: reasoning.effort,
      },
    };
  }

  /** 构建本次真实上游模型调用的完整 providerOptions。 */
  protected build_model_provider_options(
    ctx: Context,
    model: LanguageModelV3,
  ): AISDKProviderOptions | undefined {
    return merge_provider_options(
      this.ai_sdk_provider_options,
      ctx.variant?.id
        ? this.model_provider_options.get(ctx.variant.id)
        : undefined,
      this.build_reasoning_provider_options(ctx, model),
    );
  }

  /** 模型成功完成后生成账单草稿。 */
  protected bill(_ctx: Context, _output: unknown): AICharge | undefined {
    return undefined;
  }

  /** 图片任务创建 action。 */
  image_create?(ctx: Context): Promise<AIImageCreateResult>;
  /** 图片任务抓取 action。 */
  image_fetch?(ctx: Context): Promise<AIImageResult>;
  /** 图片任务查询 action。 */
  image_result?(ctx: Context): Promise<AIImageResult>;
  /** 视频生成 action。 */
  video?(ctx: Context): Promise<AIChargedResult<UIMessage>>;
  /** 语音合成 action。 */
  tts?(ctx: Context): Promise<AIChargedResult<Response>>;
  /** 语音识别 action。 */
  asr?(ctx: Context): Promise<AIChargedResult<Response>>;

  /** 把当前 Channel 下的模型声明转换为 Federation 内部模型定义。 */
  model(spec: AIModelSpec): AIModelDefinition {
    const model_provider_options = clone_provider_options(
      spec.ai_sdk_provider_options,
    );
    if (model_provider_options) {
      this.model_provider_options.set(spec.id, model_provider_options);
    } else {
      this.model_provider_options.delete(spec.id);
    }

    const actions: AIModelActions = {};
    const modalities = [
      "image_create",
      "image_fetch",
      "image_result",
      "video",
      "tts",
      "asr",
    ] as const;

    for (const modality of modalities) {
      const fn = (this as unknown as Record<string, unknown>)[modality];
      if (typeof fn === "function") {
        actions[modality] = fn.bind(this) as ActionFn;
      }
    }

    const stream: AIModelStream | undefined = this.stream
      ? (ctx, call) => this.stream!(ctx, call)
      : undefined;
    if (stream) {
      actions.text = (ctx: Context) =>
        execute_language_model_text(ctx, stream, this.id);
    }

    const {
      ai_sdk_provider_options: _ai_sdk_provider_options,
      ...model_spec
    } = spec;

    return {
      ...model_spec,
      channel_id: this.id,
      ...(spec.price ? { price: [...spec.price] } : {}),
      env: this.env,
      runtime: {
        ...(stream ? { stream } : {}),
        actions,
      },
      bill: spec.bill ?? this.bill.bind(this),
    };
  }
}

/** 复制服务端 providerOptions，避免调用方原地修改已注册配置。 */
function clone_provider_options(
  input: AISDKProviderOptions | undefined,
): AISDKProviderOptions | undefined {
  return input ? structuredClone(input) : undefined;
}

/** 按 AI SDK Provider ID 浅合并 providerOptions。 */
function merge_provider_options(
  ...sources: Array<AISDKProviderOptions | undefined>
): AISDKProviderOptions | undefined {
  const merged: AISDKProviderOptions = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [provider_id, options] of Object.entries(source)) {
      merged[provider_id] = {
        ...merged[provider_id],
        ...options,
      };
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
