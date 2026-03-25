/**
 * Console UI Gateway 内部类型定义。
 *
 * 关键点（中文）
 * - 仅承载网关模块内部使用的结构化类型。
 * - 所有字段保持宽松输入，便于兼容磁盘 JSON 与运行时 API 的非强约束数据。
 */

/**
 * Daemon 元数据文件结构。
 */
export interface ConsoleUiDaemonMeta {
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
 * downcity.json 中的模型配置。
 */
export interface ConsoleUiShipModelConfig {
  /**
   * 当前 agent 绑定的主模型 id。
   */
  primary?: unknown;
}

/**
 * 单个聊天渠道配置。
 */
export interface ConsoleUiShipSingleChannelConfig {
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
export interface ConsoleUiShipChatChannelsConfig {
  /**
   * Telegram 渠道配置。
   */
  telegram?: ConsoleUiShipSingleChannelConfig;

  /**
   * 飞书渠道配置。
   */
  feishu?: ConsoleUiShipSingleChannelConfig;

  /**
   * QQ 渠道配置。
   */
  qq?: ConsoleUiShipSingleChannelConfig;
}

/**
 * 聊天服务配置。
 */
export interface ConsoleUiShipChatServiceConfig {
  /**
   * 渠道配置集合。
   */
  channels?: ConsoleUiShipChatChannelsConfig;
}

/**
 * downcity.json 中的 services 配置。
 */
export interface ConsoleUiShipServicesConfig {
  /**
   * chat 服务配置。
   */
  chat?: ConsoleUiShipChatServiceConfig;
}

/**
 * downcity.json 中的启动配置。
 */
export interface ConsoleUiShipStartConfig {
  /**
   * runtime host。
   */
  host?: unknown;

  /**
   * runtime port。
   */
  port?: unknown;
}

/**
 * downcity.json 宽松结构。
 */
export interface ConsoleUiShipJson {
  /**
   * agent 展示名称。
   */
  name?: unknown;

  /**
   * 模型配置。
   */
  model?: ConsoleUiShipModelConfig;

  /**
   * 服务配置。
   */
  services?: ConsoleUiShipServicesConfig;

  /**
   * 启动配置。
   */
  start?: ConsoleUiShipStartConfig;
}

/**
 * chat service status 返回中的单渠道状态。
 */
export interface ConsoleUiChatChannelStatus {
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
   * runtime 是否处于运行态。
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
