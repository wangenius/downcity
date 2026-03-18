/**
 * 模型存储（SQLite）类型定义。
 *
 * 关键点（中文）
 * - 该类型用于 console 全局模型池（provider/model）的统一读写。
 * - agent 项目只通过 `model.primary` 绑定模型 ID，不直接持有 provider 细节。
 */
import type { LlmProviderType } from "@agent/types/LlmConfig.js";

/**
 * Channel Account 支持的渠道类型。
 */
export type StoredChannelAccountChannel = "telegram" | "feishu" | "qq";

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
   * 是否暂停该模型。
   *
   * 关键点（中文）
   * - 暂停后禁止作为 `model.primary` 被运行时加载。
   * - 用于模型维护窗口、成本管控或临时故障隔离。
   */
  isPaused: boolean;
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
  /**
   * 是否暂停该模型（可选）。
   */
  isPaused?: boolean;
}

/**
 * Console 全局环境变量记录。
 */
export interface StoredGlobalEnvEntry {
  /**
   * 环境变量 key（例如 `OPENAI_API_KEY`）。
   */
  key: string;
  /**
   * 环境变量 value（解密后的明文，仅运行时内存可见）。
   */
  value: string;
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
 * Agent 私有环境变量记录。
 */
export interface StoredAgentEnvEntry {
  /**
   * Agent 唯一标识（使用 projectRoot 绝对路径）。
   */
  agentId: string;
  /**
   * 环境变量 key（例如 `QQ_APP_ID`）。
   */
  key: string;
  /**
   * 环境变量 value（解密后的明文，仅运行时内存可见）。
   */
  value: string;
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
 * 全局环境变量写入参数。
 */
export interface UpsertGlobalEnvEntryInput {
  /**
   * 环境变量 key。
   */
  key: string;
  /**
   * 环境变量值；空字符串也允许（用于显式置空）。
   */
  value: string;
}

/**
 * Agent 私有环境变量写入参数。
 */
export interface UpsertAgentEnvEntryInput {
  /**
   * Agent 唯一标识（projectRoot）。
   */
  agentId: string;
  /**
   * 环境变量 key。
   */
  key: string;
  /**
   * 环境变量值；空字符串也允许（用于显式置空）。
   */
  value: string;
}

/**
 * Channel Account 记录。
 */
export interface StoredChannelAccount {
  /**
   * 账户主键 ID（例如 `qq-main`）。
   */
  id: string;
  /**
   * 账户归属渠道（telegram/feishu/qq）。
   */
  channel: StoredChannelAccountChannel;
  /**
   * UI 展示名（例如“主 QQ 机器人”）。
   */
  name: string;
  /**
   * 身份展示文案（例如 `@my_bot`、`app:123`），可选。
   */
  identity?: string;
  /**
   * 机器人所有者信息（可选，平台可获取时自动同步）。
   */
  owner?: string;
  /**
   * 机器人创建者信息（可选，平台可获取时自动同步）。
   */
  creator?: string;
  /**
   * Telegram Token（解密后，可选）。
   */
  botToken?: string;
  /**
   * AppId（解密后，可选）。
   */
  appId?: string;
  /**
   * AppSecret（解密后，可选）。
   */
  appSecret?: string;
  /**
   * 渠道域名（主要用于 Feishu/Lark），可选。
   */
  domain?: string;
  /**
   * QQ 沙箱模式开关，可选。
   */
  sandbox?: boolean;
  /**
   * 主人鉴权 ID（可选）。
   */
  authId?: string;
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
 * Channel Account 写入参数。
 */
export interface UpsertChannelAccountInput {
  /**
   * 账户主键 ID。
   */
  id: string;
  /**
   * 账户归属渠道。
   */
  channel: StoredChannelAccountChannel;
  /**
   * 账户展示名。
   */
  name: string;
  /**
   * 身份展示文案，可选。
   */
  identity?: string;
  /**
   * 机器人所有者信息（可选）。
   */
  owner?: string;
  /**
   * 机器人创建者信息（可选）。
   */
  creator?: string;
  /**
   * Telegram Token，可选。
   */
  botToken?: string;
  /**
   * AppId，可选。
   */
  appId?: string;
  /**
   * AppSecret，可选。
   */
  appSecret?: string;
  /**
   * 渠道域名，可选。
   */
  domain?: string;
  /**
   * QQ 沙箱模式，可选。
   */
  sandbox?: boolean;
  /**
   * 主人鉴权 ID，可选。
   */
  authId?: string;
}
