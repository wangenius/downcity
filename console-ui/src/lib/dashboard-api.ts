/**
 * Console Dashboard API 工具。
 *
 * 关键点（中文）
 * - 统一管理 console-ui 侧的 API 路径拼装与 JSON 请求。
 * - 所有非 `/api/ui/*` 请求会自动注入当前选中 agent 参数。
 */

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
  const response = await fetch(
    withConsoleAgent(params.path, params.selectedAgentId, params.preferredAgentId),
    {
      headers: {
        "Content-Type": "application/json",
        ...(params.options?.headers || {}),
      },
      ...(params.options || {}),
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
    throw new Error(errorMessage);
  }

  if (body && body.success === false) {
    const failMessage =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : "request failed";
    throw new Error(failMessage);
  }

  if (body === null) {
    throw new Error(`Invalid JSON response from ${params.path}`);
  }

  return body as T;
}

export const dashboardApiRoutes = {
  uiAgents: (agentId?: string) =>
    agentId
      ? `/api/ui/agents?agent=${encodeURIComponent(agentId)}`
      : "/api/ui/agents",
  uiAgentRuntimeStatus: (agentId: string) =>
    `/api/ui/agents/runtime-status?agent=${encodeURIComponent(agentId)}`,
  uiPlugins: (agentId: string) =>
    `/api/ui/plugins?agent=${encodeURIComponent(agentId)}`,
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
  overview: (contextLimit = 40) =>
    `/api/dashboard/overview?contextLimit=${encodeURIComponent(String(contextLimit))}`,
  services: () => "/api/dashboard/services",
  sessions: (limit = 120) =>
    `/api/dashboard/sessions?limit=${encodeURIComponent(String(limit))}`,
  contexts: (limit = 120) =>
    `/api/dashboard/sessions?limit=${encodeURIComponent(String(limit))}`,
  sessionMessages: (contextId: string, limit = 100) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/messages?limit=${encodeURIComponent(String(limit))}`,
  sessionArchives: (contextId: string, limit = 80) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/archives?limit=${encodeURIComponent(String(limit))}`,
  sessionArchiveDetail: (contextId: string, archiveId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/archives/${encodeURIComponent(archiveId)}`,
  sessionExecute: (contextId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/execute`,
  sessionClearMessages: (contextId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/messages`,
  sessionClearChatHistory: (contextId: string) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/chat-history`,
  systemPrompt: (contextId: string) =>
    `/api/dashboard/system-prompt?contextId=${encodeURIComponent(contextId)}`,
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
  localMessages: (contextId: string, limit = 80) =>
    `/api/dashboard/sessions/${encodeURIComponent(contextId)}/messages?limit=${encodeURIComponent(String(limit))}`,
  servicesCommand: () => "/api/services/command",
  servicesControl: () => "/api/services/control",
  pluginsAction: () => "/api/plugins/action",
  uiModelPool: () => "/api/ui/model/pool",
  uiEnv: () => "/api/ui/env",
  uiChannelAccounts: () => "/api/ui/channel-accounts",
  uiAgentStart: () => "/api/ui/agents/start",
  uiAgentCreate: () => "/api/ui/agents/create",
  uiAgentInspect: () => "/api/ui/agents/inspect",
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
