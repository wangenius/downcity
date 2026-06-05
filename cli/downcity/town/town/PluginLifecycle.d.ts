/**
 * Town 级 plugin 生命周期管理。
 *
 * 关键点（中文）
 * - plugin 启用/关闭属于 Town 全局配置，不应由 agent 自己写入。
 * - 这里把状态落到平台安全配置中，由 Town 统一读写。
 * - 默认策略：未显式关闭时，一律视为启用。
 */
/**
 * 单个 plugin 的 Town 级生命周期配置。
 */
export interface BayPluginLifecycleItem {
    /**
     * 当前 plugin 是否在 Town 级被启用。
     */
    enabled: boolean;
    /**
     * 最近更新时间（ISO 字符串）。
     */
    updatedAt: string;
}
/**
 * Town 级 plugin 生命周期配置映射。
 */
export interface TownPluginLifecycleConfig {
    /**
     * 插件生命周期配置对象映射。
     */
    [pluginName: string]: BayPluginLifecycleItem | undefined;
}
/**
 * 读取 Town 级 plugin 生命周期配置。
 */
export declare function readTownPluginLifecycleConfig(): TownPluginLifecycleConfig;
/**
 * 写入完整 Town 级 plugin 生命周期配置。
 */
export declare function writeTownPluginLifecycleConfig(value: TownPluginLifecycleConfig): TownPluginLifecycleConfig;
/**
 * 读取单个 plugin 的 Town 级生命周期状态。
 */
export declare function readTownPluginLifecycleItem(pluginName: string): BayPluginLifecycleItem | null;
/**
 * 判断单个 plugin 是否启用。
 */
export declare function isTownPluginEnabled(pluginName: string): boolean;
/**
 * 设置单个 plugin 的启用态。
 */
export declare function setBayPluginEnabled(pluginName: string, enabled: boolean): TownPluginLifecycleConfig;
//# sourceMappingURL=PluginLifecycle.d.ts.map