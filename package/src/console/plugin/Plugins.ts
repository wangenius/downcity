/**
 * 内建 Plugin 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护全部内建 plugin，避免 CLI / runtime / docs 各自硬编码。
 * - 同时提供统一注册入口，减少额外跳转层级。
 * - 当前阶段仅注册 voice plugin 与其内建 asset。
 */

import type { AssetRegistry } from "@/console/plugin/AssetRegistry.js";
import type { PluginRegistry } from "@/console/plugin/PluginRegistry.js";
import type { Plugin } from "@/types/Plugin.js";
import { voiceTranscriberAsset } from "@/plugins/voice/Asset.js";
import { voicePlugin } from "@/plugins/voice/Plugin.js";

/**
 * 全部内建 Plugin。
 */
export const PLUGINS: Plugin[] = [voicePlugin];

/**
 * 注册全部内建插件体系对象。
 */
export function registerBuiltinPlugins(params: {
  assetRegistry: AssetRegistry;
  pluginRegistry: PluginRegistry;
}): void {
  params.assetRegistry.register(voiceTranscriberAsset);
  for (const plugin of PLUGINS) {
    params.pluginRegistry.register(plugin);
  }
}
