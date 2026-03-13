/**
 * 模型存储（SQLite）类型定义。
 *
 * 关键点（中文）
 * - 该类型用于 console 全局模型池（provider/model）的统一读写。
 * - agent 项目只通过 `model.primary` 绑定模型 ID，不直接持有 provider 细节。
 */
import type { LlmProviderType } from "@agent/types/LlmConfig.js";

/**
 * 模型 provider 记录。
 */
export interface StoredModelProvider {
  /**
   * provider 主键 ID（例如：`openai_main`、`default`）。
   */
  id: string;
  /**
   * provider 类型（决定 SDK 分支与默认网关行为）。
   */
  type: LlmProviderType;
  /**
   * provider 基础地址（可选）。
   */
  baseUrl?: string;
  /**
   * provider API Key（解密后的明文；仅在运行时内存中使用）。
   */
  apiKey?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * 模型记录。
 */
export interface StoredModel {
  /**
   * 模型主键 ID（例如：`default`、`fast`、`quality`）。
   */
  id: string;
  /**
   * 关联 provider ID。
   */
  providerId: string;
  /**
   * 上游模型名称（例如 `gpt-4o-mini`）。
   */
  name: string;
  /**
   * 采样温度（可选）。
   */
  temperature?: number;
  /**
   * 最大输出 token（可选）。
   */
  maxTokens?: number;
  /**
   * topP（可选）。
   */
  topP?: number;
  /**
   * frequencyPenalty（可选）。
   */
  frequencyPenalty?: number;
  /**
   * presencePenalty（可选）。
   */
  presencePenalty?: number;
  /**
   * Anthropic 版本字段（可选）。
   */
  anthropicVersion?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * provider 写入参数。
 */
export interface UpsertModelProviderInput {
  /**
   * provider ID。
   */
  id: string;
  /**
   * provider 类型。
   */
  type: LlmProviderType;
  /**
   * provider baseUrl（可选）。
   */
  baseUrl?: string;
  /**
   * provider apiKey（可选）。
   */
  apiKey?: string;
}

/**
 * model 写入参数。
 */
export interface UpsertModelInput {
  /**
   * 模型 ID。
   */
  id: string;
  /**
   * provider ID。
   */
  providerId: string;
  /**
   * 上游模型名称。
   */
  name: string;
  /**
   * 采样温度（可选）。
   */
  temperature?: number;
  /**
   * 最大输出 token（可选）。
   */
  maxTokens?: number;
  /**
   * topP（可选）。
   */
  topP?: number;
  /**
   * frequencyPenalty（可选）。
   */
  frequencyPenalty?: number;
  /**
   * presencePenalty（可选）。
   */
  presencePenalty?: number;
  /**
   * Anthropic 版本字段（可选）。
   */
  anthropicVersion?: string;
}

