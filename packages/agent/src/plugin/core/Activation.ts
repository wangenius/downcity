/**
 * Plugin 激活判定工具。
 *
 * 关键点（中文）
 * - 统一收敛“某个 plugin 在当前项目配置下是否启用”的规则。
 * - plugin 启用态直接来自项目 `downcity.json` 的 `plugins.<name>.enabled`。
 */

import { readProjectPluginEnabled } from "@/plugin/core/ProjectConfigStore.js";
import type { Plugin } from "@/plugin/types/Plugin.js";
import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntimeBase } from "@/types/runtime/agent/AgentRuntime.js";

/**
 * 读取当前项目配置下的 plugin 启用态。
 */
export function isPluginEnabled(params: {
  plugin: Plugin;
  context?: Pick<AgentContext, "config">;
  runtime?: Pick<AgentRuntimeBase, "config">;
}): boolean {
  const pluginName = String(params.plugin.name || "").trim();
  if (!pluginName) return false;
  return readProjectPluginEnabled({
    pluginName,
    config: params.context?.config || params.runtime?.config,
  });
}
