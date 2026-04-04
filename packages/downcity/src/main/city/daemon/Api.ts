/**
 * Daemon API 协议类型模块。
 *
 * 关键点（中文）
 * - 这里描述的是 CLI 与 agent daemon 之间的远程访问契约，不包含具体 HTTP 实现。
 * - service 等上层模块只依赖这些协议类型，不需要感知 city/daemon 的内部实现细节。
 * - 该文件属于 `main/city/daemon/*` 的协议边界，而不是通用 HTTP 类型目录。
 */

import type { JsonValue } from "@/shared/types/Json.js";

/**
 * Daemon 服务端点。
 */
export type DaemonEndpoint = {
  host: string;
  port: number;
  baseUrl: string;
};

/**
 * Daemon HTTP 方法白名单。
 */
export type DaemonHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * JSON API 调用参数。
 *
 * 关键点（中文）
 * - `projectRoot` 用于解析 downcity.json 与默认 endpoint。
 * - `host/port` 可显式覆盖自动解析结果。
 */
export type DaemonJsonApiCallParams = {
  projectRoot: string;
  path: string;
  method?: DaemonHttpMethod;
  body?: JsonValue;
  host?: string;
  port?: number;
  authToken?: string;
};

/**
 * JSON API 通用返回结构。
 *
 * 语义（中文）
 * - `success=true` 时读取 `data`。
 * - `success=false` 时读取 `error`（可选 `status`）。
 */
export type DaemonJsonApiCallResult<T> = {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
};
