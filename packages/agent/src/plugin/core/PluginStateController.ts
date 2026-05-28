/**
 * PluginStateController：主动型 plugin 状态控制与状态记录模块。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { AgentRuntime } from "@/types/runtime/agent/AgentRuntime.js";
import type {
  Plugin,
  PluginLifecycle,
  PluginState,
  PluginStateControlAction,
  PluginStateControlResult,
  PluginStateRecord,
  PluginStateSnapshot,
} from "@/plugin/types/Plugin.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";

function nowMs(): number {
  return Date.now();
}

function resolveLifecycle(plugin: BasePlugin): PluginLifecycle | undefined {
  return plugin.lifecycle;
}

/**
 * 列出当前进程内可见的主动型 plugin 实例。
 */
export function listPluginInstances(input?: {
  context?: AgentContext;
  runtime?: AgentRuntime;
}): BasePlugin[] {
  const contextPlugins = input?.context?.agent?.pluginInstances;
  if (contextPlugins instanceof Map && contextPlugins.size > 0) {
    return [...contextPlugins.values()];
  }
  const runtimePlugins = input?.runtime?.pluginInstances;
  if (runtimePlugins instanceof Map && runtimePlugins.size > 0) {
    return [...runtimePlugins.values()];
  }
  return [];
}

/**
 * 按名称解析主动型 plugin 实例。
 */
export function resolvePluginByName(
  name: string,
  input?: {
    context?: AgentContext;
    runtime?: AgentRuntime;
  },
): BasePlugin | null {
  const key = String(name || "").trim();
  if (!key) return null;
  return listPluginInstances(input).find((plugin) => plugin.name === key) || null;
}

/**
 * 确保 plugin 对应的状态记录存在。
 */
export function ensurePluginStateRecord(
  plugin: BasePlugin,
): PluginStateRecord {
  return plugin.pluginStateRecord;
}

function hasCommandActions(plugin: BasePlugin): boolean {
  return Object.values(plugin.actions).some((action) => Boolean(action.command));
}

/**
 * 把内部 record 映射为对外快照。
 */
export function toPluginStateSnapshot(
  record: PluginStateRecord,
  plugin: BasePlugin,
): PluginStateSnapshot {
  const lifecycle = resolveLifecycle(plugin);
  return {
    name: plugin.name,
    state: record.state,
    updatedAt: record.updatedAt,
    ...(record.lastError ? { lastError: record.lastError } : {}),
    ...(record.lastCommand ? { lastCommand: record.lastCommand } : {}),
    ...(typeof record.lastCommandAt === "number"
      ? { lastCommandAt: record.lastCommandAt }
      : {}),
    supportsLifecycle: Boolean(lifecycle?.start || lifecycle?.stop),
    supportsCommand: Boolean(lifecycle?.command) || hasCommandActions(plugin),
  };
}

async function runSerialByPlugin(
  record: PluginStateRecord,
  step: () => Promise<void> | void,
): Promise<void> {
  const next = record.chain.then(() => Promise.resolve(step()));
  record.chain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
}

/**
 * 标记 plugin 当前状态。
 */
export function markPluginState(
  record: PluginStateRecord,
  state: PluginState,
  error?: string,
): void {
  record.state = state;
  record.updatedAt = nowMs();
  if (error) {
    record.lastError = error;
    return;
  }
  delete record.lastError;
}

/**
 * 标记最近一次 plugin command。
 */
export function markPluginCommand(
  record: PluginStateRecord,
  command: string,
): void {
  record.lastCommand = command;
  record.lastCommandAt = nowMs();
  record.updatedAt = nowMs();
}

/**
 * 返回静态主动型 plugin 定义清单。
 */
export function getStaticPlugins(): Plugin[] {
  return [];
}

/**
 * 返回主动型 plugin 根命令名清单。
 */
export function getPluginRootCommandNames(): string[] {
  return [];
}

/**
 * 列出全部主动型 plugin 状态快照。
 */
