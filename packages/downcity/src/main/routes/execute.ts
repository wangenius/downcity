/**
 * 执行入口路由模块。
 *
 * 职责说明：
 * 1. 接收 `/api/execute` 请求。
 * 2. 完成请求解析、context 注入、agent 执行与结果回写。
 * 3. 统一处理接口层错误返回。
 */

import { Hono } from "hono";
import { drainDeferredPersistedUserMessages } from "@sessions/RequestContext.js";
import { getAgentRuntime } from "@agent/AgentRuntime.js";
import {
  hasPersistedAssistantSteps,
  pickLastSuccessfulChatSendText,
} from "@services/chat/runtime/UserVisibleText.js";

/**
 * 执行入口路由。
 */
export const executeRouter = new Hono();

executeRouter.post("/api/execute", async (c) => {
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
  const actorId =
    typeof body?.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : typeof body?.actorId === "string" && body.actorId.trim()
        ? body.actorId.trim()
        : "api";

  if (!instructions) {
    return c.json(
      { success: false, message: "Missing instructions field" },
      400,
    );
  }

  try {
    const sessionId = `api:chat:${chatId}`;
    const runtime = getAgentRuntime();
    await runtime.sessionRegistry.appendUserMessage({
      sessionId,
      text: String(instructions),
    });

    const result = await runtime.sessionRegistry.run({
      sessionId,
      query: String(instructions),
    });

    const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage);
    try {
      if (!hasPersistedAssistantSteps(result.assistantMessage)) {
        await runtime.sessionRegistry.appendAssistantMessage({
          sessionId,
          message: result.assistantMessage,
          fallbackText: userVisible,
          extra: {
            via: "api_execute",
            note: "assistant_message_missing",
            actorId,
          },
        });
      }
      const deferredInjectedMessages = drainDeferredPersistedUserMessages(
        sessionId,
      );
      for (const message of deferredInjectedMessages) {
        await runtime.sessionRegistry.appendUserMessage({
          sessionId,
          message,
        });
      }
    } catch {
      // ignore
    }

    return c.json(result);
  } catch (error) {
    return c.json({ success: false, message: String(error) }, 500);
  }
});
