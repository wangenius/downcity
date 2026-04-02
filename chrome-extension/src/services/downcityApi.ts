/**
 * Downcity API 访问层。
 *
 * 关键点（中文）：
 * - 所有 HTTP 交互统一从这里走，UI 只关注业务流程。
 * - 默认走本地 Console，也支持外部传入自定义 IP/端口地址。
 */

import type {
  ChatKeyOption,
  ConsoleUiAgentsResponse,
  TuiContextExecuteRequestBody,
  TuiContextSummary,
  TuiContextsResponse,
} from "../types/api";
import { buildAuthHeaders, shouldUseBeaconTransport, type ExtensionAuthOptions } from "./auth";
import { resolveChatKey as resolveDefaultChatKey, toChatKeyOption } from "./chatRouting";
import { resolveConsoleBaseUrl } from "./consoleBase";
import { requestJson } from "./http";

type ApiRequestOptions = ExtensionAuthOptions & {
  consoleBaseUrl?: string;
};

/**
 * 拉取 Console 可用 Agent 列表。
 */
export async function fetchAgents(
  options?: ApiRequestOptions,
): Promise<ConsoleUiAgentsResponse> {
  const url = `${resolveConsoleBaseUrl(options?.consoleBaseUrl)}/api/ui/agents`;
  const payload = await requestJson<ConsoleUiAgentsResponse>(url, {
    method: "GET",
  }, {
    authToken: options?.authToken,
  });
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent 列表失败");
  }
  return payload;
}

/**
 * 拉取指定 Agent 可用的 chatKey 列表。
 */
export async function fetchChatKeyOptions(
  agentId: string,
  options?: ApiRequestOptions,
): Promise<ChatKeyOption[]> {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return [];

  const url = `${resolveConsoleBaseUrl(options?.consoleBaseUrl)}/api/dashboard/sessions?agent=${encodeURIComponent(normalizedAgentId)}&limit=500`;
  const payload = await requestJson<TuiContextsResponse>(url, {
    method: "GET",
  }, {
    authToken: options?.authToken,
  });

  if (payload.success !== true) {
    throw new Error(payload.error || "加载 chatKey 列表失败");
  }

  const contexts = Array.isArray(payload.sessions) ? payload.sessions : [];
  const seen = new Set<string>();
  const outOptions: ChatKeyOption[] = [];

  for (const item of contexts) {
    const option = toChatKeyOption(item);
    if (!option) continue;
    if (seen.has(option.chatKey)) continue;
    seen.add(option.chatKey);
    outOptions.push(option);
  }

  return outOptions.sort((a, b) => {
    const tsA = typeof a.updatedAt === "number" ? a.updatedAt : 0;
    const tsB = typeof b.updatedAt === "number" ? b.updatedAt : 0;
    if (tsA !== tsB) return tsB - tsA;
    return b.messageCount - a.messageCount;
  });
}

/**
 * 投递 Agent 任务（异步，不等待执行完成）。
 *
 * 关键点（中文）：
 * - 优先使用 sendBeacon，支持扩展弹窗关闭后的请求续传。
 * - sendBeacon 不可用时，回退到 keepalive fetch。
 * - 只确认“请求已发起”，不等待后端执行结束。
 */
export function dispatchAgentTask(params: {
  consoleBaseUrl?: string;
  agentId: string;
  sessionId: string;
  authToken?: string;
  body: TuiContextExecuteRequestBody;
}): boolean {
  const agentId = String(params.agentId || "").trim();
  const sessionId = String(params.sessionId || "").trim();
  if (!agentId) return false;
  if (!sessionId) return false;

  const url = `${resolveConsoleBaseUrl(params.consoleBaseUrl)}/api/dashboard/sessions/${encodeURIComponent(sessionId)}/execute?agent=${encodeURIComponent(agentId)}`;
  const bodyText = JSON.stringify(params.body);

  try {
    if (
      shouldUseBeaconTransport(params.authToken) &&
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const queued = navigator.sendBeacon(
        url,
        new Blob([bodyText], { type: "text/plain;charset=UTF-8" }),
      );
      if (queued) return true;
    }

    void fetch(url, {
      method: "POST",
      headers: buildAuthHeaders({
        authToken: params.authToken,
        headers: {
          "Content-Type": "application/json",
        },
      }),
      body: bodyText,
      keepalive: true,
    }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}
