/**
 * 执行入口路由模块。
 *
 * 职责说明：
 * 1. 接收 `/api/execute` 请求。
 * 2. 完成请求解析、context 注入、agent 执行与结果回写。
 * 3. 统一处理接口层错误返回。
 */

import { Hono } from "hono";
import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";

/**
 * 执行入口路由参数。
 */
type ExecuteRouterOptions = {
  /**
   * 读取当前 agent runtime。
   */
  getAgentRuntime: () => AgentRuntime;
};

/**
 * 创建执行入口路由。
 */
export function createExecuteRouter(
  options: ExecuteRouterOptions,
): Hono {
  const router = new Hono();

  router.post("/api/execute", async (c) => {
    let bodyText = "";
    try {
      bodyText = await c.req.text();
    } catch {
      return c.json(
        { success: false, message: "Unable to read request body" },
        400,
      );
    }

    if (!bodyText) {
      return c.json({ success: false, message: "Request body is empty" }, 400);
    }

    let body: {
      instructions?: string;
      chatId?: string;
      userId?: string;
      actorId?: string;
      messageId?: string;
    };
    try {
      body = JSON.parse(bodyText) as typeof body;
    } catch {
      return c.json(
        {
          success: false,
          message: `JSON parse failed: ${bodyText.substring(0, 50)}...`,
        },
        400,
      );
    }

    const instructions = body?.instructions;
    const chatId =
      typeof body?.chatId === "string" && body.chatId.trim()
        ? body.chatId.trim()
        : "default";
    if (!instructions) {
      return c.json(
        { success: false, message: "Missing instructions field" },
        400,
      );
    }

    try {
      const sessionId = `api:chat:${chatId}`;
      const agentState = options.getAgentRuntime();
      const session = agentState.getSession(sessionId);
      const turn = await session.prompt({
        query: String(instructions),
      });
      const result = await turn.finished;

      return c.json({
        success: result.success,
        ...(result.error ? { error: result.error } : {}),
        assistantMessage: result.assistantMessage,
      });
    } catch (error) {
      return c.json({ success: false, message: String(error) }, 500);
    }
  });

  return router;
}
