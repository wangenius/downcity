/**
 * 执行入口路由模块。
 *
 * 职责说明：
 * 1. 接收 `/api/execute` 请求。
 * 2. 完成请求解析、context 注入、agent 执行与结果回写。
 * 3. 统一处理接口层错误返回。
 */

import { Hono } from "hono";
import { drainDeferredPersistedUserMessages } from "@agent/context/manager/RequestContext.js";
import { getRuntimeState } from "@agent/context/manager/RuntimeState.js";
import { pickLastSuccessfulChatSendText } from "@services/chat/runtime/UserVisibleText.js";

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
    const contextId = `api:chat:${chatId}`;
    const runtime = getRuntimeState();
    await runtime.contextManager.appendUserMessage({
      contextId,
      text: String(instructions),
    });

    const result = await runtime.contextManager.run({
      contextId,
      query: String(instructions),
    });

    const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage);
    try {
      await runtime.contextManager.appendAssistantMessage({
        contextId,
        message: result.assistantMessage,
        fallbackText: userVisible,
        extra: {
          via: "api_execute",
          note: "assistant_message_missing",
          actorId,
        },
      });
      const deferredInjectedMessages = drainDeferredPersistedUserMessages(
        contextId,
      );
      for (const message of deferredInjectedMessages) {
        await runtime.contextManager.appendUserMessage({
          contextId,
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
