/**
 * AI Provider 模块。
 *
 * Provider 封装第三方 AI 提供商的 action 实现、环境变量声明和连接信息。
 * 通过 model() 方法生成模型配置，可直接传给 AIService.use() 完成注册。
 *
 * 两条独立通路：
 * - SDK 通路：text / stream — 给 User Gate 用
 * - OpenAI 兼容通路：openai — 给 /chat/completions 端点用
 *   - 未提供 openai action → AIService 自动透传（需 baseURL + envKey）
 *   - 提供了 openai action → 按自定义逻辑处理
 */

import type { ActionFn } from "../action.js";
import type { ModelConfig, ModelActions } from "./types.js";

export interface ProviderOptions {
  env?: Record<string, string>;
  baseURL?: string;
  envKey?: string;
  passthroughModel?: string;
  text: ActionFn;
  stream: ActionFn;
  image?: ActionFn;
  video?: ActionFn;
  openai?: ActionFn;
}

export class Provider {
  readonly id: string;
  readonly env?: Record<string, string>;
  readonly baseURL?: string;
  readonly envKey?: string;
  readonly passthroughModel?: string;
  private readonly actions: ModelActions;

  constructor(id: string, opts: ProviderOptions) {
    this.id = id;
    this.env = opts.env;
    this.baseURL = opts.baseURL;
    this.envKey = opts.envKey;
    this.passthroughModel = opts.passthroughModel;
    this.actions = {
      text: opts.text,
      stream: opts.stream,
      image: opts.image,
      video: opts.video,
      openai: opts.openai,
    };
  }

  model(spec: {
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    meta?: Record<string, unknown>;
    default?: boolean | string[];
  }): ModelConfig {
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      tags: spec.tags,
      meta: spec.meta,
      default: spec.default,
      env: this.env,
      baseURL: this.baseURL,
      envKey: this.envKey,
      passthroughModel: this.passthroughModel,
      actions: this.actions,
    };
  }
}
