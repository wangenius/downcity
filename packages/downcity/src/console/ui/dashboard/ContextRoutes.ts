/**
 * Dashboard 上下文路由。
 *
 * 关键点（中文）
 * - 聚合 contexts/messages/archives/system-prompt/execute 相关接口。
 * - 仅负责编排请求与响应；消息读取、时间线映射、执行拼装复用 helper。
 */

import type { SystemModelMessage } from "ai";
import fs from "fs-extra";
import { dirname } from "path";
import { resolveAgentSystemMessages } from "@agent/prompts/system/SystemDomain.js";
import {
  getShipChatHistoryPath,
  getShipContextMessagesArchiveDirPath,
  getShipContextMessagesArchivePath,
  getShipContextMessagesPath,
} from "@/console/env/Paths.js";
import type { DashboardContextExecuteRequestBody } from "@/types/DashboardContextExecute.js";
import type { DashboardRouteRegistrationParams } from "@/types/DashboardRoutes.js";
import { executeByContextId } from "./ExecuteByContext.js";
import {
  decodeMaybe,
  listContextSummaries,
  loadContextMessagesFromFile,
  toLimit,
  toUiMessageTimeline,
} from "./Helpers.js";

const CONSOLEUI_CONTEXT_ID = "consoleui-chat-main";

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
export function registerDashboardContextRoutes(
  params: DashboardRouteRegistrationParams,
): void {
  const { app } = params;

  app.get("/api/dashboard/contexts", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"));
      const executingContextIds = new Set(runtime.contextManager.listExecutingContextIds());
      const contexts = await listContextSummaries({
        projectRoot: runtime.rootPath,
        serviceRuntime: params.getServiceRuntimeState(),
        limit,
        executingContextIds,
      });
      const hasConsoleUiContext = contexts.some(
        (item) => String(item.contextId || "").trim() === CONSOLEUI_CONTEXT_ID,
      );
      const enrichedContexts = hasConsoleUiContext
        ? contexts
        : [
            {
              contextId: CONSOLEUI_CONTEXT_ID,
              messageCount: 0,
              updatedAt: Date.now(),
              lastRole: "system" as const,
              lastText: "consoleui channel",
              channel: "consoleui",
              ...(executingContextIds.has(CONSOLEUI_CONTEXT_ID) ? { executing: true } : {}),
            },
            ...contexts,
          ];
      return c.json({
        success: true,
        contexts: enrichedContexts,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/contexts/:contextId/messages", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 200);
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const filePath = getShipContextMessagesPath(runtime.rootPath, contextId);
      const messages = await loadContextMessagesFromFile(filePath);
      const sliced = messages
        .slice(-limit)
        .flatMap((message) => toUiMessageTimeline(message));
      return c.json({
        success: true,
        contextId,
        total: sliced.length,
        rawTotal: messages.length,
        messages: sliced,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/contexts/:contextId/messages", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const messagesPath = getShipContextMessagesPath(runtime.rootPath, contextId);
      const messagesDirPath = dirname(messagesPath);
      await fs.remove(messagesDirPath);
      // 关键点（中文）：清理消息文件后，同步清掉内存中的 agent，避免旧上下文继续运行。
      runtime.contextManager.clearAgent(contextId);

      return c.json({
        success: true,
        contextId,
        cleared: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.delete("/api/dashboard/contexts/:contextId/chat-history", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const historyPath = getShipChatHistoryPath(runtime.rootPath, contextId);
      await fs.remove(historyPath);

      return c.json({
        success: true,
        contextId,
        cleared: true,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/contexts/:contextId/archives", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const limit = toLimit(c.req.query("limit"), 100);
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }

      const archiveDirPath = getShipContextMessagesArchiveDirPath(
        runtime.rootPath,
        contextId,
      );
      if (!(await fs.pathExists(archiveDirPath))) {
        return c.json({
          success: true,
          contextId,
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

        const archivePath = getShipContextMessagesArchivePath(
          runtime.rootPath,
          contextId,
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
        contextId,
        archives: archives.slice(0, limit),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.get("/api/dashboard/contexts/:contextId/archives/:archiveId", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      const archiveId = decodeMaybe(String(c.req.param("archiveId") || "").trim());
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }
      if (!archiveId) {
        return c.json({ success: false, error: "Missing archiveId" }, 400);
      }

      const archivePath = getShipContextMessagesArchivePath(
        runtime.rootPath,
        contextId,
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
        contextId,
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
      const runtime = params.getRuntimeState();
      const contextId =
        decodeMaybe(String(c.req.query("contextId") || "").trim()) ||
        CONSOLEUI_CONTEXT_ID;
      const systemMessages = await resolveAgentSystemMessages({
        projectRoot: runtime.rootPath,
        contextId,
        requestId: `ui-system-preview-${Date.now()}`,
        profile: "chat",
        staticSystemPrompts: runtime.systems,
        runtime: params.getServiceRuntimeState(),
      });
      return c.json({
        success: true,
        contextId,
        ...toSystemPromptPayload(systemMessages),
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  app.post("/api/dashboard/contexts/:contextId/execute", async (c) => {
    try {
      const runtime = params.getRuntimeState();
      const contextId = decodeMaybe(String(c.req.param("contextId") || "").trim());
      const body = (await c.req.json().catch(() => ({}))) as Partial<DashboardContextExecuteRequestBody>;
      const instructions = String(body.instructions || "").trim();
      if (!contextId) {
        return c.json({ success: false, error: "Missing contextId" }, 400);
      }
      if (!instructions) {
        return c.json({ success: false, error: "Missing instructions" }, 400);
      }

      const result = await executeByContextId({
        runtime,
        serviceRuntime: params.getServiceRuntimeState(),
        contextId,
        instructions,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
      });
      return c.json({
        success: true,
        contextId,
        result,
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });
}
