/**
 * Agent SDK Session API 访问层。
 *
 * 关键点（中文）：
 * - Chrome 扩展的原生对话走 Agent HTTP gateway 的 `/api/sdk/*`。
 * - 这里不复用 ChatPlugin / Console Dashboard 语义，避免普通 Agent Session 被 IM 路由过滤。
 * - Session id 生成保持稳定，确保 Side Panel 关闭再打开仍回到同一条浏览器会话。
 */

import type {
  AgentSdkHistoryItem,
  AgentSdkHistoryResponse,
  AgentSdkPromptResponse,
  AgentSdkSessionEvent,
  AgentSdkSessionInfo,
  AgentSdkSessionResponse,
  AgentSdkSessionsResponse,
} from "../types/api";
import { type ExtensionAuthOptions } from "./auth";
import { buildAuthHeaders } from "./auth";
import { resolveConsoleBaseUrl } from "./consoleBase";
import { requestJson } from "./http";

type ApiRequestOptions = ExtensionAuthOptions & {
  /**
   * Agent gateway 基础地址。
   */
  serverBaseUrl?: string;
};

/**
 * 生成稳定的浏览器会话 id。
 */
export function buildDefaultAgentSessionId(params: {
  /**
   * 当前连接 id。
   */
  connectionId: string;
  /**
   * 当前 Agent id。
   */
  agentId: string;
}): string {
  const source = `${String(params.connectionId || "").trim()}::${String(params.agentId || "").trim()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const suffix = (hash >>> 0).toString(36).padStart(7, "0").slice(0, 10);
  return `chrome-extension-${suffix}`;
}

/**
 * 解析最终使用的 Agent SDK session id。
 */
export function resolveAgentSessionId(params: {
  /**
   * 显式保存的 session id。
   */
  preferredSessionId?: string;
  /**
   * 当前连接 id。
   */
  connectionId: string;
  /**
   * 当前 Agent id。
   */
  agentId: string;
}): string {
  const preferred = String(params.preferredSessionId || "").trim();
  if (preferred) return preferred;
  return buildDefaultAgentSessionId({
    connectionId: params.connectionId,
    agentId: params.agentId,
  });
}

/**
 * 确保 Agent SDK session 存在。
 */
export async function ensureAgentSdkSession(params: {
  /**
   * Agent gateway 基础地址。
   */
  serverBaseUrl?: string;
  /**
   * 目标 session id。
   */
  sessionId: string;
  /**
   * Bearer Token。
   */
  authToken?: string;
}): Promise<AgentSdkSessionInfo> {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) throw new Error("缺少 Agent Session");

  const url = `${resolveConsoleBaseUrl(params.serverBaseUrl)}/api/sdk/sessions`;
  const payload = await requestJson<AgentSdkSessionResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
    {
      authToken: params.authToken,
    },
  );

  if (payload.success !== true || !payload.session) {
    throw new Error(payload.error || "创建 Agent Session 失败");
  }
  return payload.session;
}

/**
 * 拉取 Agent SDK session 列表。
 */
export async function fetchAgentSdkSessions(
  options?: ApiRequestOptions,
): Promise<AgentSdkSessionInfo[]> {
  const url = `${resolveConsoleBaseUrl(options?.serverBaseUrl)}/api/sdk/sessions?limit=200`;
  const payload = await requestJson<AgentSdkSessionsResponse>(
    url,
    { method: "GET" },
    { authToken: options?.authToken },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent Session 失败");
  }
  return Array.isArray(payload.page?.items)
    ? payload.page.items
    : Array.isArray(payload.sessions)
      ? payload.sessions
      : [];
}

/**
 * 向 Agent SDK session 发送用户输入。
 */
export async function promptAgentSdkSession(params: {
  /**
   * Agent gateway 基础地址。
   */
  serverBaseUrl?: string;
  /**
   * 目标 session id。
   */
  sessionId: string;
  /**
   * Bearer Token。
   */
  authToken?: string;
  /**
   * 用户输入。
   */
  query: string;
}): Promise<string> {
  const sessionId = String(params.sessionId || "").trim();
  const query = String(params.query || "").trim();
  if (!sessionId) throw new Error("缺少 Agent Session");
  if (!query) throw new Error("输入不能为空");

  const url = `${resolveConsoleBaseUrl(params.serverBaseUrl)}/api/sdk/sessions/${encodeURIComponent(sessionId)}/prompt`;
  const payload = await requestJson<AgentSdkPromptResponse>(
    url,
    {
      method: "POST",
      body: JSON.stringify({ query }),
    },
    {
      authToken: params.authToken,
    },
  );
  if (payload.success !== true || !payload.turn?.id) {
    throw new Error(payload.error || "发送到 Agent Session 失败");
  }
  return payload.turn.id;
}

/**
 * 读取 Agent SDK session 的消息历史。
 */
export async function fetchAgentSdkHistory(params: {
  /**
   * Agent gateway 基础地址。
   */
  serverBaseUrl?: string;
  /**
   * 目标 session id。
   */
  sessionId: string;
  /**
   * Bearer Token。
   */
  authToken?: string;
  /**
   * 消息数量上限。
   */
  limit?: number;
}): Promise<AgentSdkHistoryItem[]> {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) return [];
  const limit = Number.isFinite(params.limit) ? Number(params.limit) : 80;
  const url = `${resolveConsoleBaseUrl(params.serverBaseUrl)}/api/sdk/sessions/${encodeURIComponent(sessionId)}/history?view=message&order=asc&limit=${encodeURIComponent(String(limit))}`;
  const payload = await requestJson<AgentSdkHistoryResponse>(
    url,
    { method: "GET" },
    { authToken: params.authToken },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent Session 历史失败");
  }
  return Array.isArray(payload.history?.items) ? payload.history.items : [];
}

/**
 * 订阅 Agent SDK session NDJSON 事件。
 */
export async function subscribeAgentSdkSessionEvents(params: {
  /**
   * Agent gateway 基础地址。
   */
  serverBaseUrl?: string;
  /**
   * 目标 session id。
   */
  sessionId: string;
  /**
   * Bearer Token。
   */
  authToken?: string;
  /**
   * 收到事件时回调。
   */
  onEvent: (event: AgentSdkSessionEvent) => void;
  /**
   * 连接出错时回调。
   */
  onError?: (error: Error) => void;
}): Promise<() => void> {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) throw new Error("缺少 Agent Session");

  const controller = new AbortController();
  const url = `${resolveConsoleBaseUrl(params.serverBaseUrl)}/api/sdk/sessions/${encodeURIComponent(sessionId)}/events`;

  void (async () => {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: buildAuthHeaders({
          authToken: params.authToken,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`事件连接失败：HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as AgentSdkSessionEvent;
          if (event.type === "sdk-events-ready") continue;
          params.onEvent(event);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      params.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  })();

  return () => controller.abort();
}
