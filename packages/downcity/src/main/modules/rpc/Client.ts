/**
 * Local RPC 客户端。
 *
 * 关键点（中文）
 * - 只用于本机受信任 IPC，不附加 HTTP Bearer 鉴权。
 * - 返回结构与 HTTP `callServer()` 对齐，便于上层透明切换 transport。
 */

import net from "node:net";
import { nanoid } from "nanoid";
import type { DaemonJsonApiCallParams, DaemonJsonApiCallResult } from "@/main/city/daemon/Api.js";
import type { LocalRpcRequest, LocalRpcResponse } from "@/shared/types/LocalRpc.js";
import { getLocalRpcEndpoint } from "./Paths.js";

const LOCAL_RPC_TIMEOUT_MS = 5_000;

function toLocalRpcRequest(params: DaemonJsonApiCallParams): LocalRpcRequest {
  return {
    requestId: nanoid(),
    path: String(params.path || "").trim(),
    method: params.method || "GET",
    ...(params.body !== undefined ? { body: params.body } : {}),
  };
}

/**
 * 通过本地 IPC 调用 agent runtime。
 */
export async function callLocalServer<T>(
  params: DaemonJsonApiCallParams,
): Promise<DaemonJsonApiCallResult<T>> {
  const endpoint = getLocalRpcEndpoint(params.projectRoot);
  const request = toLocalRpcRequest(params);

  return await new Promise<DaemonJsonApiCallResult<T>>((resolve) => {
    const socket = net.createConnection(endpoint);
    let settled = false;
    let buffered = "";

    const finish = (result: DaemonJsonApiCallResult<T>): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(LOCAL_RPC_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffered += String(chunk || "");
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex < 0) return;
      const raw = buffered.slice(0, newlineIndex).trim();
      if (!raw) {
        finish({
          success: false,
          error: `Local RPC returned empty payload from ${endpoint}`,
        });
        return;
      }
      try {
        const response = JSON.parse(raw) as LocalRpcResponse;
        finish({
          success: response.success,
          status: response.status,
          ...(response.data !== undefined ? { data: response.data as T } : {}),
          ...(response.error ? { error: response.error } : {}),
        });
      } catch (error) {
        finish({
          success: false,
          error: `Local RPC returned invalid JSON from ${endpoint}: ${String(error)}`,
        });
      }
    });

    socket.on("timeout", () => {
      finish({
        success: false,
        error: `Local RPC timed out after ${LOCAL_RPC_TIMEOUT_MS}ms (${endpoint})`,
      });
    });

    socket.on("error", (error) => {
      finish({
        success: false,
        error: `Local RPC unavailable at ${endpoint}: ${String(error)}`,
      });
    });

    socket.on("end", () => {
      if (settled) return;
      finish({
        success: false,
        error: `Local RPC closed without response (${endpoint})`,
      });
    });
  });
}
