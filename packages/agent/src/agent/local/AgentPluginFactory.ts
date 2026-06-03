/**
 * Agent plugin 装配工厂。
 *
 * 关键点（中文）
 * - 这里只负责把 plugin 实例装配成 registry 与对外 port。
 * - Agent 仍然持有长期状态；这里不创建新的运行时层级。
 */

import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type {
  PluginAvailability,
  PluginPort,
  PluginView,
} from "@/plugin/types/Plugin.js";
import { HookRegistry } from "@/plugin/core/HookRegistry.js";
import { PluginRegistry } from "@/plugin/core/PluginRegistry.js";
import { isPluginEnabled } from "@/plugin/core/Activation.js";

/**
 * 创建 plugin registry 的参数。
 */
export interface CreateAgentPluginRegistryOptions {
  /** 当前 agent 显式注册的 plugin 实例。 */
  plugins: BasePlugin[];
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
      const plugin = plugin_registry_ref?.get(plugin_name);
      return plugin
        ? isPluginEnabled({ plugin, context: options.get_context() })
        : false;
    },
  });
  const registry = new PluginRegistry({
    contextResolver: options.get_context,
    hookRegistry: hook_registry,
  });
  plugin_registry_ref = registry;

  for (const plugin of options.plugins) {
    registry.register(plugin);
  }
  return registry;
}

/**
 * 创建对外暴露的 plugin 调用门面。
 */
export function createAgentPluginPort(
  plugin_registry: PluginRegistry,
): PluginPort {
  return {
    list: (): PluginView[] => plugin_registry.list(),
    availability: async (plugin_name: string): Promise<PluginAvailability> =>
      await plugin_registry.availability(plugin_name),
    runAction: async (params) => await plugin_registry.runAction(params),
    pipeline: async <T>(point_name: string, value: T): Promise<T> =>
      await plugin_registry.pipeline(point_name, value),
    guard: async <T>(point_name: string, value: T): Promise<void> => {
      await plugin_registry.guard(point_name, value);
    },
    effect: async <T>(point_name: string, value: T): Promise<void> => {
      await plugin_registry.effect(point_name, value);
    },
    resolve: async <TInput, TOutput>(
      point_name: string,
      value: TInput,
    ): Promise<TOutput> =>
      await plugin_registry.resolve<TInput, TOutput>(point_name, value),
  };
}
