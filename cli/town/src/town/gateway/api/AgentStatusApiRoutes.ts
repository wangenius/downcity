/**
 * 平台 Agent 状态探活路由。
 *
 * 关键点（中文）
 * - 启动窗口期的 agent 状态探测放到 UI 网关内部执行，避免浏览器直接看到 500/503 噪音。
 * - 该接口始终返回 200 + 结构化状态，前端按状态轮询即可。
 * - ready 判定收敛在这里，保持前端逻辑尽量薄。
 */

import type { Hono } from "hono";
import type { PlatformAgentOption } from "@downcity/agent";
import type { AgentRpcPool } from "../AgentRpcPool.js";

type AgentStatusPayload = {
  success: boolean;
  running: boolean;
  serverReady: boolean;
  pluginsReady: boolean;
  hasChatPlugin: boolean;
  reason?: string;
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

async function probeSelectedAgentStatus(
  selectedAgent: PlatformAgentOption,
  agentRpcPool: AgentRpcPool,
): Promise<AgentStatusPayload> {
  if (!selectedAgent.running) {
    return {
      success: true,
      running: false,
      serverReady: false,
      pluginsReady: false,
      hasChatPlugin: false,
      reason: "Selected agent endpoint is unavailable.",
    };
  }

  const client = agentRpcPool.resolveClientForAgent(selectedAgent);
  if (!client) {
    return {
      success: true,
      running: false,
      serverReady: false,
      pluginsReady: false,
      hasChatPlugin: false,
      reason: "Selected agent RPC endpoint is unavailable.",
    };
  }

  try {
    await client.get_internal_status();
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: false,
      pluginsReady: false,
      hasChatPlugin: false,
      reason: getErrorMessage(error),
    };
  }

  let pluginList: Array<{ name?: unknown; state?: unknown }>;
  try {
    pluginList = await client.list_internal_plugin_states();
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: false,
      hasChatPlugin: false,
      reason: getErrorMessage(error),
    };
  }

  if (pluginList.length === 0) {
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: false,
      hasChatPlugin: false,
      reason: "Plugin runtime list is empty.",
    };
  }

  const allReady = pluginList.every((item) => isReadyState(item.state));
  const hasChatPlugin = pluginList.some((item) => {
    const name = String(item.name || "").trim().toLowerCase();
    return name === "chat";
  });
  if (!allReady) {
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: false,
      hasChatPlugin,
      reason: "Plugins are still starting.",
    };
  }

  if (!hasChatPlugin) {
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: true,
      hasChatPlugin: false,
    };
  }

  try {
    await client.run_internal_plugin_command({
      plugin_name: "chat",
      command: "status",
      payload: {},
    });
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: true,
      hasChatPlugin: true,
    };
  } catch (error) {
    return {
      success: true,
      running: true,
      serverReady: true,
      pluginsReady: false,
      hasChatPlugin: true,
      reason: getErrorMessage(error),
    };
  }
}

/**
 * 注册 Agent 状态探活 API 路由。
 */
export function registerPlatformAgentStatusRoutes(params: {
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
  resolveSelectedAgent: (requestedAgentId: string) => Promise<PlatformAgentOption | null>;
  /** Town 维护的 Agent RPC 连接池。 */
  agentRpcPool: AgentRpcPool;
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
          pluginsReady: false,
          hasChatPlugin: false,
          reason: "No running agent selected.",
        } satisfies AgentStatusPayload);
      }
      return c.json(await probeSelectedAgentStatus(selectedAgent, params.agentRpcPool));
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
