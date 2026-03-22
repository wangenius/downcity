/**
 * Console UI Agent Runtime 探活路由。
 *
 * 关键点（中文）
 * - 启动窗口期的 runtime 探测放到 UI 网关内部执行，避免浏览器直接看到 500/503 噪音。
 * - 该接口始终返回 200 + 结构化状态，前端按状态轮询即可。
 * - ready 判定收敛在这里，保持前端逻辑尽量薄。
 */

import type { Hono } from "hono";
import type { ConsoleUiAgentOption } from "@/types/ConsoleUI.js";

type RuntimeStatusPayload = {
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

async function fetchRuntimeJson<T>(input: string, init?: RequestInit): Promise<T> {
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

async function probeSelectedAgentRuntime(
  selectedAgent: ConsoleUiAgentOption,
): Promise<RuntimeStatusPayload> {
  const baseUrl = String(selectedAgent.baseUrl || "").trim();
  if (!selectedAgent.running || !baseUrl) {
    return {
      success: true,
      running: false,
      serverReady: false,
      servicesReady: false,
      hasChatService: false,
      reason: "Selected agent runtime endpoint is unavailable.",
    };
  }

  try {
    await fetchRuntimeJson<{ status?: string }>(new URL("/api/status", baseUrl).toString());
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
    servicesPayload = await fetchRuntimeJson<ServicesResponse>(
      new URL("/api/tui/services", baseUrl).toString(),
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
    await fetchRuntimeJson<ChatStatusResponse>(
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
 * 注册 Agent Runtime 探活 API 路由。
 */
export function registerConsoleUiAgentRuntimeRoutes(params: {
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
  resolveSelectedAgent: (requestedAgentId: string) => Promise<ConsoleUiAgentOption | null>;
}): void {
  const app = params.app;

  app.get("/api/ui/agents/runtime-status", async (c) => {
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
        } satisfies RuntimeStatusPayload);
      }
      return c.json(await probeSelectedAgentRuntime(selectedAgent));
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
