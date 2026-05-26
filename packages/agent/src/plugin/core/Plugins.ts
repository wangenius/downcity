/**
 * 内建 Plugin 清单（单一事实源）。
 *
 * 关键点（中文）
 * - 统一维护全部内建 plugin，避免 CLI / agent / docs 各自硬编码。
 * - 同时提供统一注册入口，减少额外跳转层级。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { AuthPlugin } from "@/plugin/builtins/auth/Plugin.js";
import { SkillPlugin } from "@/plugin/builtins/skill/Plugin.js";
import { WebPlugin } from "@/plugin/builtins/web/Plugin.js";
import { AsrPlugin } from "@/plugin/builtins/asr/Plugin.js";
import { TtsPlugin } from "@/plugin/builtins/tts/Plugin.js";
import { WorkboardPlugin } from "@/plugin/builtins/workboard/Plugin.js";

export type BuiltinStaticPluginClass<T extends BasePlugin = BasePlugin> = new (
  agent: AgentRuntime | null,
) => T;

/**
 * 全部内建静态插件 classes。
 */
export const BUILTIN_STATIC_PLUGIN_CLASSES: BuiltinStaticPluginClass[] = [
  AuthPlugin,
  SkillPlugin,
  WebPlugin,
  AsrPlugin,
  TtsPlugin,
  WorkboardPlugin,
];

/**
 * 为当前 agent 创建一组内建静态插件实例。
 */
export function createBuiltinStaticPluginInstances(
  agent: AgentRuntime | null,
): BasePlugin[] {
  return BUILTIN_STATIC_PLUGIN_CLASSES.map((PluginClass) => new PluginClass(agent));
}

/**
 * 全部内建 Plugin。
 */
export const PLUGINS: BasePlugin[] = createBuiltinStaticPluginInstances(null);

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
