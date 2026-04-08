/**
 * `city service` 远程 Agent server 调用辅助。
 *
 * 关键点（中文）
 * - 统一处理 list/control/command 三类需要访问 Agent server 的命令。
 * - 这里不负责命令注册，只负责 transport 调用与结果输出。
 */

import { callAgentTransport } from "@/main/modules/rpc/Transport.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import type {
  ServiceCliBaseOptions,
  ServiceCommandResponse,
  ServiceControlAction,
  ServiceControlResponse,
  ServiceListResponse,
} from "@/shared/types/Services.js";
import {
  parseCommandPayload,
  resolveServiceProjectRoot,
  validateAgentProjectRoot,
} from "./ServiceCommandSupport.js";

const SERVICE_COMMAND_TIMEOUT_MS = 120_000;

/**
 * 执行 `service list`。
 */
export async function runServiceListCommand(options: ServiceCliBaseOptions): Promise<void> {
  const resolved = await resolveServiceProjectRoot(options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: options.json,
      success: false,
      title: "service list failed",
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
      title: "service list failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<ServiceListResponse>({
    projectRoot,
    path: "/api/services/list",
    method: "GET",
    host: options.host,
    port: options.port,
    authToken: options.token,
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? "services listed" : "service list failed",
      payload: {
        ...(Array.isArray(remote.data.services) ? { services: remote.data.services } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: options.json,
    success: false,
    title: "service list failed",
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}

/**
 * 执行 `service status/start/stop/restart`。
 */
export async function runServiceControlCommand(params: {
  serviceName: string;
  action: ServiceControlAction;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveServiceProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: `service ${params.action} failed`,
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
      title: `service ${params.action} failed`,
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<ServiceControlResponse>({
    projectRoot,
    path: "/api/services/control",
    method: "POST",
    host: params.options.host,
    port: params.options.port,
    authToken: params.options.token,
    body: {
      serviceName: params.serviceName,
      action: params.action,
    },
  });

  if (remote.success && remote.data) {
    printResult({
      asJson: params.options.json,
      success: Boolean(remote.data.success),
      title: remote.data.success ? `service ${params.action} ok` : `service ${params.action} failed`,
      payload: {
        ...(remote.data.service ? { service: remote.data.service } : {}),
        ...(remote.data.error ? { error: remote.data.error } : {}),
      },
    });
    return;
  }

  printResult({
    asJson: params.options.json,
    success: false,
    title: `service ${params.action} failed`,
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}

/**
 * 执行 `service command` 桥接。
 */
export async function runServiceCommandBridge(params: {
  serviceName: string;
  command: string;
  payloadRaw?: string;
  options: ServiceCliBaseOptions;
}): Promise<void> {
  const resolved = await resolveServiceProjectRoot(params.options);
  if (!resolved.projectRoot) {
    printResult({
      asJson: params.options.json,
      success: false,
      title: "service command failed",
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
      title: "service command failed",
      payload: {
        error: pathError,
      },
    });
    return;
  }
  const remote = await callAgentTransport<ServiceCommandResponse>({
    projectRoot,
    path: "/api/services/command",
    method: "POST",
    timeoutMs: SERVICE_COMMAND_TIMEOUT_MS,
    host: params.options.host,
    port: params.options.port,
    authToken: params.options.token,
    body: {
      serviceName: params.serviceName,
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
      title: remote.data.success ? "service command ok" : "service command failed",
      payload: {
        ...(remote.data.service ? { service: remote.data.service } : {}),
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
    title: "service command failed",
    payload: {
      error: remote.error || "Unknown error",
    },
  });
}
