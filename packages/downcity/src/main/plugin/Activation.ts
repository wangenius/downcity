/**
 * Plugin 激活判定工具。
 *
 * 关键点（中文）
 * - 统一收敛“某个 plugin 在当前项目配置下是否启用”的规则。
 * - 控制面静态 catalog、执行链路 availability 与 hook 执行都复用这套逻辑。
 */

import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type { Plugin } from "@/shared/types/Plugin.js";

/**
 * 从 plugin 默认配置中读取默认 enabled 值。
 */
export function getPluginDefaultEnabled(plugin: Plugin): boolean {
  const candidate = plugin.config?.defaultValue?.enabled;
  if (typeof candidate === "boolean") return candidate;
  return true;
}

/**
 * 读取当前项目配置下的 plugin 启用态。
 */
export function isPluginEnabledInConfig(params: {
  plugin: Plugin;
  config?: DowncityConfig | null;
}): boolean {
  const pluginConfig = params.config?.plugins?.[params.plugin.name];
  if (pluginConfig && typeof pluginConfig === "object" && !Array.isArray(pluginConfig)) {
    const explicitEnabled = (pluginConfig as { enabled?: unknown }).enabled;
    if (typeof explicitEnabled === "boolean") return explicitEnabled;
    return getPluginDefaultEnabled(params.plugin);
  }
  return getPluginDefaultEnabled(params.plugin);
}
