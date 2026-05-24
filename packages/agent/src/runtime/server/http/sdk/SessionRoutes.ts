/**
 * SDK HTTP session 路由。
 *
 * 关键点（中文）
 * - 这组路由面向 `RemoteAgent`，只暴露最小 Session actor 使用面。
 * - 当前公开输入收口到 `prompt()`，公开输出收口到 `events` 长连接。
 * - 不复用 control API 的控制台语义，避免 transport 面混入非 SDK 约束。
 */

import { Hono } from "hono";
import type { AgentCore } from "@/core/AgentCore.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type { AgentSessionEvent } from "@/types/sdk/AgentSessionEvent.js";

const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";
const SDK_EVENTS_READY_FRAME = {
  type: "sdk-events-ready",
} as const;

/**
 * 注册 SDK session 路由。
 */
export function registerSdkSessionRoutes(
  app: Hono,
  core: Pick<AgentCore, "session" | "sessions">,
): void {
  app.get("/api/sdk/sessions", async (c) => {
    try {
      const sessions = await core.sessions();
      return c.json({
        success: true,
        sessions,
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/sdk/sessions", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        sessionId?: unknown;
      };
      const rawSessionId = String(body.sessionId || "").trim();
      const session = await core.session(rawSessionId || undefined);
      return c.json({
        success: true,
        session: await session.toMetadata(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/sdk/sessions/:sessionId/prompt", async (c) => {
    try {
      const sessionId = String(c.req.param("sessionId") || "").trim();
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      const body = (await c.req.json()) as AgentSessionPromptInput;
      const session = await core.session(sessionId);
      const turn = await session.prompt(body);
      return c.json({
        success: true,
        turn: {
          id: turn.id,
        },
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.get("/api/sdk/sessions/:sessionId/events", async (c) => {
    const sessionId = String(c.req.param("sessionId") || "").trim();
    if (!sessionId) {
      return c.json({ success: false, error: "Missing sessionId" }, 400);
    }

    try {
      const session = await core.session(sessionId);
      const encoder = new TextEncoder();
      const requestSignal = c.req.raw.signal;

      let cleanupEventsConnection = (): void => {};
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cleanupEventsConnection();
        },
        start(controller) {
          const writeLine = (value: unknown): void => {
            controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
          };

          const unsubscribe = session.subscribe((event) => {
            writeLine(event);
          });

          const closeStream = (): void => {
            cleanupEventsConnection();
            try {
              controller.close();
            } catch {
              // ignore duplicate close attempts
            }
          };

          cleanupEventsConnection = (): void => {
            unsubscribe();
            requestSignal.removeEventListener("abort", closeStream);
          };

          if (requestSignal.aborted) {
            closeStream();
            return;
          }

          requestSignal.addEventListener("abort", closeStream, { once: true });
          writeLine(SDK_EVENTS_READY_FRAME);
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": NDJSON_CONTENT_TYPE,
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.get("/api/sdk/sessions/:sessionId/messages", async (c) => {
    try {
      const sessionId = String(c.req.param("sessionId") || "").trim();
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      const session = await core.session(sessionId);
      return c.json({
        success: true,
        messages: await session.history(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.get("/api/sdk/sessions/:sessionId/system", async (c) => {
    try {
      const sessionId = String(c.req.param("sessionId") || "").trim();
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      const session = await core.session(sessionId);
      return c.json({
        success: true,
        system: await session.system(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/api/sdk/sessions/:sessionId/fork", async (c) => {
    try {
      const sessionId = String(c.req.param("sessionId") || "").trim();
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      const body = (await c.req.json().catch(() => ({}))) as {
        messageId?: unknown;
      };
      const session = await core.session(sessionId);
      const forked = await session.fork(
        String(body.messageId || "").trim() || undefined,
      );
      return c.json({
        success: true,
        session: await forked.toMetadata(),
      });
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });
}
