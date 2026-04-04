/**
 * Plugin 本地命令执行器。
 *
 * 关键点（中文）
 * - plugin 本质上是一些本地 CLI 命令，这里只负责为命令准备最小上下文并直接执行。
 * - 不依赖 agent daemon，不伪造 session / service / agent runtime。
 * - 真正需要完整 runtime 的场景，仍由 agent 内部自行复用同一批 plugin 定义。
 */

import path from "node:path";
import { logger as defaultLogger } from "@shared/utils/logger/Logger.js";
import { loadAgentEnvSnapshot, loadDowncityConfig, loadGlobalEnvFromStore } from "@/city/runtime/env/Config.js";
import { isPluginEnabledInConfig } from "@/city/plugin/Activation.js";
import { findBuiltinPlugin, listStaticPluginViews } from "@/city/plugin/Catalog.js";
import {
  createAgentAuthRuntime,
  createAgentPathRuntime,
  createAgentPluginConfigRuntime,
} from "@/city/runtime/console/AgentHostRuntime.js";
import type { JsonValue } from "@/shared/types/Json.js";
import type {
  PluginActionResult,
  PluginAvailability,
  PluginCommandContext,
  PluginView,
} from "@/shared/types/Plugin.js";

/**
 * 创建本地 plugin 命令上下文。
 */
export function createLocalPluginCommandContext(projectRoot: string): PluginCommandContext {
  const rootPath = path.resolve(String(projectRoot || "").trim() || ".");
  const globalEnv = loadGlobalEnvFromStore();
  const env = loadAgentEnvSnapshot(rootPath);
  const config = loadDowncityConfig(rootPath, {
    projectEnv: env,
    globalEnv,
  });

  defaultLogger.bindProjectRoot(rootPath);

  return {
    cwd: rootPath,
    rootPath,
    logger: defaultLogger,
    config,
    env,
    globalEnv,
    paths: createAgentPathRuntime(rootPath),
    auth: createAgentAuthRuntime(),
    pluginConfig: createAgentPluginConfigRuntime(rootPath),
  };
}

/**
 * 列出本地内建 plugin 视图。
 */
export function listLocalPlugins(): PluginView[] {
  return listStaticPluginViews();
}

/**
 * 读取本地 plugin availability。
 */
export async function getLocalPluginAvailability(
  projectRoot: string,
  pluginName: string,
): Promise<PluginAvailability> {
  const plugin = findBuiltinPlugin(pluginName);
  if (!plugin) {
    return {
      enabled: false,
      available: false,
      reasons: [`Unknown plugin: ${pluginName}`],
    };
  }

  const context = createLocalPluginCommandContext(projectRoot);
  if (plugin.availability) {
    return await plugin.availability(context);
  }

  const enabled = isPluginEnabledInConfig({
    plugin,
    config: context.config,
  });
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      reasons: [`Plugin "${plugin.name}" is disabled`],
    };
  }

  return {
    enabled: true,
    available: true,
    reasons: [],
  };
}

/**
 * 直接执行本地 plugin action。
 */
export async function runLocalPluginAction(params: {
  projectRoot: string;
  pluginName: string;
  actionName: string;
  payload?: JsonValue;
}): Promise<PluginActionResult<JsonValue>> {
  const plugin = findBuiltinPlugin(params.pluginName);
  if (!plugin) {
    return {
      success: false,
      error: `Unknown plugin: ${params.pluginName}`,
      message: `Unknown plugin: ${params.pluginName}`,
    };
  }

  const actionName = String(params.actionName || "").trim();
  if (!actionName) {
    return {
      success: false,
      error: "action is required",
      message: "action is required",
    };
  }

  const action = plugin.actions?.[actionName];
  if (!action) {
    return {
      success: false,
      error: `Plugin "${plugin.name}" does not implement action "${actionName}"`,
      message: `Plugin "${plugin.name}" does not implement action "${actionName}"`,
    };
  }

  const context = createLocalPluginCommandContext(params.projectRoot);
  const enabled = isPluginEnabledInConfig({
    plugin,
    config: context.config,
  });
  if (!enabled && action.allowWhenDisabled !== true) {
    return {
      success: false,
      error: `Plugin "${plugin.name}" is disabled`,
      message: `Plugin "${plugin.name}" is disabled`,
    };
  }

  try {
    return await action.execute({
      context,
      payload: (params.payload ?? {}) as JsonValue,
      pluginName: plugin.name,
      actionName,
    });
  } catch (error) {
    return {
      success: false,
      error: String(error),
      message: String(error),
    };
  }
}
