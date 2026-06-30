/**
 * Plugin 激活兼容工具。
 *
 * 关键点（中文）
 * - 新模型不再读取 `downcity.json.plugins.<name>.enabled`。
 * - 传入 plugin 本身就表示调用方希望它可见；Agent runtime 以注册表作为真实边界。
 * - 该函数仅为旧内部集成保留，后续应优先使用 `context.plugins.has/status`。
 */

import type { Plugin } from "@/plugin/types/Plugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";

/**
 * 判断当前 plugin 是否可被视为启用。
 */
export function isPluginEnabled(params: {
  plugin: Plugin;
  context?: Pick<AgentContext, "plugins">;
}): boolean {
  const pluginName = String(params.plugin.name || "").trim();
  if (!pluginName) return false;
  if (params.context?.plugins) {
    return params.context.plugins.status(pluginName)?.status === "ready";
  }
  return true;
}
