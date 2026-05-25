/**
 * PluginClassRegistry：主动型 plugin 类注册表。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import { BUILTIN_PLUGIN_CLASSES } from "@/plugin/core/BuiltinPluginClasses.js";
import { BasePlugin } from "@/plugin/core/BasePlugin.js";

let staticPluginInstances: Map<string, BasePlugin> | null = null;

function createPluginInstance(
  PluginClass: new (agent: AgentRuntime | null) => BasePlugin,
  agent: AgentRuntime | null,
): BasePlugin {
  return new PluginClass(agent);
}

/**
 * 返回全部已注册内建主动型 plugin 名称。
 */
export function listRegisteredPluginNames(): string[] {
  return BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass(null).name);
}

/**
 * 返回全部已注册内建主动型 plugin 实例视图。
 */
export function listRegisteredPlugins(): BasePlugin[] {
  return BUILTIN_PLUGIN_CLASSES.map((PluginClass) => new PluginClass(null));
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
 * 为当前 agent 创建一组主动型 plugin instances。
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
