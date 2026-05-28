/**
 * PluginClassRegistry：统一内建 plugin 类注册表。
 *
 * 关键点（中文）
 * - 所有内建 plugin 都通过这里暴露实例与名称。
 * - “是否由运行中的 agent 承载”不再由独立类型区分，而是从 plugin 能力推导。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import { BUILTIN_PLUGIN_CLASSES } from "./BuiltinPluginClasses.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";

let staticPluginInstances: Map<string, BasePlugin> | null = null;

function createPluginInstance(
  PluginClass: new (agent: AgentRuntime | null) => BasePlugin,
  agent: AgentRuntime | null,
): BasePlugin {
  return new PluginClass(agent);
}

/**
 * 判断 plugin 是否需要运行中的 agent 来承载生命周期/命令。
 */
export function isManagedPlugin(plugin: BasePlugin): boolean {
  return Boolean(plugin.lifecycle);
}

/**
 * 返回全部已注册内建 plugin 名称。
 */
export function listRegisteredPluginNames(): string[] {
  return BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass(null).name);
}

/**
 * 返回全部已注册内建 plugin 实例视图。
 */
export function listRegisteredPlugins(): BasePlugin[] {
  return BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass(null));
}

/**
 * 返回全部本地 plugin 实例视图。
 *
 * 关键点（中文）
 * - 本地 plugin 指“不依赖运行中 agent lifecycle”的那一类。
 * - 这类 plugin 可直接由 CLI / 控制面在本进程执行。
 */
export function listLocalPlugins(): BasePlugin[] {
  return listRegisteredPlugins().filter((plugin) => !isManagedPlugin(plugin));
}

/**
 * 返回全部受 agent 托管的 plugin 实例视图。
 */
export function listManagedPlugins(): BasePlugin[] {
  return listRegisteredPlugins().filter((plugin) => isManagedPlugin(plugin));
}

/**
 * 返回无宿主静态 plugin 实例集合。
 */
export function getRegisteredStaticPluginInstances(): Map<string, BasePlugin> {
  if (staticPluginInstances) return staticPluginInstances;
  staticPluginInstances = createRegisteredPluginInstances(null);
  return staticPluginInstances;
}

/**
 * 为当前 agent 创建一组内建 plugin instances。
 */
export function createRegisteredPluginInstances(
  agent: AgentRuntime | null,
): Map<string, BasePlugin> {
  if (agent === null && staticPluginInstances) {
    return staticPluginInstances;
  }
  const plugins = new Map<string, BasePlugin>();
  for (const PluginClass of BUILTIN_PLUGIN_CLASSES) {
    const plugin = createPluginInstance(PluginClass, agent);
    plugins.set(plugin.name, plugin);
  }
  if (agent === null) {
    staticPluginInstances = plugins;
  }
  return plugins;
}
