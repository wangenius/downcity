/**
 * Daemon API 客户端（process 子模块）。
 *
 * 关键点（中文）
 * - 业务模块统一通过 daemon API 与运行时通信。
 * - 地址解析优先级：CLI 参数 > 环境变量 > daemon meta > 默认值。
 */

import fs from "fs-extra";
import {
  type DaemonEndpoint,
  type DaemonJsonApiCallParams,
  type DaemonJsonApiCallResult,
} from "./Api.js";
import { getDaemonMetaPath } from "@/main/daemon/Manager.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";

/**
 * 解析端口值。
 *
 * 关键点（中文）
 * - 仅接受 1~65535 的整数；非法值返回 undefined。
 */
function parsePortLike(input: string | number | undefined): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const raw =
    typeof input === "number" ? input : Number.parseInt(String(input), 10);
  if (!Number.isFinite(raw) || Number.isNaN(raw)) return undefined;
  if (!Number.isInteger(raw) || raw <= 0 || raw > 65535) return undefined;
  return raw;
}

/**
 * 归一化 host。
 *
 * 关键点（中文）
 * - `0.0.0.0`/`::` 会转换为 `127.0.0.1`，避免客户端直连通配地址失败。
 */
function normalizeHost(input: string | undefined): string | undefined {
  const host = typeof input === "string" ? input.trim() : "";
  if (!host) return undefined;
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  return host;
}

function parseErrorMessageFromPayload(data: JsonValue | null): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const payload = data as JsonObject;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  return null;
}

function pickArgValue(args: string[], key: string): string | undefined {
  const idx = args.findIndex((item) => String(item).trim() === key);
  if (idx < 0) return undefined;
  const next = String(args[idx + 1] || "").trim();
  return next || undefined;
}

/**
 * 解析 daemon endpoint。
 *
 * 优先级（中文）
 * 1) 显式入参 `host/port`
 * 2) 环境变量 `DC_SERVER_*` / `DC_CTX_SERVER_*`
 * 3) daemon meta args（`downcity.daemon.json`）
 * 4) 默认 `127.0.0.1:5314`
 */
function resolveDaemonEndpoint(params: {
  projectRoot: string;
  host?: string;
  port?: number;
}): DaemonEndpoint {
  const explicitHost = normalizeHost(params.host);
  const explicitPort = parsePortLike(params.port);

  const envHost =
    normalizeHost(process.env.DC_SERVER_HOST) ||
    normalizeHost(process.env.DC_CTX_SERVER_HOST);
  const envPort =
    parsePortLike(process.env.DC_SERVER_PORT) ||
    parsePortLike(process.env.DC_CTX_SERVER_PORT);

  let daemonArgHost: string | undefined;
  let daemonArgPort: number | undefined;
  try {
    const metaPath = getDaemonMetaPath(params.projectRoot);
    if (fs.existsSync(metaPath)) {
      const raw = fs.readJsonSync(metaPath) as { args?: unknown };
      const args = Array.isArray(raw?.args)
        ? raw.args.map((item) => String(item))
        : [];
      daemonArgHost = normalizeHost(pickArgValue(args, "--host"));
      daemonArgPort = parsePortLike(pickArgValue(args, "--port"));
    }
  } catch {
    // ignore daemon meta errors, fallback to other sources
  }

  const host = explicitHost || envHost || daemonArgHost || "127.0.0.1";
  const port = explicitPort || envPort || daemonArgPort || 5314;

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
  };
}

/**
 * 调用 daemon JSON API。
 *
 * 错误语义（中文）
 * - 网络异常：`success=false` + `error`（无 status）。
 * - HTTP 非 2xx：`success=false` + `status` + `error`。
 */
export async function callServer<T>(
  params: DaemonJsonApiCallParams,
): Promise<DaemonJsonApiCallResult<T>> {
  const endpoint = resolveDaemonEndpoint({
    projectRoot: params.projectRoot,
    host: params.host,
    port: params.port,
  });

  const url = new URL(params.path, endpoint.baseUrl).toString();
  const method = params.method || "GET";
  const hasBody = params.body !== undefined && method !== "GET";
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: hasBody ? JSON.stringify(params.body) : undefined,
    });

    let data: JsonValue | null = null;
    try {
      data = (await response.json()) as JsonValue;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const messageFromData =
        parseErrorMessageFromPayload(data) || `HTTP ${response.status}`;
      return {
        success: false,
        status: response.status,
        error: messageFromData,
      };
    }

    return {
      success: true,
      status: response.status,
      data: data as T,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to call ${url}: ${String(error)}`,
    };
  }
}
