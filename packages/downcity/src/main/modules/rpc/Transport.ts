/**
 * 本地/远程 transport 选择器。
 *
 * 关键点（中文）
 * - 本地受信任调用默认优先使用 IPC。
 * - 只有显式传入 `host/port` 时，才视为外部 HTTP 调用。
 * - 当前返回结构与 `callServer()` 保持一致，方便命令层复用。
 */

import type { DaemonJsonApiCallParams, DaemonJsonApiCallResult } from "@/main/city/daemon/Api.js";
import { callServer } from "@/main/city/daemon/Client.js";
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
