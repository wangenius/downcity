/**
 * 本地/远程 transport 选择器。
 *
 * 关键点（中文）
 * - 本地受信任调用默认优先使用 IPC。
 * - 只有显式传入 `host/port` 时，才视为外部 HTTP 调用。
 * - 当前返回结构与 `callServer()` 保持一致，方便命令层复用。
 */

import type { DaemonJsonApiCallParams, DaemonJsonApiCallResult } from "@/main/daemon/Api.js";
import { callServer } from "@/main/daemon/Client.js";
import { callLocalServer } from "./Client.js";

/**
 * 判断是否应强制使用 HTTP transport。
 */
export function shouldUseHttpTransport(params: {
  host?: string;
  port?: number;
}): boolean {
  return Boolean(
    (typeof params.host === "string" && params.host.trim()) ||
    typeof params.port === "number",
  );
}

/**
 * 判断 transport 错误是否等价于“本地 agent 未运行”。
 *
 * 关键点（中文）
 * - IPC 端点不存在、拒绝连接、超时、无响应，都归类为 runtime 不可用。
 * - 命令层应把这类底层错误收敛成“请先启动 agent”的业务提示。
 */
export function isAgentTransportUnavailableError(error: string | undefined): boolean {
  const text = String(error || "").trim();
  if (!text) return false;
  return (
    text.startsWith("Local RPC unavailable at ") ||
    text.startsWith("Local RPC timed out after ") ||
    text.startsWith("Local RPC closed without response ")
  );
}

/**
 * 优先返回用户可读的 transport 错误。
 */
export function resolveAgentTransportErrorMessage(params: {
  error: string | undefined;
  fallback: string;
}): string {
  if (isAgentTransportUnavailableError(params.error)) {
    return params.fallback;
  }
  return params.error || params.fallback;
}

/**
 * 统一调用 agent transport。
 */
export async function callAgentTransport<T>(
  params: DaemonJsonApiCallParams,
): Promise<DaemonJsonApiCallResult<T>> {
  if (shouldUseHttpTransport({
    host: params.host,
    port: params.port,
  })) {
    return await callServer<T>(params);
  }
  return await callLocalServer<T>(params);
}
