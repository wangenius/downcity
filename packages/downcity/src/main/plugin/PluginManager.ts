/**
 * PluginManager 单例。
 *
 * 关键点（中文）
 * - `main/plugin/*` 是 plugin 的管理层，不是具体 plugin 实现层。
 * - plugin hook / resolve / system 注入所依赖的注册与调度统一收口到这里。
 * - PluginManager 属于 city runtime，不直接反向依赖 agent AgentContext 单例。
 * - agent 只是通过 AgentContext 调用统一 plugin manager。
 * - 具体 plugin 实现位于 `src/plugins/*`，CLI plugin 命令则直接走本地命令执行器。
 */

import { isPluginEnabled } from "@/main/plugin/Activation.js";
import { HookRegistry } from "@/main/plugin/HookRegistry.js";
import { PluginRegistry } from "@/main/plugin/PluginRegistry.js";
import { registerBuiltinPlugins } from "@/main/plugin/Plugins.js";
import { getPluginRuntimeContextResolver } from "@/main/city/runtime/PluginRuntime.js";

let pluginManager: PluginRegistry | null = null;

/**
 * 初始化全局 plugin manager。
 */
export function initializePluginManager(): PluginRegistry {
  if (pluginManager) return pluginManager;

  const contextResolver = getPluginRuntimeContextResolver();
  let pluginRegistryRef: PluginRegistry | null = null;
  const hookRegistry = new HookRegistry({
    contextResolver,
    pluginEnabledChecker: (pluginName, context) => {
      const plugin = pluginRegistryRef?.get(pluginName);
      if (!plugin) return false;
      return isPluginEnabled({
        plugin,
      });
    },
  });

  const registry = new PluginRegistry({
    contextResolver,
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
