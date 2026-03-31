/**
 * Dashboard 会话路由。
 *
 * 关键点（中文）
 * - 聚合 sessions/messages/archives/system-prompt/execute 相关接口。
 * - 仅负责编排请求与响应；消息读取、时间线映射、执行拼装复用 helper。
 */

import type { SystemModelMessage } from "ai";
import fs from "fs-extra";
import { dirname } from "path";
import { resolveSessionSystemMessages } from "@sessions/prompts/system/SystemDomain.js";
import {
  getDowncityChatHistoryPath,
  getDowncitySessionMessagesArchiveDirPath,
  getDowncitySessionMessagesArchivePath,
  getDowncitySessionMessagesPath,
} from "@/main/env/Paths.js";
import type { DashboardSessionExecuteRequestBody } from "@/types/DashboardSessionExecute.js";
import type { DashboardRouteRegistrationParams } from "@/types/DashboardRoutes.js";
import {
  decodeMaybe,
  listSessionSummaries,
  loadSessionMessagesFromFile,
  toLimit,
  toUiMessageTimeline,
} from "./Helpers.js";
import { executeBySessionId } from "./ExecuteBySession.js";
const CONSOLEUI_SESSION_ID = "consoleui-chat-main";

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

function toSystemMessageText(message: SystemModelMessage): string {
  const content = message.content as unknown;
  if (typeof content === "string") return normalizeSystemText(content);
  if (!Array.isArray(content)) return "";
  const parts = content as Array<{ text?: unknown }>;
  const texts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const text = normalizeSystemText(String(part.text || ""));
    if (!text) continue;
    texts.push(text);
  }
  return texts.join("\n").trim();
}

/**
 * 把 system messages 转成 dashboard 可渲染结构。
 */
function toSystemPromptPayload(messages: SystemModelMessage[]): {
  sections: Array<{
    key: string;
    title: string;
    items: Array<{ index: number; content: string }>;
  }>;
  totalMessages: number;
  totalChars: number;
} {
  const items = messages
    .map((message, index) => ({
      index: index + 1,
      content: toSystemMessageText(message),
    }))
    .filter((item) => item.content);
  const totalChars = items.reduce(
    (acc, item) => acc + String(item.content || "").length,
    0,
  );
  return {
    sections: [
      {
        key: "resolved",
        title: "Resolved System Messages",
        items,
      },
    ],
    totalMessages: items.length,
    totalChars,
  };
}

/**
 * 注册上下文相关路由。
 */
