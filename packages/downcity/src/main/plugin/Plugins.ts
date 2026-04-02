/**
 * 内建 Plugin 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护全部内建 plugin，避免 CLI / agent / docs 各自硬编码。
 * - 同时提供统一注册入口，减少额外跳转层级。
 * - 当前阶段注册 auth / skill / web / asr / tts 五个内建 plugin。
 */

import type { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import type { Plugin } from "@/types/Plugin.js";
import { authPlugin } from "@/plugins/auth/Plugin.js";
import { skillPlugin } from "@/plugins/skill/Plugin.js";
import { webPlugin } from "@/plugins/web/Plugin.js";
import { asrPlugin } from "@/plugins/asr/Plugin.js";
import { ttsPlugin } from "@/plugins/tts/Plugin.js";

/**
 * 全部内建 Plugin。
 */
export const PLUGINS: Plugin[] = [authPlugin, skillPlugin, webPlugin, asrPlugin, ttsPlugin];

/**
 * 注册全部内建插件体系对象。
 */
export function registerBuiltinPlugins(params: {
  pluginRegistry: PluginRegistry;
}): void {
  for (const plugin of PLUGINS) {
    params.pluginRegistry.register(plugin);
  }
}
