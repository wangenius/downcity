/**
 * LocalRpc：本地 IPC 调用协议类型。
 *
 * 关键点（中文）
 * - 仅用于本机受信任进程之间的调用，不承担外部 HTTP 鉴权职责。
 * - 当前协议采用“一连接一请求一响应”的 JSON 行格式，便于调试与逐步演进。
 */

import type { JsonValue } from "@/shared/types/Json.js";
import type { DaemonHttpMethod } from "@/city/runtime/daemon/Api.js";

/**
 * 单次本地 RPC 请求。
 */
export interface LocalRpcRequest {
  /**
   * 请求唯一标识。
   */
  requestId: string;
  /**
   * 目标 API 路径。
   */
  path: string;
  /**
   * 调用方法。
   */
  method: DaemonHttpMethod;
  /**
   * 可选结构化请求体。
   */
  body?: JsonValue;
}

/**
 * 单次本地 RPC 响应。
 */
export interface LocalRpcResponse {
  /**
   * 对应请求标识。
   */
  requestId: string;
  /**
   * HTTP 风格状态码。
   */
  status: number;
  /**
   * 调用是否成功。
   */
  success: boolean;
  /**
   * 成功时的数据。
   */
  data?: JsonValue;
  /**
   * 失败时的错误信息。
   */
  error?: string;
}

/**
 * 本地 RPC server 句柄。
 */
export interface LocalRpcServerHandle {
  /**
   * 当前绑定的 socket/pipe 地址。
   */
  endpoint: string;
  /**
   * 停止本地 RPC server。
   */
  stop(): Promise<void>;
}
