/**
 * 模型存储（SQLite）类型定义。
 *
 * 关键点（中文）
 * - 该类型用于平台控制面全局模型池（provider/model）的统一读写。
 * - agent 项目只通过 `execution.modelId` 绑定模型 ID，不直接持有 provider 细节。
 */
import type { LlmProviderType } from "@/types/config/LlmConfig.js";

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
 * provider 元信息。
 *
 * 关键点（中文）
 * - 仅保留同步读取所需的轻量字段。
 * - 不包含解密后的 API Key，避免在只读展示链路中泄露敏感信息。
 */
export interface StoredProviderMeta {
  /**
   * provider 主键 ID。
   */
  id: string;
  /**
   * provider 类型。
   */
  type: LlmProviderType;
  /**
   * provider 基础地址（可选）。
   */
  baseUrl?: string;
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
   * - 暂停后禁止作为 `execution.modelId` 被运行时加载。
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
 * 平台环境变量记录。
 */
export interface StoredEnvEntry {
  /**
   * Env 作用域。
   *
   * 关键点（中文）
   * - 当前版本只保留 `global` 单一作用域。
   * - 所有平台 Env 都视为宿主级共享变量，由宿主决定是否注入 `process.env`。
   */
  scope: "global";
  /**
   * 环境变量 key（例如 `OPENAI_API_KEY`）。
   */
  key: string;
  /**
   * 环境变量描述。
   *
   * 关键点（中文）
   * - 面向用户说明该变量的用途。
   * - 可为空，用于兼容历史只存 key/value 的数据。
   */
  description?: string;
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
 * Env 写入参数。
 */
export interface UpsertEnvEntryInput {
  /**
   * Env 作用域。
   *
   * 关键点（中文）
   * - 当前只允许写入 `global`。
   * - 保留该字段是为了让宿主侧调用点显式表达“这是平台全局 env 写入”。
   */
  scope: "global";
  /**
   * 环境变量 key。
   */
  key: string;
  /**
   * 环境变量描述。
   *
   * 关键点（中文）
   * - 允许为空，表示暂未填写用途说明。
   */
  description?: string;
  /**
   * 环境变量值；空字符串也允许（用于显式置空）。
   */
  value: string;
}

/**
 * 全局环境变量记录。
 */
export type StoredGlobalEnvEntry = StoredEnvEntry;

/**
 * 全局环境变量写入参数。
 */
export type UpsertGlobalEnvEntryInput = Omit<UpsertEnvEntryInput, "scope">;

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
}
