/**
 * Downcity 配置类型定义。
 *
 * 关键点（中文）
 * - 作为全局共享类型，不挂在 console 目录下。
 * - 供 agent、plugin、control plane 宿主层多处复用，避免反向类型依赖。
 */
import type { LlmConfig } from "@/types/config/LlmConfig.js";
import type { ExecutionBindingConfig } from "@/types/config/ExecutionBinding.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { SandboxProjectConfig } from "@/runtime/sandbox/types/Sandbox.js";

/**
 * 单个聊天渠道配置。
 */
export interface DowncityChatChannelConfig {
  /**
   * 当前渠道是否启用。
   */
  enabled?: boolean;
  /**
   * 绑定的渠道账户 ID。
   */
  channelAccountId?: string;
}

/**
 * 聊天插件渠道配置集合。
 */
export interface DowncityChatPluginChannelsConfig {
  /**
   * Telegram 渠道配置。
   */
  telegram?: DowncityChatChannelConfig;
  /**
   * Feishu 渠道配置。
   */
  feishu?: DowncityChatChannelConfig;
  /**
   * QQ 渠道配置。
   */
  qq?: DowncityChatChannelConfig;
}

/**
 * 聊天插件队列配置。
 */
export interface DowncityChatPluginQueueConfig {
  /**
   * 全局最大并发（不同 chatKey 之间）。
   * 默认：2
   */
  maxConcurrency?: number;
  /**
   * 入站消息合并的防抖窗口（毫秒）。
   *
   * 关键点（中文）
   * - 同一 chatKey 在该窗口内连续到达的多条消息，会在一次 run 前一起并入上下文。
   * - 典型场景：用户先发一句话，再紧接着转发链接/卡片。
   * - 设为 `0` 或负数可关闭该能力（立即执行首条消息）。
   *
   * 默认：600
   */
  mergeDebounceMs?: number;
  /**
   * 入站消息合并的最长等待时间（毫秒）。
   *
   * 关键点（中文）
   * - 即使用户持续发送新消息，也不会无限延期；达到该上限后会立刻启动 run。
   * - 用于平衡“尽量合并上下文”与“响应时延可控”。
   * - 当 `mergeDebounceMs <= 0` 时该字段不会生效。
   *
   * 默认：2000
   */
  mergeMaxWaitMs?: number;
}

/**
 * 聊天插件出站控制配置。
 */
export interface DowncityChatPluginEgressConfig {
  /**
   * 单次 agent run 内，`chat_send` 允许调用的最大次数。
   */
  chatSendMaxCallsPerRun?: number;
  /**
   * 是否启用 `chat_send` 幂等去重（基于 inbound messageId + 回复内容 hash）。
   */
  chatSendIdempotency?: boolean;
}

/**
 * 聊天插件配置。
 */
export interface DowncityChatPluginConfig {
  /**
   * Chat 调度队列（按 chatKey 分 lane）。
   */
  queue?: DowncityChatPluginQueueConfig;
  /**
   * 出站（egress）控制：用于限制工具发送、避免重复与无限循环刷屏。
   */
  egress?: DowncityChatPluginEgressConfig;
  /**
   * 消息平台 channel 配置。
   */
  channels?: DowncityChatPluginChannelsConfig;
}

/**
 * skill 插件配置。
 */
export interface DowncitySkillPluginConfig {
  /**
   * 当前插件是否启用。
   */
  enabled?: boolean;
  /**
   * 技能目录列表。
   */
  paths?: string[];
  /**
   * 是否允许读取项目外部技能目录。
   */
  allowExternalPaths?: boolean;
}

/**
 * downcity.json 中的插件配置映射。
 */
export interface DowncityPluginConfigMap {
  /**
   * chat 插件配置。
   */
  chat?: DowncityChatPluginConfig;
  /**
   * skill 插件配置。
   */
  skill?: DowncitySkillPluginConfig;
  /**
   * 其他插件配置。
   */
  [pluginName: string]:
    | JsonObject
    | DowncityChatPluginConfig
    | DowncitySkillPluginConfig
    | undefined;
}

export interface DowncityConfig {
  $schema?: string;
  /**
   * agent 唯一标识。
   *
   * 关键点（中文）
   * - `@downcity/agent` 只关心稳定标识，不承担展示名语义。
   * - 该字段同时用于 session/runtime/storage 目录归属。
   */
  id: string;
  version: string;
  /**
   * Runtime startup configuration used by `downcity agent start`.
   * CLI flags (if provided) take precedence over this config.
   */
  start?: {
    port?: number;
    host?: string;
  };
  /**
   * plugins 配置。
   *
   * 关键点（中文）
   * - 所有可配置能力统一收敛到 `plugins`，不再保留独立 `services` 域。
   * - plugin 私有配置（例如 `plugins.skill.paths`、`plugins.chat.channels`）也放在这里。
   * - key 为 plugin 名称，value 为对应插件的结构化配置对象。
   * - 当前阶段允许各 plugin 自定义字段，但必须保持 JSON 可序列化。
   */
  plugins?: DowncityPluginConfigMap;
  /**
   * 项目执行绑定配置。
   *
   * 关键点（中文）
   * - 项目只有一种执行模式：`api`。
   * - 绑定平台全局模型池中的模型 ID。
   */
  execution?: ExecutionBindingConfig;
  /**
   * shell / CLI 执行 sandbox 配置。
   *
   * 关键点（中文）
   * - 当前只作用于 shell plugin 这条命令执行链。
   * - 这里不表达审批、用户授权与复杂策略系统，只表达最小边界。
   */
  sandbox?: SandboxProjectConfig;
  /**
   * LLM 全量配置（通常来自平台全局层合并结果）。
   *
   * 关键点（中文）
   * - `@downcity/agent` 本地 SDK 不直接消费该字段。
   * - 宿主侧（例如 `@downcity/studio-cli`）可读取该字段控制模型工厂行为，例如 `llm.logMessages`。
   * - 对于项目内 `downcity.json`，通常不需要显式写 provider/model 明细。
   */
  llm?: LlmConfig;
}
