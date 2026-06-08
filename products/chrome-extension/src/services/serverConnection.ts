/**
 * Server Connection 工具。
 *
 * 关键点（中文）：
 * - 统一处理连接选择、当前连接解析、host/port 命名和默认路由读取。
 * - 避免 popup / options / API 层重复拼装连接上下文。
 */

import type {
  ConsoleUiAgentOption,
} from "../types/api";
import type {
  ExtensionServerConnection,
  ExtensionConnectionRoutePreference,
  ExtensionSettings,
} from "../types/extension";
import { buildConsoleBaseUrl } from "./consoleBase";

/**
 * 生成连接标签。
 */
export function formatServerConnectionLabel(
  connection: ExtensionServerConnection,
): string {
  const name = String(connection.name || "").trim();
  const endpoint = `${connection.protocol}://${connection.host}:${connection.port}${connection.basePath || ""}`;
  if (!name || name === endpoint) return endpoint;
  return `${name} · ${endpoint}`;
}

/**
 * 生成连接对应的 Server Base URL。
 */
export function buildServerConnectionBaseUrl(
  connection: ExtensionServerConnection,
): string {
  return buildConsoleBaseUrl({
    protocol: connection.protocol,
    host: connection.host,
    port: connection.port,
    basePath: connection.basePath,
  });
}

/**
 * 解析 Agent runtime base URL。
 *
 * 说明（中文）：
 * - Server Connection 指向 Town / Console 聚合入口。
 * - `/api/sdk/*` 属于单个 Agent HTTP gateway，必须优先使用 `/api/ui/agents` 返回的 `agent.baseUrl`。
 * - 只有后端未返回 runtime 地址时，才回退到当前 Server Connection，便于兼容单 Agent 直连场景。
 */
export function resolveAgentRuntimeBaseUrl(params: {
  /**
   * 当前选中的 Agent。
   */
  agent?: ConsoleUiAgentOption | null;
  /**
   * 回退地址。
   */
  fallbackBaseUrl: string;
}): string {
  const explicit = String(params.agent?.baseUrl || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const host = String(params.agent?.host || "").trim();
  const port = params.agent?.port;
  if (host && typeof port === "number" && Number.isFinite(port)) {
    return `http://${host}:${Math.trunc(port)}`;
  }

  return String(params.fallbackBaseUrl || "").trim().replace(/\/+$/, "");
}

/**
 * 解析当前选中的连接。
 */
export function resolveSelectedConnection(
  settings: ExtensionSettings,
): ExtensionServerConnection | null {
  const selectedId = String(settings.selectedConnectionId || "").trim();
  const list = Array.isArray(settings.connections) ? settings.connections : [];
  if (selectedId) {
    const matched = list.find((item) => item.id === selectedId);
    if (matched) return matched;
  }
  return list[0] || null;
}

/**
 * 读取指定连接的默认路由偏好。
 */
export function resolveRoutePreference(params: {
  settings: ExtensionSettings;
  connectionId: string;
}): ExtensionConnectionRoutePreference {
  const connectionId = String(params.connectionId || "").trim();
  const routePreferences =
    params.settings.routePreferences && typeof params.settings.routePreferences === "object"
      ? params.settings.routePreferences
      : {};
  const preference =
    (routePreferences as Record<string, ExtensionConnectionRoutePreference | undefined>)[
      connectionId
    ] || null;
  return {
    targetMode:
      String(preference?.targetMode || "").trim() === "im_forward"
        ? "im_forward"
        : "agent_session",
    agentId: String(preference?.agentId || "").trim(),
    sessionId: String(preference?.sessionId || "").trim(),
    agentSessionId: String(preference?.agentSessionId || "").trim(),
  };
}
