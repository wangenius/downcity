/**
 * Console Gateway 内部类型定义。
 *
 * 关键点（中文）
 * - 仅承载网关模块内部使用的结构化类型。
 * - 所有字段保持宽松输入，便于兼容磁盘 JSON 与运行时 API 的非强约束数据。
 */

/**
 * Daemon 元数据文件结构。
 */
export interface ConsoleDaemonMeta {
  /**
   * 启动 daemon 时记录的原始参数列表。
   *
   * 说明（中文）
   * - 来自 `.downcity/daemon/*.json`。
   * - 保持 `unknown`，避免过早假设参数格式。
   */
  args?: unknown;
}

/**
 * downcity.json 中的 ACP agent 配置。
 */
export interface ConsoleShipExecutionAgentConfig {
  /**
   * ACP agent 类型。
   */
  type?: unknown;
  /**
   * 自定义启动命令。
   */
  command?: unknown;
  /**
   * 自定义启动参数。
   */
  args?: unknown;
  /**
   * 自定义环境变量。
   */
  env?: unknown;
}

/**
 * downcity.json 中的 execution 配置。
 */
export interface ConsoleShipExecutionConfig {
  /**
   * 执行模式。
   */
  type?: unknown;
  /**
   * 模型执行模式下的模型 ID。
   */
  modelId?: unknown;
  /**
   * ACP 执行模式下的 agent 配置。
   */
  agent?: ConsoleShipExecutionAgentConfig;
}

/**
 * 单个聊天渠道配置。
 */
export interface ConsoleShipSingleChannelConfig {
  /**
   * 渠道是否启用。
   */
  enabled?: unknown;

  /**
   * 绑定的渠道账户 id。
   */
  channelAccountId?: unknown;
}

/**
 * 聊天服务渠道配置集合。
 */
export interface ConsoleShipChatChannelsConfig {
  /**
   * Telegram 渠道配置。
   */
  telegram?: ConsoleShipSingleChannelConfig;

  /**
   * 飞书渠道配置。
   */
  feishu?: ConsoleShipSingleChannelConfig;

  /**
   * QQ 渠道配置。
   */
  qq?: ConsoleShipSingleChannelConfig;
}

/**
 * 聊天服务配置。
 */
export interface ConsoleShipChatServiceConfig {
  /**
   * 渠道配置集合。
   */
  channels?: ConsoleShipChatChannelsConfig;
}

/**
 * downcity.json 中的 services 配置。
 */
export interface ConsoleShipServicesConfig {
  /**
   * chat 服务配置。
   */
  chat?: ConsoleShipChatServiceConfig;
}

/**
 * downcity.json 中的启动配置。
 */
export interface ConsoleShipStartConfig {
  /**
   * agent server host。
   */
  host?: unknown;

  /**
   * agent server port。
   */
  port?: unknown;
}

/**
 * downcity.json 宽松结构。
 */
export interface ConsoleShipJson {
  /**
   * agent 展示名称。
   */
  name?: unknown;

  /**
   * 执行配置。
   */
  execution?: ConsoleShipExecutionConfig;

  /**
   * 服务配置。
   */
  services?: ConsoleShipServicesConfig;

  /**
   * 启动配置。
   */
  start?: ConsoleShipStartConfig;
}

/**
 * chat service status 返回中的单渠道状态。
 */
export interface ConsoleChatChannelStatus {
  /**
   * 渠道名。
   */
  channel?: unknown;

  /**
   * 是否启用。
   */
  enabled?: unknown;

  /**
   * 是否已完成配置。
   */
  configured?: unknown;

  /**
   * agent server 中该渠道是否处于运行态。
   */
  running?: unknown;

  /**
   * 链接状态文本。
   */
  linkState?: unknown;

  /**
   * 用户可见状态文案。
   */
  statusText?: unknown;

  /**
   * 额外明细。
   */
  detail?: Record<string, unknown>;
}
