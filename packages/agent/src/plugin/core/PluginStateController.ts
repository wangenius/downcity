/**
 * Plugin 注册状态控制模块。
 *
 * 关键点（中文）
 * - 新模型中 plugin 只有注册 / 卸载，不再暴露 start / stop / restart。
 * - 控制动作与类型协议保持一致，只支持状态查询和卸载。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type {
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateSnapshot,
} from "@/plugin/types/Plugin.js";

/**
 * 列出当前 Agent 已注册 plugin 快照。
 */
export function listPluginStates(input?: {
  context?: AgentContext;
}): PluginStateSnapshot[] {
  return input?.context?.plugins.snapshots() || [];
}

/**
 * 判断指定 plugin 是否已注册且 ready。
 */
export function isPluginRunning(
  pluginName: string,
  input?: {
    context?: AgentContext;
  },
): boolean {
  return input?.context?.plugins.status(pluginName)?.status === "ready";
}

/**
 * 执行 plugin 控制动作。
 */
export async function controlPluginState(params: {
  pluginName: string;
  action: PluginStateControlAction;
  context: AgentContext;
}): Promise<PluginStateControlResult> {
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

/**
 * 启动当前上下文中全部已挂载 plugin。
 */
export async function startAllPlugins(context: AgentContext): Promise<{
  success: boolean;
  results: PluginStateControlResult[];
}> {
  const snapshots = await context.plugins.startAll();
  return {
    success: snapshots.every((item) => item.status === "ready"),
    results: snapshots.map((plugin) => ({
      success: plugin.status === "ready",
      plugin,
      ...(plugin.last_error ? { error: plugin.last_error } : {}),
    })),
  };
}

/**
 * 卸载当前上下文中全部 plugin。
 */
export async function stopAllPlugins(context: AgentContext): Promise<{
  success: boolean;
  results: PluginStateControlResult[];
}> {
  const snapshots = context.plugins.snapshots();
  await context.plugins.unregisterAll();
  return {
    success: true,
    results: snapshots.map((plugin) => ({
      success: true,
      plugin,
    })),
  };
}
