/**
 * PluginActionRunner：主动型 plugin action/command 执行模块。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { BasePlugin } from "@/plugin/core/BasePlugin.js";
import type {
  PluginAction,
  PluginActionResult,
  PluginCommandResult,
  PluginStateControlAction,
  PluginStateSnapshot,
} from "@/plugin/types/Plugin.js";
import type { PluginCommandScheduleInput } from "@/plugin/types/PluginSchedule.js";
import type { JsonValue } from "@/types/common/Json.js";
import { PluginScheduleStore } from "@/plugin/core/schedule/Store.js";
import { normalizeRunAtMsOrThrow } from "@/plugin/core/schedule/Time.js";
import {
  controlPluginState,
  ensurePluginStateRecord,
  markPluginCommand,
  markPluginState,
  resolvePluginByName,
  toPluginStateSnapshot,
} from "@/plugin/core/PluginStateController.js";

function resolveLifecycle(plugin: BasePlugin) {
  return plugin.lifecycle;
}

/**
 * 按名称解析主动型 plugin action。
 */
export function resolvePluginAction(
  plugin: BasePlugin,
  actionName: string,
): PluginAction<JsonValue, JsonValue> | null {
  const key = String(actionName || "").trim();
  if (!key) return null;
  return plugin.actions[key] || null;
}

/**
 * 执行一个主动型 plugin action。
 */
export async function invokePluginAction(params: {
  plugin: BasePlugin;
  actionName: string;
  payload?: JsonValue;
  context: AgentContext;
}): Promise<PluginActionResult<JsonValue>> {
  const action = resolvePluginAction(params.plugin, params.actionName);
  if (!action) {
    return {
      success: false,
      error: `Plugin "${params.plugin.name}" does not implement action "${params.actionName}"`,
    };
  }

  try {
    return await action.execute({
      context: params.context,
      payload: (params.payload ?? {}) as JsonValue,
      pluginName: params.plugin.name,
      actionName: params.actionName,
    });
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}

function toControlCommandAction(
  command: string,
): PluginStateControlAction | null {
  if (
    command === "status" ||
    command === "start" ||
    command === "stop" ||
    command === "restart"
  ) {
    return command;
  }
  return null;
}

async function schedulePluginAction(params: {
  plugin: BasePlugin;
  command: string;
  payload?: JsonValue;
  schedule: JsonValue | PluginCommandScheduleInput;
  recordSnapshot: PluginStateSnapshot;
  context: AgentContext;
}): Promise<PluginCommandResult & { plugin?: PluginStateSnapshot }> {
  try {
    const scheduleInput = params.schedule as Partial<PluginCommandScheduleInput>;
    const runAtMs = normalizeRunAtMsOrThrow(
      scheduleInput.runAtMs,
      "schedule.runAtMs",
    );
    const store = new PluginScheduleStore(params.context.rootPath);
    try {
      const job = store.createJob({
        pluginName: params.plugin.name,
        actionName: params.command,
        payload: params.payload ?? null,
        runAtMs,
      });
      return {
        success: true,
        plugin: params.recordSnapshot,
        data: {
          scheduled: true,
          jobId: job.id,
          runAtMs: job.runAtMs,
          status: job.status,
        },
      };
    } finally {
      store.close();
    }
  } catch (error) {
    return {
      success: false,
      plugin: params.recordSnapshot,
      message: String(error),
    };
  }
}

/**
 * 统一执行主动型 plugin command。
 */
export async function runPluginCommand(params: {
  pluginName: string;
  command: string;
  payload?: JsonValue;
  schedule?: JsonValue | PluginCommandScheduleInput;
  context: AgentContext;
}): Promise<PluginCommandResult & { plugin?: PluginStateSnapshot }> {
  const plugin = resolvePluginByName(params.pluginName, {
    context: params.context,
  });
  if (!plugin) {
    return {
      success: false,
      message: `Unknown plugin: ${params.pluginName}`,
    };
  }

  const record = ensurePluginStateRecord(plugin);
  const command = String(params.command || "")
    .trim()
    .toLowerCase();
  if (!command) {
    return {
      success: false,
      plugin: toPluginStateSnapshot(record, plugin),
      message: "command is required",
    };
  }

  markPluginCommand(record, command);

  const action = resolvePluginAction(plugin, command);
  if (params.schedule !== undefined && params.schedule !== null) {
    if (!action) {
      return {
        success: false,
        plugin: toPluginStateSnapshot(record, plugin),
        message: `Scheduling only supports plugin actions. "${plugin.name}.${command}" is not a schedulable action.`,
      };
    }

    return await schedulePluginAction({
      plugin,
      command,
      payload: params.payload,
      schedule: params.schedule,
      recordSnapshot: toPluginStateSnapshot(record, plugin),
      context: params.context,
    });
  }

  if (action) {
    if (record.state !== "running") {
      return {
        success: false,
        plugin: toPluginStateSnapshot(record, plugin),
        message: `Plugin "${plugin.name}" is not running`,
      };
    }

    const result = await invokePluginAction({
      plugin,
      actionName: command,
      payload: params.payload,
      context: params.context,
    });

    if (!result.success) {
      return {
        success: false,
        plugin: toPluginStateSnapshot(record, plugin),
        message: result.error || "plugin action failed",
      };
    }

    return {
      success: true,
      plugin: toPluginStateSnapshot(record, plugin),
      ...(result.data !== undefined ? { data: result.data } : {}),
    };
  }

  const controlAction = toControlCommandAction(command);
  if (controlAction) {
    const result = await controlPluginState({
      pluginName: plugin.name,
      action: controlAction,
      context: params.context,
    });
    return {
      success: result.success,
      ...(result.plugin ? { plugin: result.plugin } : {}),
      ...(result.error ? { message: result.error } : {}),
    };
  }

  if (record.state !== "running") {
    return {
      success: false,
      plugin: toPluginStateSnapshot(record, plugin),
      message: `Plugin "${plugin.name}" is not running`,
    };
  }

  const handler = resolveLifecycle(plugin)?.command;
  if (handler) {
    try {
      const result = await handler({
        context: params.context,
        command,
        payload: params.payload,
      });
      return {
        ...result,
        plugin: toPluginStateSnapshot(record, plugin),
      };
    } catch (error) {
      markPluginState(record, "error", String(error));
      return {
        success: false,
        plugin: toPluginStateSnapshot(record, plugin),
        message: String(error),
      };
    }
  }

  return {
    success: false,
    plugin: toPluginStateSnapshot(record, plugin),
    message: `Plugin "${plugin.name}" does not implement command "${command}"`,
  };
}
