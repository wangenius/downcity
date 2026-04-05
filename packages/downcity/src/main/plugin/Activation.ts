/**
 * Plugin 激活判定工具。
 *
 * 关键点（中文）
 * - 统一收敛“某个 plugin 在当前 city 配置下是否启用”的规则。
 * - plugin 启用态属于 city 级生命周期配置，不再来自 agent `downcity.json`。
 */

import type { Plugin } from "@/shared/types/Plugin.js";
import { isCityPluginEnabled } from "@/main/plugin/Lifecycle.js";

/**
 * 读取当前 city 配置下的 plugin 启用态。
 */
export function isPluginEnabled(params: {
  plugin: Plugin;
}): boolean {
  const pluginName = String(params.plugin.name || "").trim();
  if (!pluginName) return false;
  if (pluginName === "auth") return true;
  return isCityPluginEnabled(pluginName);
}
