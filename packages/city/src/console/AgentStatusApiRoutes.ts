/**
 * Console Agent 状态探活路由。
 *
 * 关键点（中文）
 * - 启动窗口期的 agent 状态探测放到 UI 网关内部执行，避免浏览器直接看到 500/503 噪音。
 * - 该接口始终返回 200 + 结构化状态，前端按状态轮询即可。
 * - ready 判定收敛在这里，保持前端逻辑尽量薄。
 */

import type { Hono } from "hono";
import type { ConsoleAgentOption } from "@/shared/types/Console.js";

type AgentStatusPayload = {
  success: boolean;
  running: boolean;
  serverReady: boolean;
  servicesReady: boolean;
  hasChatService: boolean;
  reason?: string;
};

type ServicesResponse = {
  success?: boolean;
  services?: Array<{
    name?: unknown;
    state?: unknown;
  }>;
  error?: unknown;
  message?: unknown;
};

type ChatStatusResponse = {
  success?: boolean;
  error?: unknown;
  message?: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error);
}

function isReadyState(input: unknown): boolean {
  const state = String(input || "").trim().toLowerCase();
  return ["running", "ok", "active", "enabled", "success", "idle"].includes(state);
}

async function fetchStatusJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: unknown;
    message?: unknown;
  };
  if (!response.ok || payload.success === false) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return payload as T;
}

async function probeSelectedAgentStatus(
  selectedAgent: ConsoleAgentOption,
): Promise<AgentStatusPayload> {
  const baseUrl = String(selectedAgent.baseUrl || "").trim();
  if (!selectedAgent.running || !baseUrl) {
    return {
      success: true,
      running: false,
      serverReady: false,
      servicesReady: false,
      hasChatService: false,
      reason: "Selected agent endpoint is unavailable.",
    };
  }

  try {
    await fetchStatusJson<{ status?: string }>(new URL("/api/status", baseUrl).toString());
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: false,
      servicesReady: false,
      hasChatService: false,
      reason: getErrorMessage(error),
    };
  }

  let servicesPayload: ServicesResponse;
  try {
    servicesPayload = await fetchStatusJson<ServicesResponse>(
      new URL("/api/dashboard/services", baseUrl).toString(),
    );
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: false,
      hasChatService: false,
      reason: getErrorMessage(error),
    };
  }

  const serviceList = Array.isArray(servicesPayload.services)
    ? servicesPayload.services
    : [];
  if (serviceList.length === 0) {
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: false,
      hasChatService: false,
      reason: "Service list is empty.",
    };
  }

  const allReady = serviceList.every((item) => isReadyState(item.state));
  const hasChatService = serviceList.some((item) => {
    const name = String(item.name || "").trim().toLowerCase();
    return name === "chat";
  });
  if (!allReady) {
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: false,
      hasChatService,
      reason: "Services are still starting.",
    };
  }

  if (!hasChatService) {
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: true,
      hasChatService: false,
    };
  }

  try {
    await fetchStatusJson<ChatStatusResponse>(
      new URL("/api/services/command", baseUrl).toString(),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          serviceName: "chat",
          command: "status",
          payload: {},
        }),
      },
    );
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: true,
      hasChatService: true,
    };
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: true,
      servicesReady: false,
      hasChatService: true,
      reason: getErrorMessage(error),
    };
  }
}

/**
 * 注册 Agent 状态探活 API 路由。
 */
export function registerConsoleAgentStatusRoutes(params: {
  /**
   * Hono 应用实例。
   */
  app: Hono;
  /**
   * 从请求中读取目标 agent id。
   */
  readRequestedAgentId: (request: Request) => string;
  /**
   * 解析当前应使用的 agent。
   */
  resolveSelectedAgent: (requestedAgentId: string) => Promise<ConsoleAgentOption | null>;
}): void {
  const app = params.app;

  app.get("/api/ui/agents/status", async (c) => {
    try {
      const requestedAgentId = params.readRequestedAgentId(c.req.raw);
      const selectedAgent = await params.resolveSelectedAgent(requestedAgentId);
      if (!selectedAgent) {
        return c.json({
          success: true,
          running: false,
          serverReady: false,
          servicesReady: false,
          hasChatService: false,
          reason: "No running agent selected.",
        } satisfies AgentStatusPayload);
      }
      return c.json(await probeSelectedAgentStatus(selectedAgent));
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
