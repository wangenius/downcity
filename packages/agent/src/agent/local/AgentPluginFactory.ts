/**
 * Agent plugin 装配工厂。
 *
 * 关键点（中文）
 * - 这里只负责把 plugin 实例装配成 registry。
 * - Agent 仍然持有长期状态；这里不创建新的运行时层级。
 */

import type { Plugin } from "@/types/plugin/PluginDefinition.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import { HookRegistry } from "@/plugin/core/HookRegistry.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";

/**
 * 创建 plugin registry 的参数。
 */
export interface CreateAgentPluginRegistryOptions {
  /** 当前 agent 显式注册的 plugin 实例。 */
  plugins: Plugin[];
  /** 延迟读取当前 AgentContext。 */
  get_context: () => AgentContext;
}

/**
 * 创建 plugin 注册表。
 */
export function createAgentPluginRegistry(
  options: CreateAgentPluginRegistryOptions,
): PluginRegistry {
  let plugin_registry_ref: PluginRegistry | null = null;
  const hook_registry = new HookRegistry({
    contextResolver: options.get_context,
    pluginEnabledChecker: (plugin_name) => {
      void options;
      return plugin_registry_ref?.isReady(plugin_name) || false;
    },
  });
  const registry = new PluginRegistry({
    contextResolver: options.get_context,
    hookRegistry: hook_registry,
  });
  plugin_registry_ref = registry;

  for (const plugin of options.plugins) {
    registry.mount(plugin);
  }
  return registry;
}
