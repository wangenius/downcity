/**
 * Plugin 生命周期配置类型定义。
 *
 * 关键点（中文）
 * - Plugin 是否启用属于 city 级全局状态，不属于单个 agent 项目。
 * - 该文件只描述 city 级 lifecycle 数据，不承载 agent 局部参数。
 */

/**
 * 单个 plugin 的 city 级生命周期配置。
 */
export interface CityPluginLifecycleItem {
  /**
   * 当前 plugin 是否在 city 级被启用。
   */
  enabled: boolean;
  /**
   * 最近更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * city 级 plugin 生命周期配置映射。
 */
export interface CityPluginLifecycleConfig {
  /**
   * 插件生命周期配置对象映射。
   *
   * 说明（中文）
   * - key 为 plugin 稳定名称。
   * - value 为该 plugin 的 city 级启用状态快照。
   */
  [pluginName: string]: CityPluginLifecycleItem | undefined;
}
