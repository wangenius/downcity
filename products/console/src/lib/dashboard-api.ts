/**
 * Console Dashboard API 工具。
 *
 * 关键点（中文）
 * - 统一管理 console-ui 侧的 API 路径拼装与 JSON 请求。
 * - 所有非 `/api/ui/*` 请求会自动注入当前选中 agent 参数。
 */

const CONSOLE_AUTH_STORAGE_KEY = "city.console-ui.auth.v1"

/**
 * Console API 错误对象。
 */
export class ConsoleApiError extends Error {
  /**
   * HTTP 状态码。
   */
  status: number

  /**
   * HTTP 状态文本。
   */
  statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.name = "ConsoleApiError"
    this.status = status
    this.statusText = statusText
  }
}

/**
 * 本地认证状态。
 */
export interface ConsoleAuthState {
  /**
   * Bearer Token 明文。
   */
  token: string

  /**
   * 当前用户名。
   */
  username?: string
}

/**
 * Console UI 鉴权状态探测响应。
 */
export interface ConsoleAuthStatusResponse {
  /**
   * 接口是否成功返回。
   */
  success: boolean

  /**
   * 服务端是否已经完成统一账户初始化。
   */
  initialized: boolean

  /**
   * 当前 console-ui 是否应强制进入 Bearer Token 输入流程。
   */
  requireToken: boolean
}

/**
 * 读取本地 Bearer Token。
 */
export function readConsoleAuthState(): ConsoleAuthState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(CONSOLE_AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConsoleAuthState> | null
    const token = String(parsed?.token || "").trim()
    if (!token) return null
    const username = String(parsed?.username || "").trim()
    return {
      token,
      ...(username ? { username } : {}),
    }
  } catch {
    return null
  }
}

/**
 * 写入本地 Bearer Token。
 */
export function writeConsoleAuthState(input: ConsoleAuthState): void {
  if (typeof window === "undefined") return
  const token = String(input.token || "").trim()
  if (!token) return
  const username = String(input.username || "").trim()
  window.localStorage.setItem(
    CONSOLE_AUTH_STORAGE_KEY,
    JSON.stringify({
      token,
      ...(username ? { username } : {}),
    }),
  )
}

/**
 * 清理本地 Bearer Token。
 */
export function clearConsoleAuthState(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(CONSOLE_AUTH_STORAGE_KEY)
}

export function withConsoleAgent(
  path: string,
  selectedAgentId: string,
  preferredAgentId?: string,
): string {
  const rawPath = String(path || "");
  if (!rawPath.startsWith("/api/")) return rawPath;
  if (rawPath.startsWith("/api/ui/")) return rawPath;
  const agentId = preferredAgentId ?? selectedAgentId;
  if (!agentId) return rawPath;
  const url = new URL(rawPath, window.location.origin);
  url.searchParams.set("agent", agentId);
  return `${url.pathname}${url.search}`;
}

