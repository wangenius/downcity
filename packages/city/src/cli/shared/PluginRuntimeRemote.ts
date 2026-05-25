/**
 * `city plugin` 运行态远程 Agent server 调用辅助。
 *
 * 关键点（中文）
 * - 统一处理 runtime list/control/command 三类需要访问 Agent server 的命令。
 * - 这里不负责命令注册，只负责 transport 调用与结果输出。
 */

import { callAgentTransport } from "@downcity/agent";
import { printResult } from "@/utils/cli/CliOutput.js";
import type {
  PluginCliBaseOptions,
  PluginCommandResponse,
  PluginControlAction,
  PluginControlResponse,
  PluginListResponse,
} from "@downcity/agent";
import {
  parseCommandPayload,
  resolvePluginProjectRoot,
  validateAgentProjectRoot,
} from "./PluginRuntimeSupport.js";

const PLUGIN_COMMAND_TIMEOUT_MS = 120_000;

/**
 * 执行 `plugin list --runtime`。
 */
export async function runPluginRuntimeListCommand(options: PluginCliBaseOptions): Promise<void> {
  const resolved = await resolvePluginProjectRoot(options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: options.json,
      success: false,
      title: "plugin runtime list failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: options.json,
      success: false,
      title: "plugin runtime list failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<PluginListResponse>({
    projectRoot,
    path: "/api/plugins/runtime/list",
    method: "GET",
    host: options.host,
    port: options.port,
    authToken: options.token,
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "plugin runtime listed" : "plugin runtime list failed",
      payload: {
        ...(Array.isArray(remote.data.plugins) ? { plugins: remote.data.plugins } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: options.json,
    success: false,
    title: "plugin runtime list failed",
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}

/**
 * 执行 `plugin status/start/stop/restart`。
 */
export async function runPluginRuntimeControlCommand(params: {
  pluginName: string;
  action: PluginControlAction;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: `plugin ${params.action} failed`,
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: `plugin ${params.action} failed`,
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<PluginControlResponse>({
    projectRoot,
    path: "/api/plugins/runtime/control",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    authToken: params.options.token,
    body: {
      pluginName: params.pluginName,
      action: params.action,
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? `plugin ${params.action} ok` : `plugin ${params.action} failed`,
      payload: {
        ...(remote.data.plugin ? { plugin: remote.data.plugin } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: `plugin ${params.action} failed`,
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}

/**
 * 执行 `plugin command` 桥接。
 */
export async function runPluginRuntimeCommandBridge(params: {
  pluginName: string;
  command: string;
  payloadRaw?: string;
  options: PluginCliBaseOptions;
}): Promise<void> {
  const resolved = await resolvePluginProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin command failed",
      payload: {
        error: resolved.error || "Failed to resolve agent project path",
      },
    });
    return;
  }
  const projectRoot = resolved.projectRoot;
  const pathError = validateAgentProjectRoot(projectRoot);
  if (pathError) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "plugin command failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<PluginCommandResponse>({
    projectRoot,
    path: "/api/plugins/runtime/command",
    method: "POST",
    timeoutMs: PLUGIN_COMMAND_TIMEOUT_MS,
    host: params.options.host,
    port: params.options.port,
    authToken: params.options.token,
    body: {
      pluginName: params.pluginName,
      command: params.command,
      ...(params.payloadRaw !== undefined
        ? { payload: parseCommandPayload(params.payloadRaw) }
        : {}),
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "plugin command ok" : "plugin command failed",
      payload: {
        ...(remote.data.plugin ? { plugin: remote.data.plugin } : {}),
        ...(remote.data.message ? { message: remote.data.message } : {}),
        ...(remote.data.data !== undefined ? { data: remote.data.data } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: "plugin command failed",
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}
