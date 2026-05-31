/**
 * AI 模型类型（对应 core service/ai/types.ts PublicModel）。
 */

export interface UserModelEnvRequirement {
  /** 环境变量 key */
  key: string;
  /** 给管理员展示的说明文本 */
  description: string;
  /** 当前是否必须配置 */
  required: boolean;
}

/** 客户端可见的 Model 引用 */
export interface UserModelRef {
  /** 模型唯一 ID */
  id: string;
  /** 模型展示名称 */
  name: string;
  /** 模型说明 */
  description: string;
  /** 支持的 modality 列表 */
  modalities: string[];
  /** 标签 */
  tags: string[];
  /** 元数据（可包含 provider、baseUrl 等配置） */
  meta: Record<string, unknown>;
  /** 模型依赖的环境变量需求（通常仅 admin 身份可见） */
  env_requirements?: UserModelEnvRequirement[];
  /** 模型默认负责的 modality 列表（通常仅 admin 身份可见） */
  default_modes?: string[];
  /** 是否为全局默认（ModelCatalog 计算） */
  is_default?: boolean;
  /** 默认支持的 modality 列表（ModelCatalog 计算） */
  default_modalities?: string[];
}

/** 模型标识（Ref 或 ID 字符串） */
export type UserModelInput = UserModelRef | string;
