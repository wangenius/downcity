/**
 * Plugin Catalog。
 *
 * 关键点（中文）
 * - 这里承载 console 侧的静态 plugin 元数据视图。
 * - 目标是把“控制面可见的 plugin 定义”从 agent runtime 执行态里拆出来复用。
 * - 当前先服务 Console UI 与 `city plugin` CLI 的静态回退场景。
 */

import { PLUGINS } from "@/console/plugin/Plugins.js";
import { loadDowncityConfig } from "@/console/env/Config.js";
import { isPluginEnabledInConfig } from "@/console/plugin/Activation.js";
import type {
  Plugin,
  PluginAvailability,
  PluginRuntimeView,
} from "@/types/Plugin.js";
import type { DowncityConfig } from "@agent/types/DowncityConfig.js";

/**
 * 将 Plugin 定义转换成静态运行时视图。
 */
export function toStaticPluginRuntimeView(plugin: Plugin): PluginRuntimeView {
  return {
    name: plugin.name,
    title: String(plugin.title || plugin.name || "").trim(),
    description: String(plugin.description || "").trim(),
    actions: Object.keys(plugin.actions || {}).sort((a, b) => a.localeCompare(b)),
    pipelines: Object.keys(plugin.hooks?.pipeline || {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    guards: Object.keys(plugin.hooks?.guard || {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    effects: Object.keys(plugin.hooks?.effect || {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    resolves: Object.keys(plugin.resolves || {}).sort((a, b) =>
      a.localeCompare(b),
    ),
    requiredAssets: Array.isArray(plugin.requirements?.assets)
      ? [...plugin.requirements.assets].sort((a, b) => a.localeCompare(b))
      : [],
    hasSystem: typeof plugin.system === "function",
    hasAvailability: typeof plugin.availability === "function",
  };
}

/**
 * 列出全部内建 plugin 定义。
 */
export function listBuiltinPlugins(): Plugin[] {
  return [...PLUGINS];
}

/**
 * 列出全部内建 plugin 的静态运行时视图。
 */
export function listStaticPluginRuntimeViews(): PluginRuntimeView[] {
  return listBuiltinPlugins()
    .map((plugin) => toStaticPluginRuntimeView(plugin))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 按名称查找内建 plugin 定义。
 */
export function findBuiltinPlugin(pluginName: string): Plugin | null {
  const key = String(pluginName || "").trim();
  if (!key) return null;
  return listBuiltinPlugins().find((plugin) => plugin.name === key) || null;
}

/**
 * 按名称查找内建 plugin 的静态运行时视图。
 */
export function findStaticPluginRuntimeView(
  pluginName: string,
): PluginRuntimeView | null {
  const plugin = findBuiltinPlugin(pluginName);
  return plugin ? toStaticPluginRuntimeView(plugin) : null;
}

function getProjectPluginConfig(projectRoot?: string): DowncityConfig["plugins"] | null {
  const root = String(projectRoot || "").trim();
  if (!root) return null;
  try {
    return loadDowncityConfig(root).plugins || null;
  } catch {
    return null;
  }
}

/**
 * 构建静态 plugin 可用性视图。
 *
 * 关键点（中文）
 * - 这里表达的是“控制面视角下可见的配置事实”，不是 runtime 内的最终可用性。
 * - `enabled` 尽量对齐项目 `downcity.json.plugins.*`。
 * - `available` 仅在无需 runtime 即可明确判断为 false 时返回 false；否则静态层视为可用。
 */
export function buildStaticPluginAvailability(params: {
  pluginName: string;
  projectRoot?: string;
  runtimeError?: string;
}): PluginAvailability {
  const plugin = findBuiltinPlugin(params.pluginName);
  if (!plugin) {
    return {
      enabled: false,
      available: false,
      reasons: [`Unknown plugin: ${params.pluginName}`],
      missingAssets: [],
    };
  }

  const pluginConfigMap = getProjectPluginConfig(params.projectRoot);
  const enabled = isPluginEnabledInConfig({
    plugin,
    config: pluginConfigMap ? ({ plugins: pluginConfigMap } as DowncityConfig) : null,
  });

  if (!enabled) {
    return {
      enabled: false,
      available: false,
      reasons: [`Plugin "${plugin.name}" is disabled in project config.`],
      missingAssets: Array.isArray(plugin.requirements?.assets)
        ? [...plugin.requirements.assets]
        : [],
    };
  }

  const runtimeReason = String(params.runtimeError || "").trim();
  return {
    enabled: true,
    available: false,
    reasons: runtimeReason
      ? [`Runtime unavailable: ${runtimeReason}`]
      : ["Static catalog view only. Runtime availability is not loaded."],
    missingAssets: [],
  };
}
