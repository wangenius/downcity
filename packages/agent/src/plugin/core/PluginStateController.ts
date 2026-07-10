/**
 * Plugin 注册状态控制模块。
 *
 * 关键点（中文）
 * - 新模型中 plugin 只有注册 / 卸载，不再暴露 start / stop / restart。
 * - 控制动作与类型协议保持一致，只支持状态查询和卸载。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type {
  PluginControlAction,
  PluginControlResult,
  PluginSnapshot,
} from "@/types/plugin/PluginState.js";

/**
 * 列出当前 Agent 已注册 plugin 快照。
 */
export function listPluginStates(input?: {
  context?: AgentContext;
}): PluginSnapshot[] {
  return input?.context?.plugins.snapshots() || [];
}

/**
 * 执行 plugin 控制动作。
 */
export async function controlPluginState(params: {
  pluginName: string;
  action: PluginControlAction;
  context: AgentContext;
}): Promise<PluginControlResult> {
  const pluginName = String(params.pluginName || "").trim();
  if (!pluginName) {
    return {
      success: false,
      error: "pluginName is required",
    };
  }

  const action = String(params.action || "").trim().toLowerCase();
  if (action === "status") {
    const plugin = params.context.plugins.status(pluginName);
    return plugin
      ? { success: true, plugin }
      : { success: false, error: `Unknown plugin: ${pluginName}` };
  }

  if (action === "unregister") {
    const plugin = params.context.plugins.status(pluginName) || undefined;
    const success = await params.context.plugins.unregister(pluginName);
    return success
      ? { success: true, ...(plugin ? { plugin } : {}) }
      : { success: false, error: `Unknown plugin: ${pluginName}` };
  }

  return {
    success: false,
    error: `Unsupported plugin control action: ${params.action}`,
  };
}
