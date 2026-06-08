/**
 * Downcity Server API 访问层。
 *
 * 关键点（中文）：
 * - 所有 HTTP 交互统一从这里走，UI 只关注业务流程。
 * - 默认走本地 Server，也支持外部传入自定义 IP/端口地址。
 * - 当前只保留设置页与 Popup 需要的 Agent / Session 拉取能力和任务投递能力。
 */

import type {
  ConsoleUiAgentsResponse,
  ConsoleModelOption,
  ConsoleModelPoolResponse,
  GenericApiResponse,
  SessionOption,
  TuiContextExecuteRequestBody,
  TuiContextsResponse,
} from "../types/api";
import { type ExtensionAuthOptions } from "./auth";
import { toSessionOption } from "./chatRouting";
import { resolveConsoleBaseUrl } from "./consoleBase";
import { requestJson } from "./http";

type ApiRequestOptions = ExtensionAuthOptions & {
  serverBaseUrl?: string;
};

/**
 * 判断错误是否表示聚合 Agent 列表接口不存在。
 */
function isRouteNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /HTTP\s+404|404\s+Not Found|not found/i.test(message);
}

/**
 * 构造单 Agent gateway 的本地 Agent 选项。
 */
function buildSingleGatewayAgent(baseUrl: string): ConsoleUiAgentsResponse {
  const normalizedBaseUrl = resolveConsoleBaseUrl(baseUrl);
  return {
    success: true,
    selectedAgentId: "single-agent-gateway",
    agents: [
      {
        id: "single-agent-gateway",
        name: "Local Agent",
        projectRoot: "",
        running: true,
        baseUrl: normalizedBaseUrl,
      },
    ],
  };
}

/**
 * 拉取 Server 可用 Agent 列表。
 */
export async function fetchAgents(
  options?: ApiRequestOptions,
): Promise<ConsoleUiAgentsResponse> {
  const baseUrl = resolveConsoleBaseUrl(options?.serverBaseUrl);
  const url = `${baseUrl}/api/ui/agents`;
  let payload: ConsoleUiAgentsResponse;
  try {
    payload = await requestJson<ConsoleUiAgentsResponse>(url, {
      method: "GET",
    }, {
      authToken: options?.authToken,
    });
  } catch (error) {
    if (!isRouteNotFoundError(error)) throw error;
    await requestJson<GenericApiResponse>(
      `${baseUrl}/api/sdk/sessions?limit=1`,
      { method: "GET" },
      { authToken: options?.authToken },
    );
    return buildSingleGatewayAgent(baseUrl);
  }
  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Agent 列表失败");
  }
  return payload;
}

/**
 * 拉取指定 Agent 可用的 Session 列表。
 */
export async function fetchSessionOptions(
  agentId: string,
  options?: ApiRequestOptions,
): Promise<SessionOption[]> {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return [];

  const url = `${resolveConsoleBaseUrl(options?.serverBaseUrl)}/api/dashboard/sessions?agent=${encodeURIComponent(normalizedAgentId)}&limit=500`;
  const payload = await requestJson<TuiContextsResponse>(url, {
    method: "GET",
  }, {
    authToken: options?.authToken,
  });

  if (payload.success !== true) {
    throw new Error(payload.error || "加载 Session 列表失败");
  }

  const contexts = Array.isArray(payload.sessions) ? payload.sessions : [];
  const seen = new Set<string>();
  const outOptions: SessionOption[] = [];

  for (const item of contexts) {
    const option = toSessionOption(item);
    if (!option) continue;
    if (seen.has(option.sessionId)) continue;
    seen.add(option.sessionId);
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
 * 拉取 Server 模型池中的可用模型。
 */
export async function fetchModelOptions(
  options?: ApiRequestOptions,
): Promise<ConsoleModelOption[]> {
  const url = `${resolveConsoleBaseUrl(options?.serverBaseUrl)}/api/ui/model/pool`;
  const payload = await requestJson<ConsoleModelPoolResponse>(
    url,
    {
      method: "GET",
    },
    {
      authToken: options?.authToken,
    },
  );
  if (payload.success !== true) {
    throw new Error(payload.error || "加载模型列表失败");
  }

  const models = Array.isArray(payload.models) ? payload.models : [];
  return models
    .filter((item) => item && item.isPaused !== true)
    .sort((a, b) => String(a.id || "").localeCompare(String(b.id || ""), "zh-CN"));
}

/**
 * 投递 Agent 任务。
 *
 * 关键点（中文）：
 * - Popup 侧必须拿到明确 HTTP 成功后，才能提示“发送成功”。
 * - 避免把网络错误、鉴权错误、运行时 5xx 误报成“已发送”。
 * - 继续保留 `keepalive`，尽量降低弹窗关闭带来的请求中断概率。
 */
export async function executeAgentTask(params: {
  serverBaseUrl?: string;
  agentId: string;
  sessionId: string;
  authToken?: string;
  body: TuiContextExecuteRequestBody;
}): Promise<void> {
  const agentId = String(params.agentId || "").trim();
  const sessionId = String(params.sessionId || "").trim();
  if (!agentId) {
    throw new Error("缺少目标 Agent");
  }
  if (!sessionId) {
    throw new Error("缺少目标 Session");
  }

  const url = `${resolveConsoleBaseUrl(params.serverBaseUrl)}/api/dashboard/sessions/${encodeURIComponent(sessionId)}/execute?agent=${encodeURIComponent(agentId)}`;
  const payload = await requestJson<GenericApiResponse>(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
      keepalive: true,
    },
    {
      authToken: params.authToken,
    },
  );

  if (payload.success !== true) {
    throw new Error(
      String(payload.error || payload.message || "任务投递失败，请稍后重试"),
    );
  }
}