export async function requestConsoleApiJson<T>(params: {
  path: string;
  selectedAgentId: string;
  preferredAgentId?: string;
  options?: RequestInit;
}): Promise<T> {
  const authState = readConsoleAuthState()
  const headers = new Headers(params.options?.headers)
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (authState?.token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authState.token}`)
  }
  const response = await fetch(
    withConsoleAgent(params.path, params.selectedAgentId, params.preferredAgentId),
    {
      ...(params.options || {}),
      headers,
    },
  );

  const raw = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorMessage =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : `${response.status} ${response.statusText}`;
    throw new ConsoleApiError(errorMessage, response.status, response.statusText);
  }

  if (body && body.success === false) {
    const failMessage =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : "request failed";
    throw new ConsoleApiError(failMessage, response.status, response.statusText);
  }

  if (body === null) {
    throw new ConsoleApiError(
      `Invalid JSON response from ${params.path}`,
      response.status,
      response.statusText,
    );
  }

  return body as T;
}

export const dashboardApiRoutes = {
  authStatus: () => "/api/auth/status",
  authMe: () => "/api/auth/me",
  authTokenList: () => "/api/auth/token/list",
  authTokenCreate: () => "/api/auth/token/create",
  authTokenDelete: () => "/api/auth/token/delete",
  uiAgents: (agentId?: string) =>
    agentId
      ? `/api/ui/agents?agent=${encodeURIComponent(agentId)}`
      : "/api/ui/agents",
  uiAgentRuntimeStatus: (agentId: string) =>
    `/api/ui/agents/runtime-status?agent=${encodeURIComponent(agentId)}`,
  uiLocalModels: () => "/api/ui/local-models",
  uiPlugins: (agentId?: string) =>
    agentId
      ? `/api/ui/plugins?agent=${encodeURIComponent(agentId)}`
      : "/api/ui/plugins",
  uiPluginsAction: () => "/api/ui/plugins/action",
  uiModel: (agentId?: string) =>
    agentId
      ? `/api/ui/model?agent=${encodeURIComponent(agentId)}`
      : "/api/ui/model",
  uiModelSwitch: (agentId: string) =>
    `/api/ui/model/switch?agent=${encodeURIComponent(agentId)}`,
  uiConfigStatus: (agentId?: string) =>
    agentId
      ? `/api/ui/config-status?agent=${encodeURIComponent(agentId)}`
      : "/api/ui/config-status",
  uiAgentEnv: (agentId: string) =>
    `/api/ui/env?scope=agent&agent=${encodeURIComponent(agentId)}`,
  overview: (sessionLimit = 40) =>
    `/api/dashboard/overview?sessionLimit=${encodeURIComponent(String(sessionLimit))}`,
  workboardSnapshot: () => "/api/workboard/snapshot",
  services: () => "/api/dashboard/services",
  sessions: (limit = 120) =>
    `/api/dashboard/sessions?limit=${encodeURIComponent(String(limit))}`,
  sessionMessages: (sessionId: string, limit = 100) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/messages?limit=${encodeURIComponent(String(limit))}`,
  sessionArchives: (sessionId: string, limit = 80) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/archives?limit=${encodeURIComponent(String(limit))}`,
  sessionArchiveDetail: (sessionId: string, archiveId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/archives/${encodeURIComponent(archiveId)}`,
  sessionExecute: (sessionId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/execute`,
  sessionClearMessages: (sessionId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/messages`,
  sessionClearChatHistory: (sessionId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/chat-history`,
  systemPrompt: (sessionId: string) =>
    `/api/dashboard/system-prompt?sessionId=${encodeURIComponent(sessionId)}`,
  tasks: () => "/api/dashboard/tasks",
  taskRun: () => "/api/dashboard/tasks/run",
  taskStatus: (title: string) =>
    `/api/dashboard/tasks/${encodeURIComponent(title)}/status`,
  taskDetail: (title: string) =>
    `/api/dashboard/tasks/${encodeURIComponent(title)}`,
  taskRuns: (title: string, limit = 50) =>
    `/api/dashboard/tasks/${encodeURIComponent(title)}/runs?limit=${encodeURIComponent(String(limit))}`,
  taskRunDetail: (title: string, timestamp: string) =>
    `/api/dashboard/tasks/${encodeURIComponent(title)}/runs/${encodeURIComponent(timestamp)}`,
  logs: (limit = 260) =>
    `/api/dashboard/logs?limit=${encodeURIComponent(String(limit))}`,
  authorization: () => "/api/dashboard/authorization",
  authorizationConfig: () => "/api/dashboard/authorization/config",
  authorizationAction: () => "/api/dashboard/authorization/action",
  localMessages: (sessionId: string, limit = 80) =>
    `/api/dashboard/sessions/${encodeURIComponent(sessionId)}/messages?limit=${encodeURIComponent(String(limit))}`,
  servicesCommand: () => "/api/services/command",
  servicesControl: () => "/api/services/control",
  pluginsAction: () => "/api/plugins/action",
  uiModelPool: () => "/api/ui/model/pool",
  uiEnv: () => "/api/ui/env",
  uiChannelAccounts: () => "/api/ui/channel-accounts",
  uiAgentStart: () => "/api/ui/agents/start",
  uiAgentCreate: () => "/api/ui/agents/create",
  uiAgentInspect: () => "/api/ui/agents/inspect",
  uiAgentExecution: () => "/api/ui/agents/execution",
  uiPickDirectory: () => "/api/ui/system/pick-directory",
  uiAgentRestart: () => "/api/ui/agents/restart",
  uiAgentStop: () => "/api/ui/agents/stop",
  uiCommandExecute: () => "/api/ui/command/execute",
  uiModelProviderUpsert: () => "/api/ui/model/provider/upsert",
  uiModelProviderRemove: () => "/api/ui/model/provider/remove",
  uiModelProviderTest: () => "/api/ui/model/provider/test",
  uiModelProviderDiscover: () => "/api/ui/model/provider/discover",
  uiModelItemUpsert: () => "/api/ui/model/model/upsert",
  uiModelItemRemove: () => "/api/ui/model/model/remove",
  uiModelItemPause: () => "/api/ui/model/model/pause",
  uiModelItemTest: () => "/api/ui/model/model/test",
  uiChannelAccountUpsert: () => "/api/ui/channel-accounts/upsert",
  uiChannelAccountProbe: () => "/api/ui/channel-accounts/probe",
  uiChannelAccountRemove: () => "/api/ui/channel-accounts/remove",
  uiEnvUpsert: () => "/api/ui/env/upsert",
  uiEnvImport: () => "/api/ui/env/import",
  uiEnvRemove: () => "/api/ui/env/remove",
} as const;
