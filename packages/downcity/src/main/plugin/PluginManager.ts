/**
 * PluginManager 单例。
 *
 * 关键点（中文）
 * - plugin hook / resolve / system 注入所依赖的注册与调度统一收口到 main 层。
 * - agent 不直接持有 plugin 注册表；agent 只是通过 ExecutionContext 调用 main 的 plugin manager。
 * - CLI plugin 命令则直接走本地命令执行器，不依赖这里的 manager 单例。
 */

import { isPluginEnabledInConfig } from "@/main/plugin/Activation.js";
import { HookRegistry } from "@/main/plugin/HookRegistry.js";
import { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/main/plugin/Plugins.js";
import { getExecutionContext } from "@agent/ExecutionContext.js";

let pluginManager: PluginRegistry | null = null;

/**
 * 初始化全局 plugin manager。
 */
export function initializePluginManager(): PluginRegistry {
  if (pluginManager) return pluginManager;

  let pluginRegistryRef: PluginRegistry | null = null;
  const hookRegistry = new HookRegistry({
    contextResolver: () => getExecutionContext(),
    pluginEnabledChecker: (pluginName, context) => {
      const plugin = pluginRegistryRef?.get(pluginName);
      if (!plugin) return false;
      return isPluginEnabledInConfig({
        plugin,
        config: context.config,
      });
    },
  });

  const registry = new PluginRegistry({
    contextResolver: () => getExecutionContext(),
    hookRegistry,
  });
  pluginRegistryRef = registry;
  registerBuiltinPlugins({
    pluginRegistry: registry,
  });
  pluginManager = registry;
  return registry;
}

/**
 * 读取全局 plugin manager。
 */
export function getPluginManager(): PluginRegistry {
  if (!pluginManager) {
    return initializePluginManager();
  }
  return pluginManager;
}

/**
 * 重置全局 plugin manager（测试/重启场景）。
 */
export function resetPluginManager(): void {
  pluginManager = null;
}
