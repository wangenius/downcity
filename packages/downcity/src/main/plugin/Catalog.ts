/**
 * Plugin Catalog。
 *
 * 关键点（中文）
 * - 这里承载 console 侧的静态 plugin 元数据视图。
 * - 目标是把“控制面可见的 plugin 定义”从 agent 执行态里拆出来复用。
 * - 当前先服务 Console 与 `city plugin` CLI 的静态回退场景。
 */

import { PLUGINS } from "@/main/plugin/Plugins.js";
import { isPluginEnabled } from "@/main/plugin/Activation.js";
import type {
  Plugin,
  PluginAvailability,
  PluginView,
} from "@/shared/types/Plugin.js";

/**
 * 将 Plugin 定义转换成静态概览视图。
 */
export function toStaticPluginView(plugin: Plugin): PluginView {
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
 * 列出全部内建 plugin 的静态概览视图。
 */
export function listStaticPluginViews(): PluginView[] {
  return listBuiltinPlugins()
    .map((plugin) => toStaticPluginView(plugin))
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
 * 按名称查找内建 plugin 的静态概览视图。
 */
export function findStaticPluginView(
  pluginName: string,
): PluginView | null {
  const plugin = findBuiltinPlugin(pluginName);
  return plugin ? toStaticPluginView(plugin) : null;
}

/**
 * 构建静态 plugin 可用性视图。
 *
 * 关键点（中文）
 * - 这里表达的是“控制面视角下可见的 city 配置事实”，不是执行链路中的最终可用性。
 * - `enabled` 只对齐 city 级 plugin lifecycle，不再读取 agent 项目配置。
 * - `available` 仅在无需执行上下文即可明确判断为 false 时返回 false；否则静态层视为可用。
 */
export function buildStaticPluginAvailability(params: {
  pluginName: string;
  agentError?: string;
}): PluginAvailability {
  const plugin = findBuiltinPlugin(params.pluginName);
  if (!plugin) {
    return {
      enabled: false,
      available: false,
      reasons: [`Unknown plugin: ${params.pluginName}`],
    };
  }

  const enabled = isPluginEnabled({ plugin });

  if (!enabled) {
    return {
      enabled: false,
      available: false,
      reasons: [`Plugin "${plugin.name}" is disabled in city config.`],
    };
  }

  const agentReason = String(params.agentError || "").trim();
  return {
    enabled: true,
    available: false,
    reasons: agentReason
      ? [`Agent server unavailable: ${agentReason}`]
      : ["Static catalog view only. Agent-side availability is not loaded."],
  };
}