export function registerDashboardSessionRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/sessions", async (c) => {
    try {
      const runtime = params.getAgentState();
      const limit = toLimit(c.req.query("limit"));
      const executingSessionIds = new Set(
        runtime.sessionStore.listExecutingSessionIds(),
      );
      const sessions = await listSessionSummaries({
        projectRoot: runtime.rootPath,
        executionContext: params.getExecutionContext(),
        limit,
        executingSessionIds,
      });
      const hasConsoleUiSession = sessions.some(
        (item) => String(item.sessionId || "").trim() === CONSOLEUI_SESSION_ID,
      );
      const enrichedSessions = hasConsoleUiSession
        ? sessions
        : [
            {
              sessionId: CONSOLEUI_SESSION_ID,
              messageCount: 0,
              updatedAt: Date.now(),
              lastRole: "system" as const,
              lastText: "consoleui channel",
              channel: "consoleui",
              ...(executingSessionIds.has(CONSOLEUI_SESSION_ID) ? { executing: true } : {}),
            },
            ...sessions,
          ];
      return c.json({
        success: true,
        sessions: enrichedSessions,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/messages", async (c) => {
    try {
      const runtime = params.getAgentState();
      const limit = toLimit(c.req.query("limit"), 200);
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }

      const filePath = getDowncitySessionMessagesPath(runtime.rootPath, sessionId);
      const messages = await loadSessionMessagesFromFile(filePath);
      const sliced = messages
        .slice(-limit)
        .flatMap((message) => toUiMessageTimeline(message));
      return c.json({
        success: true,
        sessionId,
        total: sliced.length,
        rawTotal: messages.length,
        messages: sliced,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/sessions/:sessionId/messages", async (c) => {
    try {
      const runtime = params.getAgentState();
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }

      const messagesPath = getDowncitySessionMessagesPath(runtime.rootPath, sessionId);
      const messagesDirPath = dirname(messagesPath);
      await fs.remove(messagesDirPath);
      // 关键点（中文）：清理消息文件后，同步清掉内存中的 session runtime，避免旧上下文继续运行。
      runtime.sessionStore.clearRuntime(sessionId);

      return c.json({
        success: true,
        sessionId,
        cleared: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/sessions/:sessionId/chat-history", async (c) => {
    try {
      const runtime = params.getAgentState();
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }

      const historyPath = getDowncityChatHistoryPath(runtime.rootPath, sessionId);
      await fs.remove(historyPath);

      return c.json({
        success: true,
        sessionId,
        cleared: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/archives", async (c) => {
    try {
      const runtime = params.getAgentState();
      const limit = toLimit(c.req.query("limit"), 100);
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }

      const archiveDirPath = getDowncitySessionMessagesArchiveDirPath(
        runtime.rootPath,
        sessionId,
      );
      if (!(await fs.pathExists(archiveDirPath))) {
        return c.json({
          success: true,
          sessionId,
          archives: [],
        });
      }

      const entries = await fs.readdir(archiveDirPath, { withFileTypes: true });
      const archives: Array<{
        archiveId: string;
        archivedAt?: number;
        messageCount: number;
      }> = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const archiveId = decodeMaybe(entry.name.slice(0, -5));
        if (!archiveId) continue;

        const archivePath = getDowncitySessionMessagesArchivePath(
          runtime.rootPath,
          sessionId,
          archiveId,
        );
        const payload = (await fs.readJson(archivePath).catch(() => null)) as
          | {
              archivedAt?: unknown;
              messages?: unknown;
            }
          | null;
        const archivedAtFromPayload =
          typeof payload?.archivedAt === "number" &&
          Number.isFinite(payload.archivedAt)
            ? payload.archivedAt
            : undefined;
        const archivedAtFromStat =
          typeof archivedAtFromPayload === "number"
            ? undefined
            : await fs
                .stat(archivePath)
                .then((stat) => stat.mtimeMs)
                .catch(() => undefined);
        const messageCount = Array.isArray(payload?.messages)
          ? payload.messages.length
          : 0;

        archives.push({
          archiveId,
          ...(typeof archivedAtFromPayload === "number"
            ? { archivedAt: archivedAtFromPayload }
            : typeof archivedAtFromStat === "number"
              ? { archivedAt: archivedAtFromStat }
              : {}),
          messageCount,
        });
      }

      archives.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));

      return c.json({
        success: true,
        sessionId,
        archives: archives.slice(0, limit),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/sessions/:sessionId/archives/:archiveId", async (c) => {
    try {
      const runtime = params.getAgentState();
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      const archiveId = decodeMaybe(String(c.req.param("archiveId") || "").trim());
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      if (!archiveId) {
        return c.json({ success: false, error: "Missing archiveId" }, 400);
      }

      const archivePath = getDowncitySessionMessagesArchivePath(
        runtime.rootPath,
        sessionId,
        archiveId,
      );
      if (!(await fs.pathExists(archivePath))) {
        return c.json(
          { success: false, error: `Archive not found: ${archiveId}` },
          404,
        );
      }

      const payload = (await fs.readJson(archivePath).catch(() => null)) as
        | {
            archivedAt?: unknown;
            messages?: unknown;
          }
        | null;
      const archivedAt =
        typeof payload?.archivedAt === "number" &&
        Number.isFinite(payload.archivedAt)
          ? payload.archivedAt
          : undefined;
      const archivedMessages = Array.isArray(payload?.messages)
        ? payload.messages
        : [];
      const messages = archivedMessages.flatMap((message) =>
        toUiMessageTimeline(message as Parameters<typeof toUiMessageTimeline>[0]),
      );

      return c.json({
        success: true,
        sessionId,
        archiveId,
        ...(typeof archivedAt === "number" ? { archivedAt } : {}),
        total: messages.length,
        rawTotal: archivedMessages.length,
        messages,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/system-prompt", async (c) => {
    try {
      const runtime = params.getAgentState();
      const sessionId =
        decodeMaybe(String(c.req.query("sessionId") || "").trim()) ||
        CONSOLEUI_SESSION_ID;
      const systemMessages = await resolveSessionSystemMessages({
        projectRoot: runtime.rootPath,
        sessionId,
        requestId: `ui-system-preview-${Date.now()}`,
        profile: "chat",
        staticSystemPrompts: runtime.systems,
        runtime: params.getExecutionContext(),
      });
      return c.json({
        success: true,
        sessionId,
        ...toSystemPromptPayload(systemMessages),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/sessions/:sessionId/execute", async (c) => {
    try {
      const runtime = params.getAgentState();
      const sessionId = decodeMaybe(String(c.req.param("sessionId") || "").trim());
      const body = (await c.req.json().catch(() => ({}))) as Partial<DashboardSessionExecuteRequestBody>;
      const instructions = String(body.instructions || "").trim();
      if (!sessionId) {
        return c.json({ success: false, error: "Missing sessionId" }, 400);
      }
      if (!instructions) {
        return c.json({ success: false, error: "Missing instructions" }, 400);
      }

      const result = await executeBySessionId({
        runtime,
        executionContext: params.getExecutionContext(),
        sessionId,
        instructions,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      });
      return c.json({
        success: true,
        sessionId,
        result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