export function listPluginStates(input?: {
  context?: AgentContext;
  runtime?: AgentRuntime;
}): PluginStateSnapshot[] {
  return listPluginInstances(input)
    .map((plugin) =>
      toPluginStateSnapshot(ensurePluginStateRecord(plugin), plugin),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 判断指定主动型 plugin 是否处于运行中。
 */
export function isPluginRunning(
  pluginName: string,
  input?: {
    context?: AgentContext;
    runtime?: AgentRuntime;
  },
): boolean {
  const plugin = resolvePluginByName(pluginName, input);
  if (!plugin) return false;
  return ensurePluginStateRecord(plugin).state === "running";
}

async function startPluginInternal(
  plugin: BasePlugin,
  context: AgentContext,
): Promise<PluginStateControlResult> {
  const record = ensurePluginStateRecord(plugin);
  const lifecycle = resolveLifecycle(plugin);
  try {
    await runSerialByPlugin(record, async () => {
      if (record.state === "running") return;
      markPluginState(record, "starting");
      try {
        await lifecycle?.start?.(context);
        markPluginState(record, "running");
      } catch (error) {
        markPluginState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      plugin: toPluginStateSnapshot(record, plugin),
    };
  } catch (error) {
    return {
      success: false,
      plugin: toPluginStateSnapshot(record, plugin),
      error: String(error),
    };
  }
}

async function stopPluginInternal(
  plugin: BasePlugin,
  context: AgentContext,
): Promise<PluginStateControlResult> {
  const record = ensurePluginStateRecord(plugin);
  const lifecycle = resolveLifecycle(plugin);
  try {
    await runSerialByPlugin(record, async () => {
      if (record.state === "stopped") return;
      markPluginState(record, "stopping");
      try {
        await lifecycle?.stop?.(context);
        markPluginState(record, "stopped");
      } catch (error) {
        markPluginState(record, "error", String(error));
        throw error;
      }
    });
    return {
      success: true,
      plugin: toPluginStateSnapshot(record, plugin),
    };
  } catch (error) {
    return {
      success: false,
      plugin: toPluginStateSnapshot(record, plugin),
      error: String(error),
    };
  }
}

/**
 * 执行单个主动型 plugin 状态控制动作。
 */
export async function controlPluginState(params: {
  pluginName: string;
  action: PluginStateControlAction;
  context: AgentContext;
}): Promise<PluginStateControlResult> {
  const plugin = resolvePluginByName(params.pluginName, {
    context: params.context,
  });
  if (!plugin) {
    return {
      success: false,
      error: `Unknown plugin: ${params.pluginName}`,
    };
  }

  if (params.action === "status") {
    const record = ensurePluginStateRecord(plugin);
    return {
      success: true,
      plugin: toPluginStateSnapshot(record, plugin),
    };
  }

  if (params.action === "start") {
    return await startPluginInternal(plugin, params.context);
  }

  if (params.action === "stop") {
    return await stopPluginInternal(plugin, params.context);
  }

  const stopResult = await stopPluginInternal(plugin, params.context);
  if (!stopResult.success) return stopResult;
  return await startPluginInternal(plugin, params.context);
}

/**
 * 启动当前上下文中全部主动型 plugin。
 */
export async function startAllPlugins(context: AgentContext): Promise<{
  success: boolean;
  results: PluginStateControlResult[];
}> {
  const results: PluginStateControlResult[] = [];
  for (const plugin of listPluginInstances({ context })) {
    results.push(
      await controlPluginState({
        pluginName: plugin.name,
        action: "start",
        context,
      }),
    );
  }
  return {
    success: results.every((item) => item.success),
    results,
  };
}

/**
 * 停止当前上下文中全部主动型 plugin。
 */
export async function stopAllPlugins(context: AgentContext): Promise<{
  success: boolean;
  results: PluginStateControlResult[];
}> {
  const results: PluginStateControlResult[] = [];
  for (const plugin of listPluginInstances({ context })) {
    results.push(
      await controlPluginState({
        pluginName: plugin.name,
        action: "stop",
        context,
      }),
    );
  }
  return {
    success: results.every((item) => item.success),
    results,
  };
}
