/**
 * Plugin Runtime 单例。
 *
 * 关键点（中文）
 * - runtime hook / resolve / system 注入所依赖的 plugin 注册表统一收口到 main 层。
 * - agent 不再持有 plugin 注册表；agent 只是通过 ExecutionContext 调用 main 的 plugin runtime。
 * - CLI plugin 命令则直接走本地命令执行器，不依赖这里的 runtime 单例。
 */

import { isPluginEnabledInConfig } from "@/main/plugin/Activation.js";
import { HookRegistry } from "@/main/plugin/HookRegistry.js";
import { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/main/plugin/Plugins.js";
import { getExecutionContext } from "@agent/ExecutionContext.js";

let pluginRuntime: PluginRegistry | null = null;

/**
 * 初始化全局 plugin runtime。
 */
export function initializePluginRuntime(): PluginRegistry {
  if (pluginRuntime) return pluginRuntime;

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
  pluginRuntime = registry;
  return registry;
}

/**
 * 读取全局 plugin runtime。
 */
export function getPluginRuntime(): PluginRegistry {
  if (!pluginRuntime) {
    return initializePluginRuntime();
  }
  return pluginRuntime;
}

/**
 * 重置全局 plugin runtime（测试/重启场景）。
 */
export function resetPluginRuntime(): void {
  pluginRuntime = null;
}
