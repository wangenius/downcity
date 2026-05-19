/**
 * 内建 Plugin 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护全部内建 plugin，避免 CLI / agent / docs 各自硬编码。
 * - 同时提供统一注册入口，减少额外跳转层级。
 */

import type { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import type { Plugin } from "@/plugin/types/Plugin.js";
import { authPlugin } from "@/plugin/builtins/auth/Plugin.js";
import { skillPlugin } from "@/plugin/builtins/skill/Plugin.js";
import { webPlugin } from "@/plugin/builtins/web/Plugin.js";
import { asrPlugin } from "@/plugin/builtins/asr/Plugin.js";
import { ttsPlugin } from "@/plugin/builtins/tts/Plugin.js";
import { workboardPlugin } from "@/plugin/builtins/workboard/Plugin.js";

/**
 * 全部内建 Plugin。
 */
export const PLUGINS: Plugin[] = [
  authPlugin,
  skillPlugin,
  webPlugin,
  asrPlugin,
  ttsPlugin,
  workboardPlugin,
];

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
