/**
 * AI 模型注册表模块。
 *
 * 负责模型注册校验、环境可用性判断和公开模型目录投影。
 * AIService 保留请求编排职责，不直接维护模型 Map 和目录序列化细节。
 */

import type {
  AIModelEnvRequirement,
  ModelConfig,
  PublicModel,
} from "./types.js";
import { validate_model_reasoning } from "./reasoning.js";

/** 模型环境变量读取函数。 */
type EnvReader = (key: string) => string | undefined;

/** 公开模型目录查询选项。 */
interface ModelCatalogOptions {
  /** 当前请求可读取的环境变量。 */
  env: EnvReader;
  /** 当前请求身份，决定是否返回管理字段。 */
  identity: "guest" | "user" | "admin";
  /** 根据运行时 action 计算模型公开模态。 */
  get_modalities: (model: ModelConfig) => string[];
}

/** AIService 使用的模型注册表。 */
export class AIModelRegistry {
  /** 按模型 ID 保存运行时配置。 */
  private readonly model_map = new Map<string, ModelConfig>();

  /** 注册一个或多个模型配置。 */
  register(...inputs: (ModelConfig | ModelConfig[])[]): void {
    const configs = inputs.flatMap((input) => Array.isArray(input) ? input : [input]);
    for (const config of configs) {
      if (this.model_map.has(config.id)) {
        throw new Error(`Duplicate model: ${config.id}`);
      }
      validate_model_reasoning(config);
      this.model_map.set(config.id, config);
    }
  }

  /** 判断注册表是否包含模型。 */
  get size(): number {
    return this.model_map.size;
  }

  /** 按 ID 读取运行时模型配置。 */
  get(model_id: string): ModelConfig | undefined {
    return this.model_map.get(model_id);
  }

  /** 返回全部运行时模型配置。 */
  list(): ModelConfig[] {
    return [...this.model_map.values()];
  }

  /** 返回模型缺失的必填环境变量 key。 */
  get_missing_env(model: ModelConfig, env: EnvReader): string[] {
    return this.get_env_requirements(model)
      .filter((item) => item.required && !env(item.key))
      .map((item) => item.key);
  }

  /** 按身份和环境可用性生成公开模型目录。 */
  list_public(options: ModelCatalogOptions): PublicModel[] {
    const include_admin_fields = options.identity === "admin";
    const configs = include_admin_fields
      ? this.list()
      : this.list().filter((model) => this.get_missing_env(model, options.env).length === 0);

    return configs.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description ?? "",
      modalities: options.get_modalities(model),
      tags: model.tags ?? [],
      meta: model.meta ?? {},
      ...(model.reasoning ? { reasoning: model.reasoning } : {}),
      ...(include_admin_fields
        ? { env_requirements: this.get_env_requirements(model) }
        : {}),
    }));
  }

  /** 将模型环境配置转换为公开需求列表。 */
  private get_env_requirements(model: ModelConfig): AIModelEnvRequirement[] {
    const requirements = model.env
      ? Object.entries(model.env)
      : model.envKey
        ? [[model.envKey, `${model.id} API Key`]]
        : [];

    return requirements.map(([key, description]) => ({
      key,
      description,
      required: true,
    }));
  }
}
